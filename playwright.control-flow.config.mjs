import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', testMatch: 'control-flow.spec.mjs', workers: 1,
  use: { browserName: 'chromium', headless: true, baseURL: 'http://127.0.0.1:4196' },
  webServer: { command: 'pnpm exec vite build --config e2e/fixtures/control-flow/vite.config.mjs && pnpm exec vite preview --config e2e/fixtures/control-flow/vite.config.mjs', url: 'http://127.0.0.1:4196', reuseExistingServer: false },
});
