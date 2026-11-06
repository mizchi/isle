import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'vite';
import { todoIsleConfig } from './isle-config.mjs';

const before = JSON.parse(await readFile(new URL('../dist/todomvc/isle/client/isle.manifest.json', import.meta.url), 'utf8'));
for (const options of [
  { target: 'todomvc' },
  { target: 'todomvc-profile', profile: true },
  { target: 'todomvc-ungrouped', handlerChunkBytes: 0 },
  { target: 'todomvc-auto', loading: 'auto' },
]) {
  const config = todoIsleConfig({ ...options, sourcemap: 'hidden' });
  if (options.target === 'todomvc') config.build.outDir = '../../dist/todomvc-inspect/isle/client';
  await build({ ...config, configFile: false, logLevel: 'warn' });
}
const after = JSON.parse(await readFile(new URL('../dist/todomvc-inspect/isle/client/isle.manifest.json', import.meta.url), 'utf8'));
assert.deepEqual(after, before, 'Hidden diagnostic source maps must not change the production chunks or manifest');
for (const file of Object.keys(after.chunks)) assert.deepEqual(
  await readFile(new URL('../dist/todomvc-inspect/isle/client/' + file, import.meta.url)),
  await readFile(new URL('../dist/todomvc/isle/client/' + file, import.meta.url)),
  `Production code bytes changed: ${file}`,
);
console.log('Built isolated profile, ungrouped and auto cases; production manifest unchanged');
