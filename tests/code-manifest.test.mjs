import test from 'node:test';
import assert from 'node:assert/strict';
import { codeRef } from '../runtime/code-ref.mjs';
import { planCodeLoad, eagerLoad } from '../runtime/manifest.mjs';

const manifest = {
  version: 1,
  references: {
    runtime: { ref: ['./runtime.js', 'resume', []], chunk: 'runtime.js', requires: [] },
    counter: { ref: ['./counter.js', 'run', [0]], chunk: 'counter.js', requires: ['runtime'] },
    editor: { ref: ['./editor.js', 'run', [0, 1]], chunk: 'editor.js', requires: ['runtime'] },
  },
  chunks: {
    'runtime.js': { url: './runtime.js', imports: ['shared.js'], dynamicImports: ['counter.js', 'editor.js'] },
    'counter.js': { url: './counter.js', imports: ['shared.js'], dynamicImports: [] },
    'editor.js': { url: './editor.js', imports: [], dynamicImports: [] },
    'shared.js': { url: './shared.js', imports: [], dynamicImports: [] },
  },
  loading: { eager: ['counter'], preload: [] },
};

test('load plan follows required references and static imports, leaving unrelated dynamic chunks lazy', () => {
  const plan = planCodeLoad(manifest, ['counter', 'counter']);
  assert.deepEqual(plan.references, ['runtime', 'counter']);
  assert.deepEqual(new Set(plan.modules), new Set(['./runtime.js', './counter.js', './shared.js']));
  assert.ok(!plan.modules.includes('./editor.js'));
  assert.throws(() => planCodeLoad(manifest, ['toString']), /reference/);
  assert.throws(() => planCodeLoad({ ...manifest, version: 9 }, ['counter']), /version/);
});

test('manifest eager loading imports and validates exports but does not invoke them', async () => {
  let invoked = 0;
  const requested = [];
  await eagerLoad(manifest, { baseURL: 'https://example.test/app/isle.manifest.json', importModule: async url => {
    requested.push(url); return { run: () => invoked++, resume: () => invoked++ };
  } });
  assert.deepEqual(new Set(requested), new Set(['https://example.test/app/runtime.js', 'https://example.test/app/counter.js']));
  assert.equal(invoked, 0);
  assert.deepEqual(codeRef('./counter.js', 'run', [0]), manifest.references.counter.ref);
});

test('cycles in static ESM imports terminate and missing dependencies fail before import', async () => {
  const cycle = { ...manifest, chunks: { ...manifest.chunks,
    'shared.js': { ...manifest.chunks['shared.js'], imports: ['runtime.js'] } } };
  assert.equal(planCodeLoad(cycle, ['counter']).modules.length, 3);
  let imports = 0;
  const invalid = { ...manifest, chunks: { ...manifest.chunks,
    'counter.js': { ...manifest.chunks['counter.js'], imports: ['missing.js'] } } };
  await assert.rejects(eagerLoad(invalid, { baseURL: 'https://example.test/isle.manifest.json', importModule: async () => { imports++; return {}; } }), /chunk/);
  assert.equal(imports, 0);
});
