import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '@isle/prototype/vite';
import { host } from './host.mjs';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [isle({ entry: fileURLToPath(new URL('./app.isle', import.meta.url)), host, diagnostics: true, profile: process.env.ISLE_PROFILE === '1',
    clientEntry: fileURLToPath(new URL('./main.mjs', import.meta.url)),
    mounts: [
      { component: 'Counter', props: { initial: 37 }, scopeId: 'counter-a', label: 'SSR value 37' },
      { component: 'Counter', props: { initial: 5 }, scopeId: 'counter-b', label: 'Independent instance' },
      { component: 'Editor', props: { id: 'demo', initial: 'Draft' }, scopeId: 'editor', label: 'Explicit server action' },
    ] })],
  server: { host: '127.0.0.1', port: 4173, strictPort: true, fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  build: { outDir: '../../dist', emptyOutDir: true, manifest: true },
});
