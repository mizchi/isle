import { defineConfig } from 'vite';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root, base: '/qwik-next/',
  plugins: [qwikVite({ srcDir: `${root}/src`, client: { input: `${root}/src/app.tsx`, outDir: `${root}/../../dist/qwik-next/client` },
    ssr: { input: `${root}/src/entry.ssr.tsx`, outDir: `${root}/dist/server` } })],
  build: { target: 'es2023', modulePreload: false, sourcemap: false, emptyOutDir: true },
});
