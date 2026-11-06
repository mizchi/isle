import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '@isle/prototype/vite';
import { host } from './host.mjs';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [isle({ entry: fileURLToPath(new URL('./app.isle', import.meta.url)), host,
    diagnostics: true, clientEntry: fileURLToPath(new URL('./main.mjs', import.meta.url)),
    mounts: [{ component: 'SchemaSignup', props: {}, scopeId: 'signup', label: 'Signup' }] })],
  server: { host: '127.0.0.1', port: 4191, strictPort: true, fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  build: { outDir: '../../dist-schema-form', emptyOutDir: true, manifest: true },
});
