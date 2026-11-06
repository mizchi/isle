import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR, explain } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { analyzeCosts, checkCostBudgets } from '../lib/cost.mjs';
import { repeated } from '../benchmarks/static-scenario.mjs';

const ir = source => requireIR(compile(source));
const bound = (entry, metric) => {
  assert.equal(entry.work[metric].kind, 'upper-bound');
  return entry.work[metric].value;
};
const counter = `client component Counter(initial: number) {
  state count = initial;
  derive doubled = count * 2;
  derive unused = count * count * count;
  <div><button>on click increment { count += 1; }{count}</button>
    <output title={doubled}>{doubled}</output></div>
}`;

test('costs describe only affected optimized bindings and explain the write path', () => {
  const input = ir(counter), cost = analyzeCosts(input), entry = cost.entries[0];
  assert.equal(cost.version, 1);
  assert.equal(entry.id, 'Counter.increment');
  assert.equal(bound(entry, 'stateWrites'), 1);
  assert.equal(bound(entry, 'textPatchCalls'), 2);
  assert.equal(bound(entry, 'attributePatchCalls'), 1);
  assert.equal(bound(entry, 'binaryOperations'), 3);
  assert.equal(bound(entry, 'slotReads'), 4);
  assert.equal(entry.restore.owners, 1);
  assert.equal(entry.restore.snapshotSlots, 1);
  assert.equal(entry.restore.childOwners, 0);
  assert.deepEqual(entry.updates.map(update => update.kind), ['text', 'attribute', 'text']);
  assert.ok(entry.reasons.some(edge => edge.from === 'Counter.count' && edge.to === 'Counter.doubled'));
  assert.ok(!JSON.stringify(entry.reasons).includes('unused'));
  assert.deepEqual(explain(input).components[0].cost, prepareProgram(input).get('Counter').cost());
  assert.equal(analyzeCosts(input).planId, cost.planId);
  assert.notEqual(analyzeCosts(ir(counter.replace('count += 1', 'count += 2'))).planId, cost.planId);
});

test('generated operations stay below the per-invocation bounds, including shared diamonds', async () => {
  for (const source of [counter, repeated]) {
    const input = ir(source), component = input.components[0], program = prepareProgram(input);
    const generated = program.get(component.name).generate(), entry = analyzeCosts(input).entries[0];
    for (const initial of [1, 37, 100]) {
      const props = component.name === 'Counter' ? { initial } : { factor: initial };
      const values = program.render(component.name, props).snapshot[3];
      let reads = 0, writes = 0, text = 0, attributes = 0;
      const proxy = new Proxy(values, { get(target, key, receiver) {
        if (/^\d+$/.test(String(key))) reads++;
        return Reflect.get(target, key, receiver);
      } });
      const handler = generated.handlers[0];
      const local = new Proxy(handler.captures.map(index => proxy[index]), { get(target, key, receiver) {
        if (/^\d+$/.test(String(key))) reads++;
        return Reflect.get(target, key, receiver);
      } });
      reads = 0;
      const module = await import(`data:text/javascript,${encodeURIComponent(handler.code)}`);
      await module.run(local, (key, value) => { writes++; local[key] = value; }, () => text++, () => attributes++);
      assert.equal(reads, bound(entry, 'slotReads'));
      assert.equal(writes, bound(entry, 'stateWrites'));
      assert.equal(text, bound(entry, 'textPatchCalls'));
      assert.equal(attributes, bound(entry, 'attributePatchCalls'));
    }
    assert.deepEqual(entry.phases.filter(phase => phase.sharedDerives.length).map(phase => ({ phase: phase.phase, derives: phase.sharedDerives })), generated.handlers[0].computations);
  }
});

test('write-separated phases count repeated computation again, rather than caching across writes', () => {
  const source = `client component Writes(factor: number) {
    state count = 1; derive base = count * 2 + factor;
    <button>on click update { count = base * base + base; count = base * base + base; }{count}</button>
  }`;
  const entry = analyzeCosts(ir(source)).entries[0];
  assert.equal(bound(entry, 'binaryOperations'), 8);
  assert.equal(bound(entry, 'stateWrites'), 2);
  assert.deepEqual(entry.phases.map(phase => phase.phase), ['statement:0', 'statement:1', 'patch']);
});

test('unknown string and remote durations are never converted into constant-time guarantees', () => {
  const source = `schema Input { title: string; } view Output { title: string; }
    server action save(input: Input): Output using request: RequestContext
      authorize grant = policy.editor(request, input.title) effects { db.write }
      { return await documents.save(grant, input.title); }
    client component Editor(initial: string) { state title = initial;
      <button>on click async save { title = (await remote save({ title: title + "!" })).title; }{title}</button>
    }`;
  const report = analyzeCosts(ir(source)), entry = report.entries[0];
  assert.equal(bound(entry, 'remoteCalls'), 1);
  assert.ok(entry.unknownCosts.some(item => item.code === 'string-size'));
  assert.ok(entry.unknownCosts.some(item => item.code === 'remote-duration'));
  const result = checkCostBudgets(report, [{ entry: entry.id, metric: 'durationMs', max: 10 }]);
  assert.equal(result.ok, false);
  assert.equal(result.checks[0].status, 'unknown');
  const hidden = analyzeCosts(ir('client component Hidden(initial: string) { state title = initial; <button>on click append { title = title + "!"; }Append</button> }')).entries[0];
  assert.ok(hidden.unknownCosts.some(item => item.code === 'string-size'));
});

