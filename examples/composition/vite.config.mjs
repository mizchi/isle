import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '@isle/prototype/vite';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root, base: './',
  plugins: [isle({ entry: `${root}app.isle`, mounts: [{ component: 'Page', props: { seed: 5 }, scopeId: 'page', label: '入れ子の例' }] })],
  server: { host: '127.0.0.1', port: 4192, strictPort: true, fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  build: { outDir: '../../dist-composition', emptyOutDir: true },
});
