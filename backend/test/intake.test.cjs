// Intake tests keep the backend and database real; only Gemini's network call is replaced.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { GeminiClient } = require('../dist/intake/gemini.client');
const { INTAKE_CONTEXT, validateCandidate } = require('../dist/intake/intake-contract');
const { INTAKE_FAILURE } = require('../dist/intake/intake.service');
const { testDatabase } = require('./database-helper.cjs');
const candidate = { suggestedDepartment: 'IT', summary: 'The employee reports laptop shutdowns.', missingInformation: ['When did it start?'], suggestedNextStep: 'Add the start date for IT review.' };
const envelope = (value = candidate) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });

test('candidate fields and size limits are runtime checked; extras are reconstructed away', () => {
  assert.deepEqual(validateCandidate({ ...candidate, internalReasoning: 'private', status: 'DONE' }), candidate);
  for (const value of [null, [], {}, { ...candidate, suggestedDepartment: 'ADMIN' },
    { ...candidate, summary: 42 }, { ...candidate, summary: ' ' }, { ...candidate, summary: 'x'.repeat(601) },
    { ...candidate, suggestedNextStep: null }, { ...candidate, suggestedNextStep: 'x'.repeat(601) },
    { ...candidate, missingInformation: 'nothing' }, { ...candidate, missingInformation: [42] },
    { ...candidate, missingInformation: [' '] }, { ...candidate, missingInformation: ['x'.repeat(201)] },
    { ...candidate, missingInformation: Array(6).fill('Question?') }]) assert.throws(() => validateCandidate(value));
  assert.deepEqual(validateCandidate({ ...candidate, missingInformation: [] }).missingInformation, []);
  assert.deepEqual(validateCandidate({ ...candidate, suggestedDepartment: 'UNDETERMINED', missingInformation: [] }).missingInformation, ['Which issue should this request cover?']);
});

test('one transient provider 503 is retried within the same deadline', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-only-key';
  try {
    const provider = new GeminiClient();
    const signals = [];
    provider.transport = async (_url, options) => {
      signals.push(options.signal);
      return signals.length === 1
        ? Response.json({ error: 'temporary overload' }, { status: 503 })
        : Response.json(envelope());
    };
    assert.deepEqual(await provider.generate('Laptop shuts down'), candidate);
    assert.equal(signals.length, 2);
    assert.equal(signals[0], signals[1]);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test('intake HTTP boundary, bounded provider context, permissions and real DB immutability', async (t) => {
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
  const snapshot = async () => ({ requests: await database.prisma.serviceRequest.findMany({ orderBy: { id: 'asc' } }), events: await database.prisma.statusEvent.findMany({ orderBy: { sequence: 'asc' } }) });
  const before = await snapshot();
  let calls = 0;
  provider.transport = async (url, options) => {
    calls++;
    assert.match(url, /^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\//);
    const payload = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text), { requesterText: 'My laptop shuts down.' });
    assert.ok(payload.systemInstruction.parts[0].text.includes(JSON.stringify(INTAKE_CONTEXT)));
    for (const forbidden of ['employee-001', 'handler-001', 'REQ-1001', 'test-only-key']) assert.ok(!options.body.includes(forbidden));
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(payload.generationConfig.responseMimeType, 'application/json');
    return Response.json(envelope({ ...candidate, status: 'DONE', internalNote: 'hidden' }));
  };
  const post = (body, actor = 'employee-001') => fetch(base + '/requests/intake-suggestion', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Actor-Id': actor }, body: JSON.stringify(body) });
  await t.test('rejects unknown actors, handlers and malformed input without calling provider', async () => {
    for (const [actor, code] of [['', 401], ['unknown', 401], ['handler-001', 403]]) {
      const response = await post({ text: 'Issue' }, actor); assert.equal(response.status, code); await response.text();
    }
    for (const value of [null, [], {}, { text: '' }, { text: '  ' }, { text: 2 }, { text: 'x'.repeat(4001) }, { text: 'Issue', department: 'IT' }, { text: 'Issue', role: 'requester' }]) {
      const response = await post(value); assert.equal(response.status, 400); await response.text();
    }
    assert.equal(calls, 0);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('success uses real adapter and validation, strips extras and leaves every DB row unchanged', async () => {
    const response = await post({ text: '  My laptop shuts down.  ' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), candidate);
    assert.equal(calls, 1);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('all provider failures collapse to exactly one response and unchanged database', async () => {
    const failures = [
      async () => Response.json({ privateProviderError: 'secret' }, { status: 503 }),
      async () => Response.json({ error: 'quota secret' }, { status: 429 }),
      async () => new Response('not JSON'),
      async () => Response.json({ candidates: [] }),
      async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] }),
      async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{broken' }] } }] }),
      async () => Response.json(envelope({ ...candidate, suggestedDepartment: 'ROOT' })),
      async () => new Response('x'.repeat(32769)),
      async () => { throw new TypeError('network failure with private details'); },
      async () => { throw new DOMException('timeout', 'TimeoutError'); },
    ];
    let expected;
    for (const transport of failures) {
      provider.transport = transport;
      const response = await post({ text: 'Issue' });
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.equal(body.message, INTAKE_FAILURE);
      expected ??= body; assert.deepEqual(body, expected);
      assert.deepEqual(await snapshot(), before);
    }
    delete process.env.GEMINI_API_KEY;
    const response = await post({ text: 'Issue' });
    assert.equal(response.status, 502); assert.deepEqual(await response.json(), expected);
    assert.deepEqual(await snapshot(), before);
  });
});
