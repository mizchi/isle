import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';

test('production eager entries expose prepared callable exports without preparing lazy siblings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isle-eager-registry-'));
  try {
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, 'index.html'), '<html><head></head><body><!--isle:ssr--></body></html>');
    await build({ configFile: false, root, base: './', logLevel: 'silent', plugins: [isle({
      entry: fileURLToPath(new URL('../benchmarks/variants/isle/app.isle', import.meta.url)), mounts: [
        { component: 'Counter', props: { initial: 37 }, label: 'Counter', loading: 'eager' },
        { component: 'Editor', props: { id: 'demo', initial: 'Draft' }, label: 'Editor' },
      ],
    })], build: { outDir: join(root, 'dist') } });
    const manifest = JSON.parse(await readFile(join(root, 'dist/isle.manifest.json')));
    const runtime = await import(pathToFileURL(join(root, 'dist', manifest.references['isle:resume'].chunk)).href);
    const ready = runtime.registry[5];
    assert.equal(typeof ready?.['Counter.h0'], 'function');
    assert.ok(!Object.hasOwn(ready, 'Editor.h1'));
    const counter = await import(pathToFileURL(join(root, 'dist', manifest.references['Counter.h0'].chunk)).href);
    assert.equal(ready['Counter.h0'], counter[manifest.references['Counter.h0'].ref[1]], 'prepared entry uses the emitted export identity');
    const values = [37], text = [];
    await ready['Counter.h0'](values, (slot, value) => { values[slot] = value; }, (...patch) => text.push(patch));
    assert.deepEqual(values, [38]); assert.ok(text.some(patch => patch[1] === '76'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
