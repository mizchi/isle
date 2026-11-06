import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../../lib/vite.mjs';
import { shell } from '../../todomvc/scenario.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({ root, base: '/todomvc/isle/', plugins: [
  { name: 'todomvc-shell', transformIndexHtml: { order: 'pre', handler: () => shell('<!--isle:ssr-->') } },
  isle({ entry: fileURLToPath(new URL('../../../examples/todomvc/app.isle', import.meta.url)), wrapMounts: false, diagnostics: false,
    mounts: [{ component: 'TodoMVC', props: {}, scopeId: 'todos' }], loading: 'lazy', clientEntry: '/examples-todomvc-browser.mjs' }),
  { name: 'todomvc-browser', resolveId(id) { if (id === '/examples-todomvc-browser.mjs') return fileURLToPath(new URL('../../../examples/todomvc/browser.mjs', import.meta.url)); } },
], build: { outDir: '../../dist/todomvc/isle/client', emptyOutDir: true, target: 'es2023', sourcemap: false, modulePreload: false,
  rolldownOptions: { input: `${root}/todomvc.html` } } });
