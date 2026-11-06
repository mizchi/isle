import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../../lib/vite.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  plugins: [isle({ entry: `${root}/app.isle`, mode: 'ssr', loading: 'eager', clientEntry: `${root}/must-not-run.mjs`, mounts: [
    { component: 'Heading', props: { title: 'SSR only' }, label: 'Server component' },
    { component: 'Counter', props: { initial: 37 }, mode: 'resume', label: 'Counter rendered as HTML' },
    { component: 'NoEvents', props: { title: 'No handler stays static' }, label: 'Client without events' },
  ] })],
  build: { outDir: '../../../dist-ssr-only', emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 4176, strictPort: true },
});
