import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { runTransaction } from '../runtime/client.mjs';

const source = readFileSync(new URL('../examples/todomvc/app.isle', import.meta.url), 'utf8');
const generated = prepareProgram(requireIR(compile(source))).get('TodoMVC').generate();

async function instrument(handler) {
  const code = handler.code.replace(/^import \{ prepare, write \}[^\n]+/m, `let prepare; export function install(value){prepare=value;} import { write } from ${JSON.stringify(new URL('../runtime/regions.mjs', import.meta.url).href)};`)
    .replaceAll("'./isle-value-runtime.mjs'", JSON.stringify(new URL('../runtime/value.mjs', import.meta.url).href));
  const module = await import(`data:text/javascript,${encodeURIComponent(code)}`);
  const updates = [];
  module.install(() => ({ locals: () => [], prepare(v, dirty) { updates.push([...dirty]); return () => {}; } }));
  return { run: module.run, updates };
}

test('the SSR owner has no browser HTML factory; child factories remain for new rows', () => {
  assert.match(generated.regions.code, /const b0=\[null,/);
  assert.doesNotMatch(generated.regions.code, /<section|<header|<h1/);
  assert.match(generated.regions.code, /<li/);
});

test('identity assignments skip validation and region updates; Enter still validates new data', async () => {
  const { run, updates } = await instrument(generated.handlers.find(handler => handler.id === 'TodoMVC.add'));
  const items = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, title: `Todo ${i}`, completed: false }));
  let validations = 0;
  const scope = { _values: [items, 'Hello', 0, '', 'all'], _validate() { validations++; }, _set(i, v) { this._values[i] = v; } };
  for (const key of ['a', 'Backspace', 'Shift', 'Escape', 'ArrowLeft']) {
    await runTransaction(scope, run, { key, value: 'Hello', region: [null, null, () => {}] }, () => true);
  }
  assert.equal(validations, 0);
  assert.deepEqual(updates, []);
  assert.equal(scope._values[0], items);
  await runTransaction(scope, run, { key: 'Enter', value: ' Hello ', region: [null, null, () => {}] }, () => true);
  assert.equal(validations, 2);
  assert.deepEqual(updates, [['items', 'draft']]);
  assert.equal(scope._values[0].length, 501);
  assert.equal(scope._values[0].at(-1).title, 'Hello');
  assert.equal(scope._values[1], '');
});

test('a scalar update marks only the changed slot and repeated values do no work', async () => {
  const { run, updates } = await instrument(generated.handlers.find(handler => handler.id === 'TodoMVC.draftChanged'));
  const scope = { region: [null, null], _values: [[], '', 0, '', 'all'], _validate() {}, _set(i, v) { this._values[i] = v; } };
  for (const value of ['Hello', 'Hello']) await runTransaction(scope, run, { value }, () => true);
  assert.deepEqual(updates, [['draft']]);
});

test('skipping identical writes preserves statement order and transaction rollback', async () => {
  const code = `client component C() { state n=1; state xs: number[]=[];
    <div><button>on click change { n = n; n += 1; xs = [xs[0]]; }Change</button>
    <Show when={n > 0}><p>{n}</p></Show></div> }`;
  const handler = prepareProgram(requireIR(compile(code))).get('C').generate().handlers[0];
  const { run, updates } = await instrument(handler), validations = [];
  const scope = { _values: [1, []], _validate(i, v) { validations.push([i, v]); }, _set(i, v) { this._values[i] = v; } };
  await assert.rejects(runTransaction(scope, run, {}, () => true), /index/i);
  assert.deepEqual(scope._values, [1, []]);
  assert.deepEqual(validations, [[0, 2]]);
  assert.deepEqual(updates, []);
});
