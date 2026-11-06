import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ isSsrBuild }) => ({ root, base: '/todomvc/qwik/', plugins: [qwikVite({
  srcDir: `${root}/src/todomvc`, client: { input: `${root}/src/todomvc/app.tsx`, outDir: `${root}/../../dist/todomvc/qwik/client` },
  ssr: { input: `${root}/src/todomvc/entry.ssr.tsx`, outDir: `${root}/dist/todomvc/server` },
}), ...(!isSsrBuild ? [{ name: 'todomvc-host', buildStart() { this.emitFile({ type: 'chunk', id: `${root}/src/todomvc/host.mjs`, name: 'todo-host' }); } }] : [])],
  build: { target: 'es2023', modulePreload: false, sourcemap: false, emptyOutDir: true },
}));