test('wide pure composition scales patch bounds while independent owners stay separate', () => {
  for (const rows of [0, 1, 8, 32, 256]) {
    const source = `component Row(value: number) { <output title={value}>{value} / {value * 2}</output> }
      client component Board() { state n = 1; derive value = n * 2 + 1;
        <main><button>on click update { n += 1; }Update</button>${'<Row value={value} />'.repeat(rows)}</main> }`;
    const report = analyzeCosts(ir(source)), entry = report.entries[0];
    assert.equal(bound(entry, 'textPatchCalls'), rows * 2);
    assert.equal(bound(entry, 'attributePatchCalls'), rows);
    assert.equal(bound(entry, 'createdElements'), 0);
  }
});

test('page scenarios count repeated owners and projected DOM without resuming child owners', () => {
  const source = `client component Child() { state n = 0; <button>on click child { n += 1; }{n}</button> }
    client component Box(children: RenderFragment) { state n = 0;
      <article><button>on click parent { n += 1; }{n}</button>{children}</article> }
    server component Page() { <main><Box><Child /></Box></main> }`;
  const input = ir(source), mounts = [{ component: 'Page' }, { component: 'Page' }, { component: 'Page', mode: 'ssr' }];
  const report = analyzeCosts(input, { mounts });
  assert.equal(report.scenario.domElements, 12);
  assert.equal(report.scenario.resumableOwners, 4);
  assert.equal(report.scenario.snapshotSlots, 4);
  assert.deepEqual(report.scenario.components.Child, { instances: 3, resumableInstances: 2 });
  assert.equal(report.entries.find(entry => entry.id === 'Box.parent').instances, 2);
  assert.equal(report.entries.find(entry => entry.id === 'Box.parent').restore.childOwners, 0);
  assert.equal(bound(report.entries.find(entry => entry.id === 'Box.parent'), 'textPatchCalls'), 1);
  const ssr = analyzeCosts(input, { mounts, mode: 'ssr' });
  assert.equal(ssr.scenario.domElements, 12);
  assert.equal(ssr.scenario.resumableOwners, 0);
  assert.equal(ssr.scenario.snapshotSlots, 0);
  assert.deepEqual(ssr.entries, []);
  assert.deepEqual(analyzeCosts(input, { mode: 'ssr' }).entries, []);
});

test('missing code references stay unknown instead of producing a zero-byte total', () => {
  const manifest = { version: 1, references: {}, chunks: {}, loading: { eager: [], preload: [] } };
  const report = analyzeCosts(ir(counter), { manifest });
  assert.equal(report.code.gzipBytes, undefined);
  assert.deepEqual(report.code.unresolvedReferences, ['Counter.increment']);
  assert.equal(checkCostBudgets(report, [{ entry: '*', metric: 'coldGzipBytes', max: 1 }]).ok, false);
  const stale = { version: 1, references: { 'Counter.increment': {
    ref: ['/handler.js', 'run', []], chunk: 'handler.js', requires: [], schemaId: 'outdated',
  } }, chunks: { 'handler.js': { url: '/handler.js', imports: [], dynamicImports: [], bytes: 100, gzipBytes: 80 } }, loading: { eager: [], preload: [] } };
  assert.throws(() => analyzeCosts(ir(counter), { manifest: stale }), /schema mismatch/i);
});

test('budgets fail on excess, unknown and unmatched entries; malformed limits cannot pass', () => {
  const report = analyzeCosts(ir(counter));
  const result = checkCostBudgets(report, [
    { entry: 'Counter.increment', metric: 'textPatchCalls', max: 1 },
    { entry: 'Counter.increment', metric: 'coldGzipBytes', max: 4096 },
    { entry: 'Missing.update', metric: 'stateWrites', max: 1 },
    { entry: 'Counter.increment', metric: 'stateWrites', max: 1 },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.checks.map(check => check.status), ['exceeded', 'unknown', 'unmatched', 'pass']);
  for (const budget of [
    { entry: '*', metric: 'textPatchCalls', max: -1 },
    { entry: '*', metric: 'textPatchCalls', max: NaN },
    { entry: '*', metric: 'typo', max: 1 },
  ]) assert.throws(() => checkCostBudgets(report, [budget]), /budget/i);
});

test('cold code budgets count CSS and never treat missing stylesheet sizes as free',()=>{
  const manifest={version:1,references:{'Counter.increment':{ref:['/handler.js','run',[]],chunk:'handler.js',requires:[]}},chunks:{'handler.js':{url:'/handler.js',imports:[],dynamicImports:[],styles:['theme.css'],bytes:100,gzipBytes:80}},styles:{'theme.css':{url:'/theme.css',bytes:20,gzipBytes:10}},loading:{eager:[],preload:[]}};
  const report=analyzeCosts(ir(counter),{manifest});
  assert.equal(report.code.bytes,120);assert.equal(report.code.gzipBytes,90);
  assert.equal(checkCostBudgets(report,[{entry:'*',metric:'coldGzipBytes',max:89}]).ok,false);
  delete manifest.styles['theme.css'].gzipBytes;
  assert.equal(analyzeCosts(ir(counter),{manifest}).code.gzipBytes,undefined);
});

test('schema form internals are unknown rather than reported as free generated handlers', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../evals/scenarios/forms/shared.isle', import.meta.url), 'utf8');
  const report = analyzeCosts(ir(source)), entry = report.entries.find(entry => entry.unknownCosts.some(item => item.code === 'form-runtime'));
  assert.ok(entry);
  assert.equal(entry.work.textPatchCalls.kind, 'unknown');
  assert.equal(checkCostBudgets(report, [{ entry: entry.id, metric: 'textPatchCalls', max: 1000 }]).ok, false);
});
