import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../../lib/vite.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  plugins: [isle({ entry: `${root}/app.isle`, clientEntry: `${root}/main.mjs`, mounts: [
    { component: 'Fields', props: { initial: 37 }, scopeId: 'fields', label: 'Native attributes' },
    { component: 'Empty', props: { initial: '' }, scopeId: 'empty', label: 'Empty text' },
  ] })],
  build: { outDir: '../../../dist-capabilities', emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 4175, strictPort: true },
});
