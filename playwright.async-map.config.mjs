import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'async-map.spec.mjs',workers:1,outputDir:'test-results/async-map',
  use:{browserName:'chromium',headless:true,baseURL:'http://127.0.0.1:4342',viewport:{width:1440,height:960}},
  webServer:{command:'pnpm exec vite build --config examples/async-map/vite.config.mjs && pnpm exec vite preview --config examples/async-map/vite.config.mjs',url:'http://127.0.0.1:4342',reuseExistingServer:false}});
