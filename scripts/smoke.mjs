// Smoke check for a running target (local or live). Read-only: it never creates or changes requests.
// Usage: npm run smoke -- https://your-app.onrender.com [--skip-ai]
const base = (process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'http://127.0.0.1:3000').replace(/\/$/, '');
const skipAi = process.argv.includes('--skip-ai');

async function call(path, { actor, body } = {}) {
  const started = Date.now();
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(actor ? { 'X-Actor-Id': actor } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    // A sleeping free instance can take about a minute to wake.
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: response.status, text, json, ms: Date.now() - started };
}

const checks = [
  ['Health', async () => {
    const { status, json } = await call('/health');
    return [status === 200 && json?.status === 'ok', `HTTP ${status} ${JSON.stringify(json?.checks)} status=${json?.status} release=${json?.release}`];
  }],
  ['Frontend served', async () => {
    const { status, text } = await call('/');
    return [status === 200 && text.includes('id="root"'), `HTTP ${status}`];
  }],
  ['Demo accounts', async () => {
    const { status, json } = await call('/actors');
    return [status === 200 && Array.isArray(json) && json.length > 0, `HTTP ${status}, ${json?.length ?? 0} accounts`];
  }],
  ['Tracking: employee lists own requests', async () => {
    const { status, json } = await call('/requests', { actor: 'employee-001' });
    return [status === 200 && Array.isArray(json), `HTTP ${status}, ${json?.length ?? 0} requests`];
  }],
  ['Boundary: another employee is denied', async () => {
    const { status } = await call('/requests/REQ-1001', { actor: 'employee-002' });
    return [status === 404, `HTTP ${status} (expected 404)`];
  }],
  ['Boundary: unknown actor is rejected', async () => {
    const { status } = await call('/requests', { actor: 'intruder' });
    return [status === 401, `HTTP ${status} (expected 401)`];
  }],
];
if (!skipAi) checks.push(['AI triage suggestion', async () => {
  const { status, json, ms } = await call('/requests/intake-suggestion', { actor: 'employee-001', body: { text: 'My laptop does not turn on since this morning.' } });
  return [status === 200 && typeof json?.suggestedDepartment === 'string', `HTTP ${status} ${json?.suggestedDepartment ?? json?.message ?? ''} (${ms}ms)`];
}]);

console.log(`Smoke check against ${base}\n`);
let failures = 0;
for (const [name, check] of checks) {
  let ok = false, detail = '';
  try { [ok, detail] = await check(); } catch (error) { detail = error instanceof Error ? error.message : String(error); }
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
}
console.log(failures ? `\nHOLD: ${failures} check(s) failed.` : '\nAll smoke checks passed.');
process.exit(failures ? 1 : 0);
