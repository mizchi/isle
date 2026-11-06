import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'layout*.spec.mjs', workers: 1,
  use: { browserName: 'chromium', headless: true },
});
