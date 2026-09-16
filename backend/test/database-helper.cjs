const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { migrate, seed } = require('../scripts/database.cjs');

async function testDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'request-tracker-test-'));
  const url = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
  const previousUrl = process.env.DATABASE_URL;
  const prisma = new PrismaClient({ datasourceUrl: url });
  async function cleanup() {
    await prisma.$disconnect();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    // Remove only the temporary directory this helper created.
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('request-tracker-test-')) {
      throw new Error('Refusing cleanup outside the test temporary directory');
    }
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  try {
    await migrate(url);
    await seed(prisma);
    process.env.DATABASE_URL = url;
    return { prisma, url, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

module.exports = { testDatabase };
