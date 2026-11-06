import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../../lib/vite.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  plugins: [isle({ entry: `${root}/../ssr-only/app.isle`, mounts: [
    { component: 'Heading', props: { title: 'Mixed islands' }, label: 'Server component' },
    { component: 'Counter', props: { initial: 37 }, scopeId: 'static', mode: 'ssr', label: 'Static counter' },
    { component: 'NoEvents', props: { title: 'No handler stays static' }, label: 'Client without events' },
    { component: 'Counter', props: { initial: 5 }, scopeId: 'active', label: 'Active counter' },
  ] })],
  build: { outDir: '../../../dist-mixed', emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 4177, strictPort: true },
});
