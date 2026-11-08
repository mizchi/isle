import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'lexical-events.spec.mjs',workers:1,
  outputDir:'test-results/lexical-events',use:{browserName:'chromium',headless:true,baseURL:'http://127.0.0.1:4341'},
  webServer:{command:'pnpm exec vite build --config examples/lexical-events/vite.config.mjs && pnpm exec vite preview --config examples/lexical-events/vite.config.mjs',url:'http://127.0.0.1:4341',reuseExistingServer:false}});
