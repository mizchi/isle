import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';
import { runTransaction } from '../runtime/client.mjs';
import { aliases, repeated } from '../benchmarks/static-scenario.mjs';

const component = source => requireIR(compile(source)).components[0];
const load = handler => import(`data:text/javascript,${encodeURIComponent(handler.code)}`);
function scope(values) {
  const patches = [];
  return { _values: values, patches,
    _validate(index, value) { if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) throw new Error('Invalid number'); },
    _set(index, value) { values[index] = value; }, _text(index, value) { patches.push(value); }, _attribute(index, name, value) { patches.push(value); } };
}

test('immutable state aliases share the original prop slot across instances', async () => {
  const input = component(aliases), generated = generateComponent(input), handler = generated.handlers[0];
  assert.deepEqual(generated.fields.map(field => field.name), ['base', 'count']);
  assert.deepEqual(generated.analysis.aliases, [{ name: 'copied', source: 'base' }, { name: 'copiedAgain', source: 'base' }]);
  assert.deepEqual(generated.analysis.serverStates, ['count']);
  for (const base of [37, 5]) {
    const current = scope(renderComponent(input, { base }).snapshot[3]);
    await runTransaction(current, (await load(handler)).run, {}, () => true, handler.captures);
    assert.deepEqual(current._values, [base, base * 3]);
  }
  assert.throws(() => renderComponent(input, { base: Infinity }), /props.base must be number/);
});

test('a copy of mutable state remains its initial value', async () => {
  const input = component(`export client component Copy({ initial }: { initial: number }) {
    state count = initial;
    state frozen = count;
    state total = 0;
    <button>on click { count += 1; total = frozen + count; }{total}</button>
  }`);
  const generated = generateComponent(input), handler = generated.handlers[0], current = scope(renderComponent(input, { initial: 1 }).snapshot[3]);
  assert.ok(generated.fields.some(field => field.name === 'frozen'));
  const module = await load(handler);
  await runTransaction(current, module.run, {}, () => true, handler.captures);
  await runTransaction(current, module.run, {}, () => true, handler.captures);
  assert.deepEqual(current.patches, ['3', '4']);
});

test('equal initial values do not merge independently writable state', async () => {
  const input = component(`export client component Separate({ base }: { base: number }) {
    state a = base;
    state b = base;
    state total = 0;
    <button>on click { total = a + b; }on change { b += 1; }{total}</button>
  }`);
  const generated = generateComponent(input), current = scope(renderComponent(input, { base: 5 }).snapshot[3]);
  assert.deepEqual(generated.fields.map(field => field.name), ['base', 'b', 'total']);
  for (const index of [1, 0]) {
    const handler = generated.handlers[index];
    await runTransaction(current, (await load(handler)).run, {}, () => true, handler.captures);
  }
  assert.deepEqual(current.patches, ['11']);
});

test('alias elimination preserves the declared state type validation', () => {
  const input = component(aliases);
  input.states.find(state => state.name === 'copied').type = 'string';
  assert.throws(() => renderComponent(input, { base: 37 }), /snapshot.copied must be string/);
});

test('constant elimination preserves the declared type of manually supplied IR', () => {
  const input = component('export client component Counter() { state count = 1; state step = 2; <button>on click { count += step; }{count}</button> }');
  input.states.find(state => state.name === 'step').initial = { kind: 'string', value: 'wrong' };
  assert.throws(() => renderComponent(input, {}), /snapshot.step must be number/);
});

test('numeric derive diamonds are computed once per patch phase without extra snapshot slots', async () => {
  const input = component(repeated), generated = generateComponent(input), handler = generated.handlers[0];
  const values = renderComponent(input, { factor: 3 }).snapshot[3], count = generated.fields.findIndex(field => field.name === 'count');
  const factor = generated.fields.findIndex(field => field.name === 'factor'), reads = [0, 0], patches = [];
  const proxy = new Proxy(values, { get(target, key, receiver) {
    if (key === String(count)) reads[0]++;
    if (key === String(factor)) reads[1]++;
    return Reflect.get(target, key, receiver);
  } });
  await (await load(handler)).run(proxy, (index, value) => { values[index] = value; },
    (_, value) => patches.push(value), (_, name, value) => patches.push(value));
  assert.deepEqual(patches, ['107', 107, '107']);
  assert.deepEqual(reads, [2, 1]);
  const cached = handler.computations.find(phase => phase.phase === 'patch').derives;
  assert.ok(cached.includes('base'));
  assert.ok(cached.includes('total'));
  assert.deepEqual(generated.fields.map(field => field.name), ['factor', 'count']);
});

test('cached computations are invalidated between staged writes', async () => {
  const input = component(`export client component Writes({ factor }: { factor: number }) {
    state count = 1;
    derive base = count * 2 + factor;
    <button>on click { count = base * base + base; count = base * base + base; }{count}</button>
  }`);
  const generated = generateComponent(input), handler = generated.handlers[0], current = scope(renderComponent(input, { factor: 3 }).snapshot[3]);
  await runTransaction(current, (await load(handler)).run, {}, () => true, handler.captures);
  assert.deepEqual(current.patches, ['4032']);
  assert.deepEqual(handler.computations.map(phase => phase.phase), ['statement:0', 'statement:1']);
});

test('intermediate infinity is validated at the write and failed transactions still roll back', async () => {
  const input = component(`export client component Overflow({ factor }: { factor: number }) {
    state count = 1;
    derive huge = count * factor * factor;
    <button>on click { count = huge + huge; }{count}</button>
  }`);
  const generated = generateComponent(input), handler = generated.handlers[0], current = scope(renderComponent(input, { factor: Number.MAX_VALUE }).snapshot[3]);
  await assert.rejects(runTransaction(current, (await load(handler)).run, {}, () => true, handler.captures), /Invalid number/);
  assert.deepEqual(current._values, [Number.MAX_VALUE, 1]);
  assert.deepEqual(current.patches, []);
});

test('remote expressions keep their evaluation order and are not shared', async () => {
  const input = component(`schema Input { value: number; }
    view Output { result: number; }
    export server action calculate(input: Input): Output using request: RequestContext
      authorize grant = policy.calculate(request, input.value) effects { db.write }
    { return await calculator.run(grant, input.value); }
    export client component Remote({ factor }: { factor: number }) {
      state count = 1;
      derive base = count * 2 + factor;
      <button>on click async {
        count = (await remote calculate({ value: base * base + base })).result;
      }{count}</button>
    }`);
  const generated = generateComponent(input), handler = generated.handlers[0], current = scope(renderComponent(input, { factor: 3 }).snapshot[3]);
  const calls = [];
  current._remote = async (name, input) => { calls.push([name, input]); return { result: 30 }; };
  await runTransaction(current, (await load(handler)).run, {}, () => true, handler.captures);
  assert.deepEqual(handler.computations, []);
  assert.deepEqual(calls, [['calculate', { value: 30 }]]);
  assert.deepEqual(current.patches, ['30']);
});
