import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { parseJSON, validValue } from '../runtime/value.mjs';
import { runTransaction } from '../runtime/client.mjs';

const source = `schema Todo { id: number; title: string; completed: boolean; }
client component Todos(initial: Todo[]) {
  state items: Todo[] = initial;
  derive active = items.filter(todo => !todo.completed);
  derive count = active.length;
  <section>
    <input type="text" aria-label="New todo">on keydown add {
      items = event.key === "Enter" ? items.concat([{ id: 3, title: event.value.trim(), completed: false }]) : items;
    }</input>
    <input type="hidden">on input restore { items = JSON.parse<Todo[]>(event.value); }</input>
    <button>on click complete { items = items.map(todo => { id: todo.id, title: todo.title, completed: true }); }Complete</button>
    <output>{count === 1 ? "1 item" : "Other items"}</output>
    <ul><For each={active}>{(todo) => <Fragment key={todo.id}> <li>{todo.title}</li> </Fragment>}</For></ul>
    <span data-store={JSON.stringify(items)}></span>
  </section>
}`;

test('closed collection expressions retain types, lexical dependencies and SSR semantics', () => {
  const program = prepareProgram(requireIR(compile(source)));
  const rendered = program.render('Todos', { initial: [{ id: 1, title: 'Read', completed: false }, { id: 2, title: 'Write', completed: true }] });
  assert.match(rendered.html, /1 item/);
  assert.match(rendered.html, /Read/);
  assert.doesNotMatch(rendered.html, />Write</);
  const generated = program.get('Todos').generate();
  assert.ok(generated.handlers.some(handler => handler.event === 'keydown'));
  assert.match(generated.regions.code, /\.filter\(/);
  assert.doesNotMatch(generated.regions.code, /eval\(|new Function/);
});

test('collection callbacks reject wrong return types, shadowing, effects and arbitrary methods', () => {
  for (const invalid of [
    source.replace('!todo.completed', 'todo.title'),
    source.replace('completed: true', 'completed: "yes"'),
    source.replace('filter(todo => !todo.completed)', 'filter(items => true)'),
    source.replace('event.value.trim()', 'event.value.toUpperCase()'),
    source.replace('JSON.parse<Todo[]>', 'JSON.parse<Missing[]>'),
    source.replace('count === 1 ? "1 item" : "Other items"', 'count === 1 ? "1 item" : 2'),
    source.replace('Todos(initial: Todo[])', 'Todos(JSON: string, initial: Todo[])'),
  ]) assert.equal(compile(invalid).ok, false, invalid);
});

test('collection expressions still report free-variable derive cycles', () => {
  const result = compile(source.replace('derive active = items.filter(todo => !todo.completed);', 'derive active: Todo[] = later.filter(todo => !todo.completed); derive later: Todo[] = active;'));
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'E_DERIVE_CYCLE');
});

test('typed JSON rejects malformed and extra-field payloads before committing a transaction', async () => {
  const type = { array: { record: { id: 'number', title: 'string', completed: 'boolean' } } };
  const original = [{ id: 1, title: 'Keep', completed: false }];
  const scope = { _values: [original], _validate(index, value) { assert.equal(index, 0); assert.ok(validValue(type, value)); }, _set(index, value) { this._values[index] = value; } };
  for (const input of ['{', '{}', '[{"id":1,"title":3,"completed":false}]', '[{"id":1,"title":"X","completed":false,"extra":true}]']) {
    await assert.rejects(runTransaction(scope, (values, set) => { set(0, []); set(0, parseJSON(input, type)); }, {}, () => true));
    assert.equal(scope._values[0], original);
  }
  assert.deepEqual(parseJSON(JSON.stringify(original), type), original);
});

test('primitive conditional and string expressions select their supported backend without explicit control blocks', () => {
  const program = prepareProgram(requireIR(compile('component Label(text: string, short: boolean) { <p>{short ? text.trim() : text}</p> }')));
  assert.equal(program.render('Label', { text: ' label ', short: true }, { mode: 'ssr' }).html, '<p>label</p>');
});
