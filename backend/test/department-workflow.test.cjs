// HTTP journey from employee submission through HR claim, reply and status update.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { testDatabase } = require('./database-helper.cjs');

test('employee submission reaches only its department; handler claims, replies and progresses it', async t => {
  const database = await testDatabase();
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); await database.cleanup(); });
  const base = await app.getUrl();
  const call = async (actor, path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Actor-Id': actor }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const input = { description: 'I need a letter confirming employment by next Friday.', summary: 'Employment letter requested.', department: 'HR' };
  const before = await database.prisma.serviceRequest.count();
  for (const [actor, body, expected] of [
    ['handler-002', input, 403], ['employee-001', { ...input, department: 'ROOT' }, 400],
    ['employee-001', { ...input, role: 'admin' }, 400], ['employee-001', { ...input, description: ' ' }, 400],
  ]) assert.equal((await call(actor, '/requests', 'POST', body)).status, expected);
  assert.equal(await database.prisma.serviceRequest.count(), before);

  const created = await call('employee-001', '/requests', 'POST', input);
  assert.equal(created.status, 201);
  const id = created.body.id;
  // Rejected submissions use no number; the first saved ticket follows the five seeds.
  assert.equal(id, 'REQ-1006');
  assert.equal(created.body.department, 'HR');
  assert.equal(created.body.handlerId, null);
  assert.equal(created.body.status, 'NEW');
  assert.equal(created.body.history.length, 1);
  assert.equal(created.body.history[0].changedBy, 'employee-001');
  assert.equal(await database.prisma.serviceRequest.count(), before + 1);

  assert.equal((await call('handler-001', `/requests/${id}`)).status, 404);
  assert.equal((await call('handler-003', `/requests/${id}`)).status, 404);
  assert.ok((await call('handler-002', '/requests')).body.some(request => request.id === id));
  assert.equal((await call('handler-001', `/requests/${id}/claim`, 'POST', {})).status, 404);
  assert.equal((await call('employee-001', `/requests/${id}/claim`, 'POST', {})).status, 403);
  assert.equal((await call('handler-002', `/requests/${id}/status`, 'PATCH', { status: 'IN_PROGRESS' })).status, 403);
  assert.equal((await call('handler-002', `/requests/${id}/claim`, 'POST', {})).status, 201);
  assert.equal((await call('handler-002', `/requests/${id}/claim`, 'POST', {})).status, 409);
  const reply = await call('handler-002', `/requests/${id}/comments`, 'POST', { message: 'Please confirm who should receive the letter.' });
  assert.equal(reply.status, 201);
  assert.equal(reply.body.comments.length, 1);
  assert.equal(reply.body.comments[0].authorId, 'handler-002');
  assert.equal((await call('handler-001', `/requests/${id}/comments`, 'POST', { message: 'Wrong department' })).status, 404);
  assert.equal((await call('employee-001', `/requests/${id}/comments`, 'POST', { message: 'Send it to me.' })).status, 201);
  assert.equal((await call('employee-001', `/requests/${id}/status`, 'PATCH', { status: 'IN_PROGRESS' })).status, 403);
  assert.equal((await call('handler-002', `/requests/${id}/status`, 'PATCH', { status: 'IN_PROGRESS' })).status, 200);
  const final = (await call('employee-001', `/requests/${id}`)).body;
  assert.equal(final.status, 'IN_PROGRESS');
  assert.equal(final.handlerId, 'handler-002');
  assert.equal(final.comments.length, 2);
  assert.equal(final.history.length, 2);
  assert.equal(final.history[1].changedBy, 'handler-002');
  const persisted = await database.prisma.serviceRequest.findUniqueOrThrow({ where: { id }, include: { comments: true, history: true } });
  assert.equal(persisted.status, 'IN_PROGRESS');
  assert.equal(persisted.comments.length, 2);
  assert.equal(persisted.history.length, 2);
});

