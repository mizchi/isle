import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testIgnore: ['**/lexical-events.spec.mjs', '**/widget*.spec.mjs', '**/control-flow.spec.mjs', '**/resource-bindings.spec.mjs', '**/auto-loading.spec.mjs', '**/style-loading.spec.mjs', '**/layout*.spec.mjs'], fullyParallel: false, workers: 1,
  use: { browserName: 'chromium', headless: true },
  webServer: [
    { command: 'pnpm dev', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
    { command: 'pnpm exec vite preview --config examples/counter/vite.config.mjs', url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI },
    { command: 'pnpm exec vite build --config e2e/fixtures/capabilities/vite.config.mjs && pnpm exec vite preview --config e2e/fixtures/capabilities/vite.config.mjs', url: 'http://127.0.0.1:4175', reuseExistingServer: !process.env.CI },
    { command: 'pnpm exec vite build --config e2e/fixtures/ssr-only/vite.config.mjs && pnpm exec vite preview --config e2e/fixtures/ssr-only/vite.config.mjs', url: 'http://127.0.0.1:4176', reuseExistingServer: !process.env.CI },
    { command: 'pnpm exec vite build --config e2e/fixtures/mixed/vite.config.mjs && pnpm exec vite preview --config e2e/fixtures/mixed/vite.config.mjs', url: 'http://127.0.0.1:4177', reuseExistingServer: !process.env.CI },
    { command: 'pnpm exec vite build --config e2e/fixtures/loading/vite.eager.config.mjs && pnpm exec vite preview --config e2e/fixtures/loading/vite.eager.config.mjs', url: 'http://127.0.0.1:4181', reuseExistingServer: !process.env.CI },
    { command: 'pnpm exec vite build --config e2e/fixtures/loading/vite.preload.config.mjs && pnpm exec vite preview --config e2e/fixtures/loading/vite.preload.config.mjs', url: 'http://127.0.0.1:4182', reuseExistingServer: !process.env.CI },
  ],
});
