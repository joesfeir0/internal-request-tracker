require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { testDatabase } = require('./database-helper.cjs');

test('HTTP lifecycle and status-history invariant', async (t) => {
  const database = await testDatabase();
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); await database.cleanup(); });
  const base = await app.getUrl();
  const path = '/requests/REQ-1001';
  async function readAll() {
    const response = await fetch(`${base}/requests`, { headers: { 'X-Actor-Id': 'employee-001' } });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function read() {
    const response = await fetch(base + path, { headers: { 'X-Actor-Id': 'employee-001' } });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function patch(body, id = 'REQ-1001') {
    return fetch(`${base}/requests/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Actor-Id': `handler-00${id === 'REQ-1002' ? 2 : id === 'REQ-1003' ? 3 : 1}` },
      body: JSON.stringify(body),
    });
  }
  async function rejected(body, expected, id) {
    const before = await read();
    const response = await patch(body, id);
    assert.equal(response.status, expected, await response.text());
    assert.deepEqual(await read(), before, 'Rejected change must preserve the entire request');
  }
  async function succeeds(status) {
    const before = await read();
    const started = Date.now();
    const response = await patch({ status });
    assert.equal(response.status, 200);
    const after = await response.json();
    assert.equal(after.status, status);
    assert.equal(after.history.length, before.history.length + 1);
    assert.deepEqual(after.history.slice(0, -1), before.history);
    const event = after.history.at(-1);
    assert.equal(event.status, after.status);
    assert.equal(event.requestId, after.id);
    assert.equal(event.changedBy, 'handler-001');
    assert.ok(Date.parse(event.changedAt) >= started);
    assert.ok(Date.parse(event.changedAt) <= Date.now());
    assert.equal(new Set(after.history.map((item) => item.id)).size, after.history.length);
    assert.deepEqual(await read(), after);
  }

  await t.test('list contains five independent NEW seeded requests', async () => {
    const requests = await readAll();
    assert.deepEqual(requests.map((request) => request.id), ['REQ-1001', 'REQ-1002', 'REQ-1003', 'REQ-1004', 'REQ-1005']);
    for (const request of requests) {
      assert.equal(request.status, 'NEW');
      assert.equal(request.history.length, 1);
      assert.equal(request.history[0].requestId, request.id);
      assert.equal(request.history[0].status, request.status);
      assert.equal(request.history[0].changedBy, 'seed');
    }
    assert.equal(new Set(requests.map((request) => request.history[0].id)).size, 5);
  });
  const initialRequests = await readAll();
  await t.test('seed starts NEW with matching history', async () => {
    const seed = await read();
    assert.equal(seed.status, 'NEW');
    assert.equal(seed.history.length, 1);
    assert.equal(seed.history[0].status, seed.status);
  });
  await t.test('NEW -> DONE: 409 and unchanged', () => rejected({ status: 'DONE' }, 409));
  await t.test('invalid input: 400 and unchanged', async () => {
    for (const body of [null, [], {}, { status: 1 },
      ...['REJECTED', 'CANCELLED', 'UNKNOWN', 'in_progress'].map((status) => ({ status })),
      { status: 'IN_PROGRESS', changedBy: 'handler-001' }, { status: 'IN_PROGRESS', role: 'admin' }]) {
      await rejected(body, 400);
    }
  });
  await t.test('identity and visibility are enforced by HTTP', async () => {
    for (const actor of ['', 'unknown', 'admin']) {
      const denied = await fetch(base + path, { headers: { 'X-Actor-Id': actor } });
      assert.equal(denied.status, 401);
    }
    const before = await readAll();
    const denied = await fetch(`${base}${path}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Actor-Id': 'employee-001' },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(await readAll(), before);
    const hidden = await fetch(base + path, { headers: { 'X-Actor-Id': 'handler-002' } });
    assert.equal(hidden.status, 404);
    const list = await fetch(`${base}/requests`, { headers: { 'X-Actor-Id': 'handler-001' } });
    assert.deepEqual((await list.json()).map((request) => request.id), ['REQ-1001', 'REQ-1004', 'REQ-1005']);
  });
  await t.test('unknown request: 404', async () => {
    await rejected({ status: 'IN_PROGRESS' }, 404, 'missing');
    assert.equal((await fetch(`${base}/requests/missing`, { headers: { 'X-Actor-Id': 'handler-001' } })).status, 404);
  });
  await t.test('NEW -> NEW: 409 and unchanged', () => rejected({ status: 'NEW' }, 409));
  await t.test('NEW -> IN_PROGRESS: 200, event appended', () => succeeds('IN_PROGRESS'));
  await t.test('IN_PROGRESS -> NEW or IN_PROGRESS: 409 and unchanged', async () => {
    for (const status of ['NEW', 'IN_PROGRESS']) await rejected({ status }, 409);
  });
  await t.test('IN_PROGRESS -> DONE: 200, event appended', () => succeeds('DONE'));
  await t.test('DONE -> IN_PROGRESS: 409 and unchanged', () => rejected({ status: 'IN_PROGRESS' }, 409));
  await t.test('DONE -> NEW or DONE: 409 and unchanged', async () => {
    for (const status of ['NEW', 'DONE']) await rejected({ status }, 409);
  });
  await t.test('changing one seeded request leaves the other requests unchanged', async () => {
    const before = await readAll();
    assert.deepEqual(before[0], await read());
    assert.deepEqual(before.slice(1), initialRequests.slice(1));

    const response = await patch({ status: 'IN_PROGRESS' }, 'REQ-1002');
    assert.equal(response.status, 200);
    const updated = await response.json();
    const after = await readAll();
    assert.deepEqual(after[0], before[0]);
    assert.deepEqual(after[2], before[2]);
    assert.deepEqual(after[1], updated);
    assert.equal(updated.status, 'IN_PROGRESS');
    assert.equal(updated.history.length, 2);
    assert.deepEqual(updated.history[0], before[1].history[0]);
    assert.equal(updated.history[1].requestId, 'REQ-1002');
    assert.equal(updated.history[1].status, updated.status);
    assert.equal(updated.history[1].changedBy, 'handler-002');

    const invalid = await patch({ status: 'DONE' }, 'REQ-1003');
    assert.equal(invalid.status, 409);
    await invalid.text();
    assert.deepEqual(await readAll(), after);
  });
});
