require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { RequestsService } = require('../dist/requests/requests.service');
const { RequestsStore } = require('../dist/requests/requests.store');
const { testDatabase } = require('./database-helper.cjs');

test('real service persists status and appended history in isolated SQLite', async (t) => {
  const database = await testDatabase();
  const store = new RequestsStore();
  const reader = new PrismaClient({ datasourceUrl: database.url });
  t.after(async () => {
    await reader.$disconnect();
    await store.onModuleDestroy();
    await database.cleanup();
  });
  const service = new RequestsService(store);
  const actor = { id: 'handler-001', role: 'handler' };
  const read = () => reader.serviceRequest.findUniqueOrThrow({
    where: { id: 'REQ-1001' }, include: { history: { orderBy: { sequence: 'asc' } } },
  });
  const before = await read();
  assert.equal(before.status, 'NEW');
  await assert.rejects(service.changeStatus('REQ-1001', 'DONE', actor), (error) => error.getStatus() === 409);
  assert.deepEqual(await read(), before);

  await service.changeStatus('REQ-1001', 'IN_PROGRESS', actor);
  const saved = await read();
  assert.equal(saved.status, 'IN_PROGRESS');
  assert.equal(saved.history.length, before.history.length + 1);
  assert.deepEqual(saved.history.slice(0, -1), before.history);
  assert.equal(saved.history.at(-1).status, 'IN_PROGRESS');
  assert.equal(saved.history.at(-1).changedBy, 'handler-001');
  assert.equal(saved.history.at(-1).requestId, 'REQ-1001');
});
