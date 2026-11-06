import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./playground/tests',workers:1,outputDir:'test-results/playground',use:{baseURL:'http://127.0.0.1:4334',browserName:'chromium'},webServer:{command:'pnpm exec vite --config playground/vite.config.mjs --host 127.0.0.1',url:'http://127.0.0.1:4334',reuseExistingServer:false}});
