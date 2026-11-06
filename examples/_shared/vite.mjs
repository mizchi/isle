import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { isle } from '@isle/prototype/vite';
import { examples } from '../catalog.mjs';

/** @param {string} configURL @param {Omit<import('@isle/prototype/vite').IsleOptions, 'entry'>} options */
export function exampleConfig(configURL, options) {
  const directory = new URL('.', configURL);
  const root = fileURLToPath(directory);
  const id = basename(root);
  const example = examples.find(example => example.id === id && example.kind === 'vite');
  if (!example?.port) throw new Error(`Unknown Vite example: ${id}`);
  return {
    root, base: './',
    plugins: [isle({ entry: fileURLToPath(new URL('app.isle', directory)), diagnostics: false, ...options })],
    server: { host: '127.0.0.1', port: example.port, strictPort: true, fs: { allow: [fileURLToPath(new URL('../..', directory))] } },
    preview: { host: '127.0.0.1', port: example.port, strictPort: true },
    build: { outDir: fileURLToPath(new URL(`../../dist/examples/${id}/`, directory)), emptyOutDir: true, target: 'es2023' },
  };
}
