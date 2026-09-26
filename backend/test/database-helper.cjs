const { existsSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { migrate, seed } = require('../scripts/database.cjs');

const envFile = resolve(__dirname, '../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Each test gets its own PostgreSQL schema, so tests never read or change development data.
async function testDatabase() {
  // Prefer the direct connection: schema creation and migrations are unreliable through a pooler.
  const base = process.env.TEST_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!base) throw new Error('Set TEST_DATABASE_URL, DIRECT_URL or DATABASE_URL to a PostgreSQL database for tests.');
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const target = new URL(base);
  target.searchParams.set('schema', schema);
  const url = target.toString();
  const previous = { DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL };
  const prisma = new PrismaClient({ datasourceUrl: url });
  async function cleanup() {
    // Guard the drop so it can only remove a schema this helper created.
    if (!/^test_[0-9a-f]{12}$/.test(schema)) throw new Error('Refusing to drop an unexpected schema');
    try { await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally {
      await prisma.$disconnect();
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
  }
  try {
    await migrate(url);
    await seed(prisma);
    process.env.DATABASE_URL = url;
    process.env.DIRECT_URL = url;
    return { prisma, url, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

module.exports = { testDatabase };
