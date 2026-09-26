// Release gate: runs the required checks in a fixed order and stops at the first failure.
// Usage: npm run verify:release [-- --require-clean]
import { spawnSync } from 'node:child_process';

const requireClean = process.argv.includes('--require-clean');
const git = (...args) => spawnSync('git', args, { encoding: 'utf8' }).stdout?.trim() ?? '';

// Release identity first: the exact commit and whether uncommitted changes are present.
const commit = git('rev-parse', 'HEAD') || 'unknown';
const dirty = git('status', '--porcelain') !== '';
console.log(`Candidate ${commit}${dirty ? ' (working tree has uncommitted changes)' : ' (clean working tree)'}`);
if (dirty && requireClean) {
  console.error('HOLD: a release candidate must be a clean, committed tree.');
  process.exit(1);
}

const steps = [
  ['Backend build', 'backend', 'build'],
  ['Frontend type-check and build', 'frontend', 'build'],
  ['Backend tests', 'backend', 'test'],
  ['Database integration test', 'backend', 'test:integration'],
  ['Offline AI evals', 'backend', 'eval:ai'],
  ['Browser end-to-end tests', 'frontend', 'test:e2e'],
];

const results = [];
for (const [name, folder, script] of steps) {
  console.log(`\n=== ${name} (${folder}: npm run ${script}) ===`);
  const started = Date.now();
  const run = spawnSync('npm', ['run', script], { cwd: folder, stdio: 'inherit', shell: process.platform === 'win32' });
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push([name, run.status === 0 ? 'PASS' : 'FAIL', `${seconds}s`]);
  if (run.status !== 0) break;
}

console.log('\nRelease gate summary');
for (const [name, result, time] of results) console.log(`  ${result.padEnd(4)}  ${name} (${time})`);
const passed = results.length === steps.length && results.every(([, result]) => result === 'PASS');
console.log(passed
  ? `\nAll ${steps.length} checks passed for ${commit.slice(0, 12)}${dirty ? ' (uncommitted changes: not a release candidate)' : ''}.`
  : `\nHOLD: "${results.at(-1)[0]}" failed; later checks did not run.`);
process.exit(passed ? 0 : 1);
