import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({ root, base: '/dashboard/qwik/', plugins: [qwikVite({
  srcDir: `${root}/src/dashboard`, client: { input: `${root}/src/dashboard/app.tsx`, outDir: `${root}/../../dist/dashboard/qwik/client` },
  ssr: { input: `${root}/src/dashboard/entry.ssr.tsx`, outDir: `${root}/dist/dashboard/server` },
})], build: { target: 'es2023', modulePreload: false, sourcemap: false, emptyOutDir: true } });
