import { fileURLToPath } from 'node:url';
import { isle } from '../../lib/vite.mjs';
import { shell } from './scenario.mjs';
const root = fileURLToPath(new URL('../variants/isle/', import.meta.url));

/** Diagnostic builds use separate directories and URLs. Production defaults remain unchanged. */
export function todoIsleConfig({ target = 'todomvc', profile = false, loading = 'lazy', handlerChunkBytes = 1024, sourcemap = false } = {}) {
  if (!/^todomvc(?:-[a-z]+)?$/.test(target)) throw new Error('Invalid TodoMVC build target');
  return { root, base: `/${target}/isle/`, plugins: [
    { name: 'todomvc-shell', transformIndexHtml: { order: 'pre', handler: () => shell('<!--isle:ssr-->') } },
    isle({ entry: fileURLToPath(new URL('../../examples/todomvc/app.isle', import.meta.url)), wrapMounts: false, diagnostics: false, profile, loading, handlerChunkBytes,
      mounts: [{ component: 'TodoMVC', props: {}, scopeId: 'todos' }], clientEntry: '/examples-todomvc-browser.mjs' }),
    { name: 'todomvc-browser', resolveId(id) { if (id === '/examples-todomvc-browser.mjs') return fileURLToPath(new URL('../../examples/todomvc/browser.mjs', import.meta.url)); } },
  ], build: { outDir: `../../dist/${target}/isle/client`, emptyOutDir: true, target: 'es2023', sourcemap, modulePreload: false,
    rolldownOptions: { input: `${root}/todomvc.html` } } };
}
