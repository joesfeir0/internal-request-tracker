// Health reports useful capability: database and AI separately, safely, without spending AI quota on every check.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { GeminiClient } = require('../dist/intake/gemini.client');
const { AiStatus } = require('../dist/intake/ai-status');
const { RequestsStore } = require('../dist/requests/requests.store');
const { testDatabase } = require('./database-helper.cjs');

const candidate = { suggestedDepartment: 'IT', summary: 'Laptop does not turn on.', missingInformation: [], suggestedNextStep: 'IT review.' };
const envelope = () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(candidate) }] } }] });

test('health: ok -> AI failure degrades -> recovery -> database outage is unhealthy', async (t) => {
  const database = await testDatabase();
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-only-key';
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); await database.cleanup();
    if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous;
  });
  const base = await app.getUrl();
  const provider = app.get(GeminiClient);
  let calls = 0;
  let providerUp = true;
  provider.transport = async () => { calls++; if (!providerUp) throw new TypeError('connection refused'); return envelope(); };
  const health = async () => { const response = await fetch(`${base}/health`); const text = await response.text(); return { code: response.status, text, body: JSON.parse(text) }; };

  // Known good: one probe, then the fresh result is reused instead of calling the model again.
  const good = await health();
  assert.equal(good.code, 200);
  assert.equal(good.body.status, 'ok');
  assert.deepEqual(good.body.checks, { database: 'ok', triageModel: 'ok' });
  assert.equal(typeof good.body.release, 'string');
  assert.equal((await health()).body.status, 'ok');
  assert.equal(calls, 1);
  for (const secret of ['test-only-key', 'googleapis', 'postgresql://']) assert.ok(!good.text.includes(secret));
  assert.deepEqual(await (await fetch(`${base}/health/live`)).json(), { status: 'ok' });

  // Controlled failure: a real intake failure is reflected immediately, without another probe.
  providerUp = false;
  const failed = await fetch(`${base}/requests/intake-suggestion`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Actor-Id': 'employee-001' }, body: JSON.stringify({ text: 'Printer jams' }) });
  assert.equal(failed.status, 502);
  const degraded = await health();
  assert.equal(degraded.code, 200);
  assert.equal(degraded.body.status, 'degraded');
  assert.deepEqual(degraded.body.checks, { database: 'ok', triageModel: 'unavailable' });
  assert.ok(!degraded.text.includes('connection refused'));
  assert.equal(calls, 2);
  // The core journey still works while degraded.
  const manual = await fetch(`${base}/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Actor-Id': 'employee-001' }, body: JSON.stringify({ description: 'Printer jams', summary: 'Printer jams', department: 'IT' }) });
  assert.equal(manual.status, 201);

  // Recovery: once the failure is older than a minute, health probes again and reports ok.
  providerUp = true;
  app.get(AiStatus).last.at -= 61_000;
  const recovered = await health();
  assert.equal(recovered.body.status, 'ok');
  assert.equal(calls, 3);

  // Database outage blocks the core path: unhealthy with HTTP 503.
  app.get(RequestsStore).ping = async () => { throw new Error('P1001 cannot reach database'); };
  const down = await health();
  assert.equal(down.code, 503);
  assert.equal(down.body.status, 'unhealthy');
  assert.deepEqual(down.body.checks, { database: 'unavailable', triageModel: 'ok' });
  assert.ok(!down.text.includes('P1001'));
});

test('health without an AI key is degraded and never calls the provider', async (t) => {
  const database = await testDatabase();
  const previous = process.env.GEMINI_API_KEY;
  // Empty rather than deleted: Prisma reloads backend/.env on startup and would restore a deleted key.
  process.env.GEMINI_API_KEY = '';
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); await database.cleanup();
    if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous;
  });
  let calls = 0;
  app.get(GeminiClient).transport = async () => { calls++; return envelope(); };
  const response = await fetch(`${await app.getUrl()}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'degraded');
  assert.deepEqual(body.checks, { database: 'ok', triageModel: 'not_configured' });
  assert.equal(calls, 0);
});
