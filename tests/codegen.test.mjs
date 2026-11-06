import test from 'node:test';
import assert from 'node:assert/strict';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';

const num = value => ({ kind: 'number', value });
const name = name => ({ kind: 'name', name });
export const counter = {
  name: 'Counter', side: 'client', props: [{ name: 'initial', type: 'number' }],
  states: [{ name: 'count', type: 'number', initial: name('initial') },
    { name: 'unused', type: 'number', initial: num(999) }],
  derives: [{ name: 'doubled', value: { kind: 'binary', op: '*', left: name('count'), right: num(2) } }],
  root: { kind: 'element', tag: 'button', attributes: [], handlers: [
    { id: 'h0', event: 'click', async: false, statements: [{ target: 'count', op: '+=', value: num(1) }] },
  ], children: [ { kind: 'expression', value: name('count') }, { kind: 'text', value: ' / ' },
    { kind: 'expression', value: name('doubled') } ] },
};

test('SSR preserves request value, emits resume markers and prunes unused state', () => {
  const { html, snapshot } = renderComponent(counter, { initial: 37 }, { scopeId: 'a' });
  assert.match(html, />37<!--/);
  assert.match(html, />74<!--/);
  assert.deepEqual(snapshot[3], [37]);
  assert.equal(snapshot[2], 'a');
  assert.ok(!JSON.stringify(snapshot).includes('999'));
});

test('generated handler resumes saved values without executing state initializers', async () => {
  const generated = generateComponent(counter);
  const source = generated.handlers[0].code;
  assert.ok(!source.includes('initial'));
  assert.ok(!source.includes('999'));
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  const values = [37];
  const text = new Map();
  await module.run(values, (key, value) => { values[key] = value; }, (key, value) => text.set(key, value));
  assert.equal(values[0], 38);
  assert.deepEqual([...text.values()], ['38', '76']);
});

test('HTML and snapshot are escaped independently', () => {
  const c = { ...counter, props: [], states: [{ name: 'count', type: 'string', initial: { kind: 'string', value: '</script><img onerror=1>' } }],
    derives: [], root: { ...counter.root, children: [{ kind: 'expression', value: name('count') }] } };
  const { html, snapshotHtml } = renderComponent(c, {}, { scopeId: 'safe' });
  assert.ok(!html.includes('<img'));
  assert.ok(!snapshotHtml.includes('</script><img'));
  assert.ok(snapshotHtml.includes('\\u003c'));
});

test('opaque expression calls and unsafe tags fail closed in the backend too', () => {
  assert.throws(() => generateComponent({ ...counter, root: { ...counter.root, tag: 'script' } }), /tag/i);
  assert.throws(() => generateComponent({ ...counter, states: [{ name: 'count', initial: { kind: 'call', name: 'eval' } }] }), /expression/i);
});

test('native boolean attributes omit false instead of serializing disabled="false"', () => {
  const c = { ...counter, root: { ...counter.root, attributes: [{ name: 'disabled', value: { kind: 'boolean', value: false } }] } };
  assert.ok(!renderComponent(c, { initial: 37 }).html.includes('disabled'));
  c.root.attributes[0].value.value = true;
  assert.match(renderComponent(c, { initial: 37 }).html, / disabled(?:>|\s)/);
});
