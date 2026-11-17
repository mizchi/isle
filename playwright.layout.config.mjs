import { defineConfig, devices } from '@playwright/test';
// The layout e2e in Chromium (the reference the static checks are proved against), and in Firefox and WebKit to see
// where their CSS baselines (UA styles, defaults, rendering) differ: `--project chromium|firefox|webkit`.
export default defineConfig({
  testDir: './e2e', testMatch: 'layout*.spec.mjs', workers: 1,
  use: { headless: true },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
