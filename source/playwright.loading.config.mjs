import { defineConfig } from '@playwright/test';
const config='e2e/fixtures/auto-loading/vite.config.mjs';
export default defineConfig({testDir:'./e2e',testMatch:'auto-loading.spec.mjs',workers:1,
  use:{browserName:'chromium',headless:true},webServer:[
    {command:`pnpm exec vite build --config ${config} && pnpm exec vite preview --config ${config}`,url:'http://127.0.0.1:4199',reuseExistingServer:false},
    {command:`ISLE_AUTO_BUDGET=0 pnpm exec vite build --config ${config} && ISLE_AUTO_BUDGET=0 pnpm exec vite preview --config ${config}`,url:'http://127.0.0.1:4200',reuseExistingServer:false},
  ],
});
