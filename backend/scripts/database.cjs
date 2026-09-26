const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

// Apply committed migrations only; never inserts or deletes rows.
async function migrate(url, directUrl = url) {
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: directUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
}

// Fictional demo content so a fresh database shows meaningful requests.
const demoRequests = [
  ['My laptop shuts down during video calls, even when plugged in. It started on Monday.', 'Laptop shuts down during calls since Monday.'],
  ['I need an employment confirmation letter for a bank appointment next Thursday.', 'Employment letter needed by next Thursday.'],
  ['My taxi expense from the client visit on 12 September has not been reimbursed. I have the receipt.', 'Unreimbursed taxi expense from 12 September; receipt available.'],
  ['I cannot open the Marketing shared drive. It says access denied since this morning.', 'Access denied to Marketing shared drive since this morning.'],
  ['The VPN disconnects every few minutes when I work from home.', 'VPN keeps disconnecting when working from home.'],
];

async function seed(prisma, reset = false) {
  await prisma.$transaction(async (tx) => {
    if (reset) {
      // Delete child rows first to satisfy the request foreign keys.
      await tx.requestComment.deleteMany();
      await tx.statusEvent.deleteMany();
      await tx.serviceRequest.deleteMany();
    }
    for (let number = 1; number <= 5; number++) {
      const id = `REQ-100${number}`;
      await tx.serviceRequest.upsert({
        // Setup leaves existing demo requests and their history untouched.
        where: { id }, update: {},
        create: {
          id, requesterId: 'employee-001', handlerId: `handler-00${number <= 3 ? number : 1}`,
          department: number === 2 ? 'HR' : number === 3 ? 'FINANCE' : 'IT', status: 'NEW',
          description: demoRequests[number - 1][0], summary: demoRequests[number - 1][1],
          history: { create: { status: 'NEW', changedBy: 'seed' } },
        },
      });
    }
  });
}

function isLocal(url) {
  try { return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname); } catch { return false; }
}

async function main() {
  const [action, flag] = process.argv.slice(2);
  if (!['migrate', 'setup', 'reset'].includes(action)) throw new Error('Use migrate, setup or reset');
  const envFile = resolve(__dirname, '../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. See backend/.env.example.');
  // Deleting all requests on a remote (for example the live) database needs an explicit flag.
  if (action === 'reset' && !isLocal(url) && flag !== '--confirm-remote') {
    throw new Error(`Refusing to reset remote database host "${new URL(url).hostname}". Re-run with --confirm-remote if you really mean it.`);
  }
  await migrate(url, process.env.DIRECT_URL || url);
  if (action === 'migrate') { console.log('Migrations applied; data unchanged.'); return; }
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await seed(prisma, action === 'reset');
    console.log(action === 'reset' ? 'Demo requests reset to NEW.' : 'Database ready; existing requests preserved.');
  } finally { await prisma.$disconnect(); }
}

module.exports = { migrate, seed };
if (require.main === module) main().catch((error) => { console.error(error.message ?? error); process.exitCode = 1; });
