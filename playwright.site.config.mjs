import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
const { base } = JSON.parse(readFileSync('dist/site/site.json', 'utf8'));
export default defineConfig({
  testDir: './site/tests', workers: 1, use: { browserName: 'chromium', headless: true, baseURL: 'http://127.0.0.1:4330' + base },
  webServer: { command: 'node tools/serve-site.mjs', url: 'http://127.0.0.1:4330' + base, reuseExistingServer: false },
});
