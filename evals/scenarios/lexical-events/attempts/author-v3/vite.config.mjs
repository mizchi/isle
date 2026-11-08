import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '@isle/prototype/vite';
export default defineConfig(({ mode }) => ({
  plugins: [isle({
    entry: fileURLToPath(new URL('./app.isle', import.meta.url)),
    mounts: [{ component: 'ReviewQueue', props: {}, label: 'Review queue' }],
    wrapMounts: false,
    ...(mode === 'ssr' ? { mode: 'ssr' } : {}),
    layout: {
      reset: ['./reset.css'],
      viewport: { min: 320, max: 960, height: { min: 640, max: 960 } },
      boxes: {
        '.queue-title': { minInlineSize: 160, minBlockSize: 24 },
        '.action': { minInlineSize: 80, minBlockSize: 18 },
        '.stat-label': { minInlineSize: 88, minBlockSize: 20 },
        '.stat-value': { minInlineSize: 16, minBlockSize: 20 },
        '.card-title': { minInlineSize: 136, minBlockSize: 20 },
        '.card-status': { minInlineSize: 40, minBlockSize: 16 },
      },
    },
  })],
  build: { target: 'es2023' },
}));
