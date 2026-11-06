import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../../lib/vite.mjs';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [isle({ entry: fileURLToPath(new URL('../../../evals/scenarios/control-flow/fixture.isle', import.meta.url)),
    mounts: [{ component: 'Controls', props: { initial: [{ id: 'a', value: 10 }, { id: 'b', value: 20 }] }, label: 'Controls', scopeId: 'c' },
      { component: 'Nested', props: { groups: ['x', 'y'], numbers: [1, 2] }, label: 'Nested', scopeId: 'nested' }],
    clientEntry: fileURLToPath(new URL('main.mjs', import.meta.url)),
    diagnostics: false, profile: false, handlerChunkBytes: 0,
  })],
  build: { outDir: '../../../dist/control-flow', emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 4196, strictPort: true },
});
