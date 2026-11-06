import test from 'node:test';
import assert from 'node:assert/strict';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';

const counter = {
  name: 'Counter', side: 'client', props: [{ name: 'initial', type: 'number' }],
  states: [{ name: 'count', type: 'number', initial: { kind: 'name', name: 'initial' } }], derives: [],
  root: { kind: 'element', tag: 'button', attributes: [],
    handlers: [{ id: 'h0', event: 'click', async: false, statements: [{ target: 'count', op: '+=', value: { kind: 'number', value: 1 } }] }],
    children: [{ kind: 'expression', value: { kind: 'name', name: 'count' } }] },
};

test('resume wire v2 stores ordered slots and rejects accidental identifier transfer', () => {
  const generated = generateComponent(counter);
  const { snapshot, snapshotHtml } = renderComponent(counter, { initial: 37 }, { scopeId: 'a' });
  assert.deepEqual(snapshot, [2, generated.schemaId, 'a', [37]]);
  assert.ok(!snapshotHtml.includes('"count"'));
  assert.ok(!snapshotHtml.includes('"component"'));
});

test('lazy handler ABI uses positional arguments so minifiers need no cross-chunk property map', async () => {
  const generated = generateComponent(counter);
  const module = await import(`data:text/javascript,${encodeURIComponent(generated.handlers[0].code)}`);
  const values = [37], patches = [];
  await module.run(values, (index, value) => { values[index] = value; }, (index, value) => patches.push([index, value]));
  assert.deepEqual(values, [38]);
  assert.deepEqual(patches, [[0, '38']]);
});

test('SSR-only folds values into HTML without emitting any resume machinery', () => {
  const rendered = renderComponent(counter, { initial: 37 }, { scopeId: 'static', mode: 'ssr' });
  assert.equal(rendered.html, '<button>37</button>');
  assert.equal(rendered.snapshot, null);
  assert.equal(rendered.snapshotHtml, '');
});

test('client components without handlers are automatically static', () => {
  const component = { ...counter, root: { ...counter.root, handlers: [] } };
  const rendered = renderComponent(component, { initial: 37 });
  assert.equal(rendered.html, '<button>37</button>');
  assert.equal(rendered.snapshotHtml, '');
});

test('each handler captures its own slots and uses a compact local values array', async () => {
  const component = { ...counter, states: [...counter.states, { name: 'other', type: 'number', initial: { kind: 'number', value: 100 } }],
    root: { ...counter.root, handlers: [...counter.root.handlers,
      { id: 'h1', event: 'change', async: false, statements: [{ target: 'other', op: '+=', value: { kind: 'number', value: 1 } }] }],
      children: [...counter.root.children, { kind: 'expression', value: { kind: 'name', name: 'other' } }] } };
  const generated = generateComponent(component), handler = generated.handlers[1];
  assert.deepEqual(handler.captures, [1]);
  const { snapshot } = renderComponent(component, { initial: 37 });
  const values = handler.captures.map(index => snapshot[3][index]);
  const module = await import(`data:text/javascript,${encodeURIComponent(handler.code)}`);
  const patches = [];
  await module.run(values, (index, value) => { values[index] = value; }, (index, value) => patches.push(value));
  assert.deepEqual(values, [101]);
  assert.deepEqual(patches, ['101']);
});
