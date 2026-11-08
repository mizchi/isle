import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '@isle/prototype/vite';

export default defineConfig({
  plugins: [isle({
    entry: fileURLToPath(new URL('./app.isle', import.meta.url)),
    mounts: [{ component: 'Board', props: {} }],
    wrapMounts: false,
    layout: { viewport: { min: 320, max: 960, height: { min: 640, max: 960 } } },
  })],
  build: { target: 'es2023' },
});
