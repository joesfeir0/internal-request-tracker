// Browser journeys use the real app and a temporary database; only Gemini is mocked.
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
backendRequire('reflect-metadata');
const { NestFactory } = backendRequire('@nestjs/core');
const { AppModule } = backendRequire('./dist/app.module');
const { testDatabase } = backendRequire('./test/database-helper.cjs');
let app: any;
let database: any;
test.beforeAll(async () => { database = await testDatabase(); app = await NestFactory.create(AppModule, { logger: false }); await app.listen(3001, '127.0.0.1'); });
test.afterAll(async () => { await app?.close(); await database?.cleanup(); });

test('existing request tracking still saves assigned-handler status and history', async ({ page }) => {
  await page.goto('/#requests');
  await expect(page.getByRole('heading', { name: 'REQ-1001' })).toBeVisible();
  await expect(page.getByTestId('current-status')).toHaveText('NEW');
  await expect(page.getByRole('button', { name: 'Start progress' })).toHaveCount(0);
  await page.getByLabel('Testing workspace').selectOption('handler-001');
  await expect(page.getByRole('heading', { name: 'IT requests' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: /IT inbox/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Start progress' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start progress' }).click();
  await expect(page.getByTestId('current-status')).toHaveText('IN_PROGRESS');
  await expect(page.getByRole('list', { name: 'Status history' }).getByRole('listitem')).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId('current-status')).toHaveText('IN_PROGRESS');
});

test('AI draft is submitted to HR inbox, claimed and answered; requester sees progress', async ({ page }) => {
  const { GeminiClient } = backendRequire('./dist/intake/gemini.client');
  const provider = app.get(GeminiClient);
  const original = provider.transport;
  const key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'browser-test-placeholder';
  provider.transport = async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ suggestedDepartment: 'HR', summary: 'Employment letter requested.', missingInformation: ['When do you need the letter?'], suggestedNextStep: 'Add the date for HR review.' }) }] } }] });
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'What do you need help with?' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Describe your issue' }).fill('I need an employment letter by next Friday.');
    await page.getByRole('button', { name: 'Get AI suggestion' }).click();
    await expect(page.getByRole('region', { name: 'AI suggestion' })).toContainText('Employment letter requested.');
    await expect(page.getByLabel('Draft department')).toHaveValue('HR');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/department-workflow-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Submit to HR' }).click();
    const receipt = page.getByText(/Request submitted: REQ-/);
    await expect(receipt).toBeVisible();
    const id = (await receipt.textContent())!.match(/REQ-[a-f0-9-]+/)![0];
    await page.getByRole('button', { name: 'View my requests' }).click();
    await expect(page.getByRole('heading', { name: id })).toBeVisible();
    await expect(page.locator('.request-overview')).toContainText('Unassigned');
    await page.getByLabel('Testing workspace').selectOption('handler-001');
    await expect(page.getByRole('heading', { name: 'IT requests' })).toBeVisible();
    await expect(page.locator('.queue-item').filter({ hasText: id })).toHaveCount(0);
    await page.getByLabel('Testing workspace').selectOption('handler-002');
    await expect(page.getByRole('heading', { name: 'HR requests' })).toBeVisible();
    await page.locator('.queue-item').filter({ hasText: id }).click();
    await expect(page.getByRole('heading', { name: id })).toBeVisible();
    await page.screenshot({ path: 'test-results/department-inbox-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.screenshot({ path: 'test-results/department-inbox-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Claim request' }).click();
    await expect(page.locator('.request-overview')).toContainText('Assigned handler: You');
    await page.getByLabel('Reply to the requester').fill('We can prepare the letter for Friday.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByRole('list', { name: 'Conversation' })).toContainText('We can prepare the letter for Friday.');
    await page.getByRole('button', { name: 'Start progress' }).click();
    await expect(page.getByTestId('current-status')).toHaveText('IN_PROGRESS');
    // The resolution note is saved with the status change and closes the conversation.
    await page.getByLabel('Resolution note (optional)').fill('Your letter is ready at reception.');
    await page.getByRole('button', { name: 'Mark done' }).click();
    await expect(page.getByTestId('current-status')).toHaveText('DONE');
    await expect(page.getByRole('list', { name: 'Conversation' })).toContainText('Your letter is ready at reception.');
    await expect(page.getByLabel('Reply to the requester')).toHaveCount(0);
    await page.getByLabel('Testing workspace').selectOption('employee-001');
    await page.getByRole('button', { name: 'My requests', exact: true }).click();
    await page.getByRole('group', { name: 'Filter requests' }).getByRole('button', { name: /Done/ }).click();
    await page.locator('.queue-item').filter({ hasText: id }).click();
    await expect(page.getByTestId('current-status')).toHaveText('DONE');
    await expect(page.getByRole('list', { name: 'Conversation' })).toContainText('We can prepare the letter for Friday.');
    await expect(page.getByText('This request is complete and closed.')).toBeVisible();
    const saved = await database.prisma.serviceRequest.findUniqueOrThrow({ where: { id }, include: { comments: true, history: true } });
    expect(saved.department).toBe('HR');
    expect(saved.handlerId).toBe('handler-002');
    expect(saved.comments).toHaveLength(2);
    expect(saved.history).toHaveLength(3);
  } finally { provider.transport = original; if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; }
});

