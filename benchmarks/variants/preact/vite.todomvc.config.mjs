import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { shell } from '../../todomvc/scenario.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ isSsrBuild }) => ({ root, base: '/todomvc/preact/', plugins: [preact(),
  { name: 'todomvc-shell', transformIndexHtml: { order: 'pre', handler: () => shell('<div id="app"><!--preact:ssr--></div>', '<script type="module" src="./src/todomvc/entry.client.tsx"></script>') } },
], build: { outDir: isSsrBuild ? 'dist/todomvc/server' : '../../dist/todomvc/preact/client', emptyOutDir: true, target: 'es2023', modulePreload: false, sourcemap: false,
  ...(isSsrBuild ? { ssr: './src/todomvc/entry.ssr.tsx', rollupOptions: { output: { entryFileNames: 'entry.ssr.js' } } } : { rolldownOptions: { input: `${root}/todomvc.html` } }),
} }));
