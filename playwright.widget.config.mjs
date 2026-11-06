import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: process.env.WIDGET_URL ? '**/widget-elements.spec.mjs' : ['**/widget-elements.spec.mjs', '**/widget-portable.spec.mjs', '**/widget-versions.spec.mjs'], workers: 1,
  use: { browserName: 'chromium', headless: true },
  outputDir: 'test-results/widget',
  webServer: process.env.WIDGET_URL ? undefined : [{ command: 'pnpm exec wrangler dev --config examples/worker-widget/wrangler.jsonc --ip 127.0.0.1 --port 8791',
    url: 'http://127.0.0.1:8791/', timeout: 60000, reuseExistingServer: false, env: { WRANGLER_SEND_METRICS: 'false' } },
  { command: 'node examples/portable-widget/server.mjs', url: 'http://127.0.0.1:8793/portable/', timeout: 30000, reuseExistingServer: false },
  { command: 'node examples/portable-widget/server.mjs', url: 'http://127.0.0.1:8795/portable/', timeout: 30000, reuseExistingServer: false, env: { PORT: '8795' } }],
});
