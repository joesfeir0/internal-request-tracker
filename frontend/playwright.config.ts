import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: 'status.e2e.ts',
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 5174',
    url: 'http://127.0.0.1:5174',
    env: { API_TARGET: 'http://127.0.0.1:3001' },
    reuseExistingServer: false,
  },
});
