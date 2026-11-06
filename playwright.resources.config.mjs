import { defineConfig } from '@playwright/test';
const url = `http://127.0.0.1:${process.env.ISLE_RESOURCE_PLAIN === '1' ? 4198 : 4197}`;
export default defineConfig({ testDir:'./e2e',testMatch:'resource-bindings.spec.mjs',workers:1,
  use:{browserName:'chromium',headless:true,baseURL:url},
  webServer:{command:'pnpm exec vite build --config e2e/fixtures/resource-bindings/vite.config.mjs && pnpm exec vite preview --config e2e/fixtures/resource-bindings/vite.config.mjs',url,reuseExistingServer:false},
});
