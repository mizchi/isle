import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';
import { createCodeResolver } from '../runtime/code-ref.mjs';
import { planCodeLoad } from '../runtime/manifest.mjs';
import { planHandlerChunks } from '../lib/chunk-plan.mjs';

test('small sibling entries share one lazy chunk while captures and profiling identities stay distinct', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isle-pack-'));
  try {
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, 'index.html'), '<html><head></head><body><!--isle:ssr--></body></html>');
    const result = await build({ configFile: false, root, base: './', logLevel: 'silent',
      plugins: [isle({ entry: fileURLToPath(new URL('../benchmarks/variants/isle/dashboard.isle', import.meta.url)), loading: 'lazy', mounts: [
        { component: 'WorkItem', props: { id: 'task-00', title: 'Plan', team: 'Platform', initial: 2, rate: 80, description: 'Static' }, label: 'Plan' },
        { component: 'ProjectForm', props: {}, label: 'Project' },
      ] })], build: { outDir: join(root, 'dist') } });
    const manifest = JSON.parse(await readFile(join(root, 'dist/isle.manifest.json')));
    const ids = ['increment', 'reset', 'lock', 'save'].map(name => `WorkItem.${name}`);
    const refs = ids.map(id => manifest.references[id]);
    assert.equal(new Set(refs.map(ref => ref.chunk)).size, 1, 'tiny sibling handlers should avoid four network round trips');
    assert.equal(new Set(refs.map(ref => ref.ref[1])).size, 4, 'each logical entry keeps its own callable export');
    assert.notEqual(refs[0].chunk, manifest.references['ProjectForm.__form0'].chunk, 'form dependencies stay separate');
    assert.ok(refs.every(ref => ref.source.file.endsWith('dashboard.isle') && ref.requires[0] === 'isle:resume'));
    assert.equal(refs[0].async, false); assert.equal(refs[3].async, true);
    assert.deepEqual(refs[3].actions, ['savePlan']);
    const plan = planCodeLoad(manifest, ['WorkItem.increment']);
    assert.ok(!plan.modules.includes(manifest.references['ProjectForm.__form0'].ref[0]));
    const chunk = result.output.find(chunk => chunk.fileName === refs[0].chunk);
    assert.ok(!chunk.code.includes('handleForm'));
    let imports = 0, calls = 0;
    const resolver = createCodeResolver(pathToFileURL(join(root, 'dist/isle.manifest.json')), async url => { imports++; return import(url); });
    const handlers = await Promise.all(refs.map(ref => resolver.resolve(ref.ref)));
    assert.equal(imports, 1, 'all exports resolve from one cached module');
    const state = { id: 'task-00', rate: 80, hours: 2, saved: 2, locked: false };
    const run = async (index, remote) => {
      const ref = refs[index], values = ref.captureNames.map(name => state[name]), text = new Map();
      await handlers[index](values, (slot, value) => { values[slot] = value; state[ref.captureNames[slot]] = value; },
        (slot, value) => text.set(slot, value), () => {}, remote, { type: 'click' });
      return text;
    };
    await run(0); assert.equal(state.hours, 3); assert.equal(state.saved, 2);
    await run(3, async (action, input) => { calls++; assert.equal(action, 'savePlan'); assert.deepEqual(input, { id: 'task-00', hours: 3 }); return { hours: input.hours }; });
    assert.equal(calls, 1); assert.equal(state.saved, 3);
    await run(0); await run(1); assert.equal(state.hours, 3, 'reset resolves its own export and saved capture');
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const handlerChunkBytes of [0, 64]) {
  test(`packing budget ${handlerChunkBytes} keeps oversized entries independent`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'isle-pack-limit-'));
    try {
      await writeFile(join(root, 'index.html'), '<html><head></head><body><!--isle:ssr--></body></html>');
      const result = await build({ configFile: false, root, logLevel: 'silent',
        plugins: [isle({ entry: fileURLToPath(new URL('../benchmarks/variants/isle/dashboard.isle', import.meta.url)), handlerChunkBytes,
          mounts: [{ component: 'WorkItem', props: { id: 'task-00', title: 'Plan', team: 'Platform', initial: 2, rate: 80, description: 'Static' }, label: 'Plan' }] })],
        build: { write: false } });
      const manifest = JSON.parse(result.output.find(item => item.fileName === 'isle.manifest.json').source);
      const refs = Object.values(manifest.references).filter(ref => ref.kind === 'handler');
      assert.equal(new Set(refs.map(ref => ref.chunk)).size, 4);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test('chunk packing budgets are finite nonnegative integer byte limits', () => {
  for (const handlerChunkBytes of [-1, 1.5, NaN, Infinity, '1024']) {
    assert.throws(() => isle({ entry: 'missing.isle', mounts: [], handlerChunkBytes }), /chunk.*budget/i);
  }
});

test('packing uses UTF-8 bytes and respects component and form boundaries', () => {
  const handler = (id, form) => ({ id, code: '/*あ*/', ...(form ? { form: {} } : {}) });
  const components = [
    { name: 'A', handlers: [handler('A.one'), handler('A.two'), handler('A.three')] },
    { name: 'B', handlers: [handler('B.one'), handler('B.form', true), handler('B.two')] },
  ];
  const before = JSON.stringify(components), chunks = planHandlerChunks(components, 14);
  assert.deepEqual(chunks.map(chunk => chunk.handlers.map(handler => handler.id)), [
    ['A.one', 'A.two'], ['A.three'], ['B.one'], ['B.form'], ['B.two'],
  ]);
  assert.equal(JSON.stringify(components), before, 'planning never mutates generated handlers');
  assert.deepEqual(planHandlerChunks(components, 14), chunks, 'planning is deterministic');
});

test('auto packing joins non-adjacent click siblings while keeping input code independent',()=>{
  const handlers=[{id:'A.add',event:'click',code:'add'},{id:'A.edit',event:'input',code:'edit'},{id:'A.clear',event:'click',code:'clear'}];
  const chunks=planHandlerChunks([{name:'A',handlers}],1024,new Map(handlers.map(handler=>[handler.id,'auto'])));
  assert.deepEqual(chunks.map(chunk=>chunk.handlers.map(handler=>handler.id)),[['A.add','A.clear'],['A.edit']]);
});

test('a preload-only route erases the interaction graph relay from its initial loader', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isle-packed-preload-'));
  try {
    await writeFile(join(root, 'index.html'), '<html><head></head><body><!--isle:ssr--></body></html>');
    const entry = join(root, 'app.isle');
    await writeFile(entry, 'export client component Counter() { state n = 0; <div><button>on click add { n += 1; }{n}</button><button>on click reset { n = 0; }Reset</button></div> }');
    const result = await build({ configFile: false, root, logLevel: 'silent', plugins: [isle({ entry, loading: 'preload',
      mounts: [{ component: 'Counter', props: {}, label: 'Counter' }] })], build: { write: false } });
    const main = result.output.find(item => item.type === 'chunk' && item.facadeModuleId?.endsWith('index.html'));
    assert.ok(!main.code.includes('data-isle-load'), 'no lazy graph lookup is needed');
    assert.ok(!main.code.includes('data-isle-code'), 'no interaction-time link traversal is needed');
    const html = result.output.find(item => item.fileName === 'index.html').source;
    assert.ok(!html.includes('data-isle-load'));
    assert.equal([...html.matchAll(/data-isle-preload/g)].length, 2, 'only runtime and the packed handler module preload');
  } finally { await rm(root, { recursive: true, force: true }); }
});
