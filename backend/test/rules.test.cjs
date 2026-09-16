require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { RequestsService } = require('../dist/requests/requests.service');
const { RequestsStore } = require('../dist/requests/requests.store');

const fixture = {
  id: 'REQ-1001', requesterId: 'employee-001', handlerId: 'handler-001', status: 'NEW',
  history: [{ id: 'initial', requestId: 'REQ-1001', status: 'NEW', changedBy: 'seed', changedAt: '2026-09-01T00:00:00.000Z' }],
};

test('requester is denied before persistence mutation', async () => {
  let mutations = 0;
  const service = new RequestsService({
    findOne: async () => structuredClone(fixture),
    saveStatus: async () => { mutations++; throw new Error('Must never be reached'); },
  });
  await assert.rejects(
    service.changeStatus('REQ-1001', 'IN_PROGRESS', { id: 'employee-001', role: 'requester' }),
    (error) => error.getStatus() === 403,
  );
  assert.equal(mutations, 0);
});

test('save failure becomes readable HTTP 503 without false success or fixture mutation', async (t) => {
  const app = await NestFactory.create(AppModule, { logger: false });
  t.after(() => app.close());
  const store = app.get(RequestsStore);
  const before = structuredClone(fixture);
  let attempts = 0;
  // Test-only replacement at the persistence boundary. No database is opened.
  store.findOne = async () => structuredClone(fixture);
  store.saveStatus = async () => { attempts++; throw new Error('Private database failure details'); };
  await app.listen(0, '127.0.0.1');
  const url = `${await app.getUrl()}/requests/REQ-1001`;
  const headers = { 'Content-Type': 'application/json', 'X-Actor-Id': 'handler-001' };
  const response = await fetch(`${url}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'IN_PROGRESS' }) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    statusCode: 503, message: 'Could not save the status. Please try again.', error: 'Service Unavailable',
  });
  assert.equal(attempts, 1);
  assert.deepEqual(fixture, before);
  const read = await fetch(url, { headers });
  assert.equal(read.status, 200);
  const state = await read.json();
  assert.equal(state.status, 'NEW');
  assert.deepEqual(state.history, before.history);
});
