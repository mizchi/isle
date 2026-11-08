import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './spec', workers: 1, use: { headless: true, viewport: { width: 320, height: 640 } } });
