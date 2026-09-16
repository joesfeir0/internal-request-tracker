import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
backendRequire('reflect-metadata');
const { NestFactory } = backendRequire('@nestjs/core');
const { AppModule } = backendRequire('./dist/app.module');
const { testDatabase } = backendRequire('./test/database-helper.cjs');

let app: any;
let database: any;
test.beforeAll(async () => {
  database = await testDatabase();
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(3001, '127.0.0.1');
});
test.afterAll(async () => {
  await app?.close();
  await database?.cleanup();
});

test('requester is denied; assigned handler saves status and history through reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'REQ-1001' })).toBeVisible();
  await expect(page.getByLabel('Development actor', { exact: true })).toHaveValue('employee-001');
  await expect(page.getByTestId('current-status')).toHaveText('NEW');
  await expect(page.getByLabel('Service request', { exact: true }).getByRole('option')).toHaveCount(5);
  const history = page.getByRole('list', { name: 'Status history' }).getByRole('listitem');
  await expect(history).toHaveCount(1);

  const denied = page.waitForResponse((response) => response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Start progress' }).click();
  expect((await denied).status()).toBe(403);
  await expect(page.getByRole('alert')).toHaveText("Only the assigned handler can change this request's status.");
  await expect(page.getByTestId('current-status')).toHaveText('NEW');
  await expect(history).toHaveCount(1);

  await page.getByLabel('Development actor', { exact: true }).selectOption('handler-001');
  await expect(page.getByRole('button', { name: 'Start progress' })).toBeEnabled();
  const allowed = page.waitForResponse((response) => response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Start progress' }).click();
  expect((await allowed).status()).toBe(200);
  await expect(page.getByTestId('current-status')).toHaveText('IN_PROGRESS');
  await expect(page.getByRole('status')).toHaveText('Status saved. History updated.');
  await expect(history).toHaveCount(2);
  await expect(history.nth(1)).toContainText('IN_PROGRESS');
  await expect(history.nth(1)).toContainText('handler-001');

  // The additional examples use the same flow and keep independent histories.
  await page.getByLabel('Development actor', { exact: true }).selectOption('handler-001');
  await expect(page.getByLabel('Service request', { exact: true })).toBeEnabled();
  for (const id of ['REQ-1004', 'REQ-1005']) {
    await page.getByLabel('Service request', { exact: true }).selectOption(id);
    await expect(page.getByRole('heading', { name: id })).toBeVisible();
    await expect(page.getByTestId('current-status')).toHaveText('NEW');
    await page.getByRole('button', { name: 'Start progress' }).click();
    await expect(page.getByTestId('current-status')).toHaveText('IN_PROGRESS');
    await expect(history).toHaveCount(2);
  }
  for (const [actor, id] of [['handler-002', 'REQ-1002'], ['handler-003', 'REQ-1003']]) {
    await page.getByLabel('Development actor', { exact: true }).selectOption(actor);
    await expect(page.getByRole('heading', { name: id })).toBeVisible();
    await expect(page.getByTestId('current-status')).toHaveText('NEW');
    await page.getByRole('button', { name: 'Start progress' }).click();
    await expect(page.getByTestId('current-status')).toHaveText('IN_PROGRESS');
    await expect(history).toHaveCount(2);
  }

  await page.getByLabel('Development actor', { exact: true }).selectOption('employee-001');
  await expect(page.getByLabel('Service request', { exact: true })).toBeEnabled();
  await page.getByLabel('Service request', { exact: true }).selectOption('REQ-1001');
  await expect(page.getByTestId('current-status')).toHaveText('IN_PROGRESS');
  await expect(history).toHaveCount(2);

  await page.reload();
  await expect(page.getByTestId('current-status')).toHaveText('IN_PROGRESS');
  await expect(history).toHaveCount(2);
  await expect(history.nth(1)).toContainText('handler-001');
});
