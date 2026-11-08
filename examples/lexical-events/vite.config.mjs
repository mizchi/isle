import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../lib/vite.mjs';

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('.',import.meta.url)),
  plugins: [isle({
    entry: fileURLToPath(new URL('./app.isle', import.meta.url)),
    mounts: [{ component: 'ReviewQueue', props: {} }],
    wrapMounts: false,
    loading: 'lazy', diagnostics: false, profile: false,
    mode: mode === 'ssr' ? 'ssr' : 'resume',
    layout: {
      reset: ['./reset.css'],
      viewport: { min: 320, max: 960, height: { min: 640, max: 960 } },
      boxes: {
        '.heading': { minInlineSize: 160, minBlockSize: 32 },
        '.action': { minInlineSize: 64, minBlockSize: 38 },
        '.count': { minInlineSize: 16, minBlockSize: 24 },
        '.stat-label': { minInlineSize: 96, minBlockSize: 24 },
        '.title': { minInlineSize: 128, minBlockSize: 24, wrap: 'anywhere' },
        '.status': { minInlineSize: 48, minBlockSize: 16 },
        '.toggle': { minInlineSize: 64, minBlockSize: 30 }
      }
    }
  })],
  server: {host:'127.0.0.1',port:4341,strictPort:true},
  preview: {host:'127.0.0.1',port:4341,strictPort:true},
  build: { target: 'es2023', outDir: mode === 'ssr' ? '../../dist/lexical-events-ssr' : '../../dist/lexical-events', emptyOutDir:true }
}));
