import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../../lib/vite.mjs';
import { fixture, shell } from '../../shared/scenario.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root, base: '/isle/',
  plugins: [
    { name: 'comparison-shell', enforce: 'pre', transformIndexHtml: { order: 'pre', handler: () =>
      shell('<div id="app"><!--isle:ssr--></div>') } },
    isle({ entry: `${root}/app.isle`, mounts: [
      ...fixture.counters.map((counter, i) => ({ component: 'Counter', props: { initial: counter.initial }, scopeId: `counter-${i}`, label: counter.label })),
      { component: 'Editor', props: { id: fixture.editor.id, initial: fixture.editor.initial }, scopeId: 'editor', label: fixture.editor.label },
    ] }),
  ],
  build: { outDir: '../../dist/isle/client', emptyOutDir: true, target: 'es2023', manifest: true, sourcemap: false },
});
