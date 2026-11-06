import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { shell } from '../../shared/scenario.mjs';
export default defineConfig(({ isSsrBuild }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)), base: '/preact/',
  plugins: [preact(), { name: 'comparison-shell', transformIndexHtml: { order: 'pre', handler: () =>
    shell('<div id="app"><!--preact:ssr--></div>', '<script type="module" src="./src/entry.client.tsx"></script>') } }],
  build: { outDir: isSsrBuild ? 'dist/server' : '../../dist/preact/client',
    emptyOutDir: true, target: 'es2023', modulePreload: false, manifest: !isSsrBuild, sourcemap: false,
    ...(isSsrBuild ? { ssr: './src/entry.ssr.tsx', rollupOptions: { output: { entryFileNames: 'entry.ssr.js' } } } : {}),
  },
}));
