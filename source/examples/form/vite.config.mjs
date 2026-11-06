import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '@isle/prototype/vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [isle({ entry: fileURLToPath(new URL('./app.isle', import.meta.url)),
    diagnostics: true, clientEntry: fileURLToPath(new URL('./main.mjs', import.meta.url)),
    mounts: [{ component: 'Signup', props: { initial: '' }, scopeId: 'signup', label: 'Signup' }] })],
  server: { host: '127.0.0.1', port: 4190, strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  build: { outDir: '../../dist-form', emptyOutDir: true, manifest: true },
});
