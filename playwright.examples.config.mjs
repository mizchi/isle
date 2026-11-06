import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './examples/tests', testMatch: '*.spec.mjs', workers: 1,
  use: { browserName: 'chromium', headless: true },
  webServer: {
    command: 'node tools/examples.mjs preview', url: 'http://127.0.0.1:4373',
    reuseExistingServer: false, timeout: 60000,
  },
});
