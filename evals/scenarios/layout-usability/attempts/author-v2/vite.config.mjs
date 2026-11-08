import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '@isle/prototype/vite';

const viewport = { min: 320, max: 960, height: { min: 640, max: 960 } };
const boxes = {
  '.heading': { minInlineSize: 160, minBlockSize: 24 },
  '.filter': { minInlineSize: 32, minBlockSize: 24 },
  '.add': { minInlineSize: 64, minBlockSize: 28 },
  '.stat': { minInlineSize: 112, minBlockSize: 24 },
  '.title': { minInlineSize: 140, minBlockSize: 20 },
  '.status': { minInlineSize: 40, minBlockSize: 20 },
  '.toggle': { minInlineSize: 64, minBlockSize: 28 },
};

export default defineConfig(({ mode }) => ({
  plugins: [isle({
    entry: fileURLToPath(new URL('./app.isle', import.meta.url)),
    mounts: [{ component: 'ReviewQueue', props: {}, label: 'Review queue' }],
    mode: mode === 'ssr' ? 'ssr' : 'resume',
    wrapMounts: false,
    layout: { reset: ['./reset.css'], viewport, boxes },
  })],
  build: { target: 'es2023' },
}));