test('policy boundaries: other employees, non-assigned handlers, status notes and closed requests', async t => {
  const database = await testDatabase();
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); await database.cleanup(); });
  const base = await app.getUrl();
  const call = async (actor, path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Actor-Id': actor }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const snapshot = id => database.prisma.serviceRequest.findUniqueOrThrow({ where: { id }, include: { comments: true, history: true } });

  const actors = await (await fetch(`${base}/actors`)).json();
  assert.deepEqual(actors.map(actor => actor.id), ['employee-001', 'employee-002', 'handler-001', 'handler-004', 'handler-002', 'handler-003']);
  assert.ok(actors.every(actor => typeof actor.name === 'string' && ['requester', 'handler'].includes(actor.role)));

  const { body: created } = await call('employee-001', '/requests', 'POST', { description: 'My monitor flickers.', summary: 'Monitor flickers.', department: 'IT' });
  const id = created.id;
  // Each test schema has its own ticket counter, so this one starts at REQ-1006 too.
  assert.equal(id, 'REQ-1006');
  assert.deepEqual(created.allowedActions, { claim: false, comment: true, nextStatus: null });

  // Another employee cannot read, list or reply to this request.
  assert.equal((await call('employee-002', `/requests/${id}`)).status, 404);
  assert.ok(!(await call('employee-002', '/requests')).body.some(request => request.id === id));
  assert.equal((await call('employee-002', `/requests/${id}/comments`, 'POST', { message: 'Hi' })).status, 404);

  // Both IT handlers may claim; the first wins and the second can only read and reply.
  assert.equal((await call('handler-004', `/requests/${id}`)).body.allowedActions.claim, true);
  const claimed = await call('handler-001', `/requests/${id}/claim`, 'POST', {});
  assert.deepEqual(claimed.body.allowedActions, { claim: false, comment: true, nextStatus: 'IN_PROGRESS' });
  assert.equal((await call('handler-004', `/requests/${id}/claim`, 'POST', {})).status, 409);
  assert.deepEqual((await call('handler-004', `/requests/${id}`)).body.allowedActions, { claim: false, comment: true, nextStatus: null });
  assert.equal((await call('handler-004', `/requests/${id}/status`, 'PATCH', { status: 'IN_PROGRESS' })).status, 403);

  // Invalid notes are rejected without changing anything.
  const beforeInvalid = await snapshot(id);
  for (const body of [{ status: 'IN_PROGRESS', note: 5 }, { status: 'IN_PROGRESS', note: 'x'.repeat(2001) }]) {
    const rejected = await call('handler-001', `/requests/${id}/status`, 'PATCH', body);
    assert.equal(rejected.status, 400);
    assert.match(rejected.body.message, /note/);
  }
  assert.deepEqual(await snapshot(id), beforeInvalid);

  // A note is saved as a reply with the status change; a blank note adds nothing.
  const started = await call('handler-001', `/requests/${id}/status`, 'PATCH', { status: 'IN_PROGRESS', note: '  Replacing the cable today.  ' });
  assert.equal(started.status, 200);
  assert.deepEqual(started.body.comments.map(comment => [comment.authorId, comment.message]), [['handler-001', 'Replacing the cable today.']]);
  const done = await call('handler-001', `/requests/${id}/status`, 'PATCH', { status: 'DONE', note: '   ' });
  assert.equal(done.body.comments.length, 1);
  assert.deepEqual(done.body.allowedActions, { claim: false, comment: false, nextStatus: null });

  // Completed requests are closed to further replies from everyone.
  for (const actor of ['employee-001', 'handler-001', 'handler-004']) {
    const reply = await call(actor, `/requests/${id}/comments`, 'POST', { message: 'One more thing' });
    assert.equal(reply.status, 409);
    assert.match(reply.body.message, /closed/);
  }
  const final = (await call('employee-001', `/requests/${id}`)).body;
  assert.equal(final.status, 'DONE');
  assert.equal(final.comments.length, 1);
  assert.deepEqual(final.allowedActions, { claim: false, comment: false, nextStatus: null });
});
