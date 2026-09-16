const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

const developmentUrl = `file:${resolve(__dirname, '../prisma/dev.db').replaceAll('\\', '/')}`;

async function migrate(url) {
  // Create a missing SQLite file through Prisma before invoking the migration CLI.
  const connection = new PrismaClient({ datasourceUrl: url });
  try { await connection.$connect(); } finally { await connection.$disconnect(); }
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
}

async function seed(prisma, reset = false) {
  await prisma.$transaction(async (tx) => {
    // Explicit reset is for demo/test data only. Normal startup never calls it.
    if (reset) {
      await tx.statusEvent.deleteMany();
      await tx.serviceRequest.deleteMany();
    }
    for (let number = 1; number <= 5; number++) {
      const id = `REQ-100${number}`;
      await tx.serviceRequest.upsert({
        where: { id }, update: {},
        create: {
          id, requesterId: 'employee-001', handlerId: `handler-00${number <= 3 ? number : 1}`, status: 'NEW',
          history: { create: { status: 'NEW', changedBy: 'seed' } },
        },
      });
    }
  });
}

async function main() {
  const action = process.argv[2];
  if (!['setup', 'reset'].includes(action)) throw new Error('Use setup or reset');
  const url = process.env.DATABASE_URL || developmentUrl;
  await migrate(url);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await seed(prisma, action === 'reset');
    console.log(action === 'reset' ? 'Demo requests reset to NEW.' : 'Database ready; existing requests preserved.');
  } finally { await prisma.$disconnect(); }
}

module.exports = { migrate, seed };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
