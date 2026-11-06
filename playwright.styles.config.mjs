import {defineConfig} from '@playwright/test';
const url=`http://127.0.0.1:${process.env.ISLE_STYLE_PLAIN==='1'?4212:4211}`;
const command='pnpm exec vite build --config e2e/fixtures/style-loading/vite.config.mjs && pnpm exec vite preview --config e2e/fixtures/style-loading/vite.config.mjs';
export default defineConfig({testDir:'./e2e',testMatch:'style-loading.spec.mjs',workers:1,use:{browserName:'chromium',headless:true,baseURL:url},
  webServer:[{command,url,reuseExistingServer:false},...(process.env.ISLE_STYLE_PLAIN==='1'?[]:[{command:'ISLE_STYLE_EAGER=1 pnpm exec vite build --config e2e/fixtures/style-loading/vite.config.mjs && ISLE_STYLE_EAGER=1 pnpm exec vite preview --config e2e/fixtures/style-loading/vite.config.mjs',url:'http://127.0.0.1:4213',reuseExistingServer:false}])],
});