test('AI outage still allows manual submission; another employee is denied the request', async ({ page }) => {
  const { GeminiClient } = backendRequire('./dist/intake/gemini.client');
  const provider = app.get(GeminiClient);
  const original = provider.transport;
  const key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'browser-test-placeholder';
  provider.transport = async () => { throw new TypeError('provider down'); };
  try {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Describe your issue' }).fill('The office printer on floor 2 jams on every page.');
    await page.getByRole('button', { name: 'Get AI suggestion' }).click();
    await expect(page.getByRole('alert')).toContainText('AI could not prepare a draft.');
    // The manual department choice opens by itself; the typed text is kept.
    await page.getByLabel('Draft department').selectOption('IT');
    await expect(page.getByRole('textbox', { name: 'Describe your issue' })).toHaveValue('The office printer on floor 2 jams on every page.');
    await page.getByRole('button', { name: 'Submit to IT' }).click();
    const receipt = page.getByText(/Request submitted: REQ-/);
    await expect(receipt).toBeVisible();
    const id = (await receipt.textContent())!.match(/REQ-[a-f0-9-]+/)![0];

    // A different employee is refused by the server, not just hidden by the UI.
    await page.getByLabel('Testing workspace').selectOption('employee-002');
    await page.getByRole('button', { name: 'My requests', exact: true }).click();
    await expect(page.locator('.queue-item').filter({ hasText: id })).toHaveCount(0);
    await page.getByLabel('Open by reference').fill(id);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Request unavailable or not found.');

    // The second IT handler sees it once Rami has claimed it, but cannot change its status.
    await page.getByLabel('Testing workspace').selectOption('handler-001');
    await page.locator('.queue-item').filter({ hasText: id }).click();
    await page.getByRole('button', { name: 'Claim request' }).click();
    await expect(page.locator('.request-overview')).toContainText('Assigned handler: You');
    await page.getByLabel('Testing workspace').selectOption('handler-004');
    await page.locator('.queue-item').filter({ hasText: id }).click();
    await expect(page.getByText('Assigned to Rami Khoury (IT). You can read and reply, but only the assignee can update its status.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start progress' })).toHaveCount(0);
    const saved = await database.prisma.serviceRequest.findUniqueOrThrow({ where: { id } });
    expect(saved.requesterId).toBe('employee-001');
    expect(saved.department).toBe('IT');
    expect(saved.summary).toBe('The office printer on floor 2 jams on every page.');
  } finally { provider.transport = original; if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; }
});
