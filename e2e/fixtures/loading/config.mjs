import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../../lib/vite.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
export function config(loading, port) {
  return defineConfig({
    root, base: './',
    plugins: [isle({ entry: `${root}/../../../benchmarks/variants/isle/app.isle`, clientEntry: `${root}/main.mjs`, diagnostics: true, mounts: [
      { component: 'Counter', props: { initial: 37 }, scopeId: 'counter', label: 'Selected counter', loading },
      { component: 'Editor', props: { id: 'demo', initial: 'Draft' }, scopeId: 'editor', label: 'Lazy editor' },
    ] })],
    build: { outDir: `../../../dist-${loading}`, emptyOutDir: true },
    preview: { host: '127.0.0.1', port, strictPort: true },
  });
}
