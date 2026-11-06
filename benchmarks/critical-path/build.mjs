import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../lib/vite.mjs';
import { todoIsleConfig } from '../todomvc/isle-config.mjs';

const root = fileURLToPath(new URL('../../evals/scenarios/critical-path/', import.meta.url));
const rows = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, title: `Server row ${i + 1}` }));
const fixtures = [
  { id: 'static', mounts: [{ component: 'StaticCard', props: {} }] },
  { id: 'ssr-only', mode: 'ssr', mounts: [{ component: 'Rows', props: { initial: rows } }] },
  { id: 'scalar', mounts: [{ component: 'Scalar', props: {} }] },
  { id: 'branch', mounts: [{ component: 'Choice', props: {} }] },
  { id: 'keyed', mounts: [{ component: 'Rows', props: { initial: rows } }] },
  { id: 'multi-owner', mounts: [{ component: 'Scalar', props: {}, scopeId: 'a' }, { component: 'Scalar', props: {}, scopeId: 'b' }] },
];
for (const { id, mode, mounts } of fixtures) await build({ root, base: `/critical/${id}/`, configFile: false, logLevel: 'warn',
  plugins: [isle({ entry: `${root}/fixture.isle`, mounts, mode, diagnostics: false, loading: 'lazy', wrapMounts: false })],
  build: { outDir: fileURLToPath(new URL(`../dist/critical-path/${id}`, import.meta.url)), emptyOutDir: true, target: 'es2023', modulePreload: false },
});
await build({ ...todoIsleConfig({ target: 'todomvc-split', handlerChunkBytes: 0 }), configFile: false, logLevel: 'warn' });
