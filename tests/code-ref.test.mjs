import test from 'node:test';
import assert from 'node:assert/strict';
import { codeRef, encodeCodeRef, decodeCodeRef, createCodeResolver } from '../runtime/code-ref.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('code references serialize URL, export and captured slots without a closure', () => {
  const ref = codeRef('./counter.js?v=1', 'increment', [2, 0]);
  assert.equal(encodeCodeRef(ref), './counter.js?v=1#increment[2,0]');
  assert.deepEqual(decodeCodeRef(encodeCodeRef(ref)), ref);
  assert.deepEqual(decodeCodeRef('./counter.js#run'), ['./counter.js', 'run', []]);
  assert.ok(Object.isFrozen(ref) && Object.isFrozen(ref[2]));
  assert.throws(() => codeRef('./x.js', undefined));
  assert.throws(() => codeRef('./x.js', 'run', Array(1)));
  for (const value of ['./x.js#run[-1]', './x.js#run[0,0]', './x.js#run[1e2]', './x.js#run[9007199254740992]', './x.js#run[1.5]'])
    assert.throws(() => decodeCodeRef(value));
});

test('resolution uses the explicit base and shares one import between exports', async () => {
  const imports = [], run = () => 1, other = () => 2;
  const resolver = createCodeResolver('https://example.test/app/assets/registry.js', async url => {
    imports.push(url); return { run, other };
  });
  const a = codeRef('./chunk.js', 'run', [0]), b = codeRef('./chunk.js', 'other', [1]);
  const result = await Promise.all([resolver.resolve(a), resolver.resolve(b)]);
  assert.deepEqual(result, [run, other]);
  assert.deepEqual(imports, ['https://example.test/app/assets/chunk.js']);
  assert.equal(await resolver.resolve(a), run);
  assert.equal(imports.length, 1);
  await assert.rejects(resolver.resolve(codeRef('./chunk.js', 'toString')), /export/);
});

test('failed imports can be retried and non-module URL schemes are rejected before import', async () => {
  let calls = 0;
  const resolver = createCodeResolver('file:///app/registry.mjs', async url => {
    assert.equal(url, 'file:///app/chunk.mjs');
    if (++calls === 1) throw new Error('offline');
    return { run: () => 37 };
  });
  const ref = codeRef('./chunk.mjs', 'run');
  await assert.rejects(resolver.resolve(ref), /offline/);
  assert.equal((await resolver.resolve(ref))(), 37);
  assert.equal(calls, 2);
  await assert.rejects(resolver.resolve(codeRef('javascript:alert(1)', 'run')));
  assert.equal(calls, 2);
});

test('native ESM resolution evaluates the module once and invokes only on an explicit call', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-code-ref-'));
  try {
    const file = join(directory, 'chunk.mjs');
    await writeFile(file, 'export let calls=0;export function run(){return ++calls;}export function other(){return 37;}');
    const resolver = createCodeResolver(pathToFileURL(join(directory, 'manifest.json')));
    const fn = await resolver.resolve(codeRef('./chunk.mjs', 'run', [0]));
    const module = await import(pathToFileURL(file).href);
    assert.equal(module.calls, 0);
    assert.equal(fn(), 1);
    assert.equal(await resolver.resolve(codeRef('./chunk.mjs', 'other')), module.other);
    assert.equal(module.calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
