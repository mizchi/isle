import { defineConfig } from '@playwright/test';
import {examples} from './examples/catalog.mjs';
// The preview CLI starts examples sequentially; the final server is the barrier.
const readyExample=examples.filter(example=>example.kind==='vite').at(-1);
export default defineConfig({
  testDir: './examples/tests', testMatch: '*.spec.mjs', workers: 1,
  use: { browserName: 'chromium', headless: true },
  webServer: {
    command: 'node tools/examples.mjs preview', url: `http://127.0.0.1:${readyExample.port+200}`,
    reuseExistingServer: false, timeout: 60000,
  },
});
