import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compile, requireIR } from '../lib/compiler.mjs';
import { generateComponent, renderComponent, prepareComponent } from '../lib/codegen.mjs';
import { isle } from '../lib/vite.mjs';
import { runTransaction } from '../runtime/client.mjs';
import { source, prefix, suffix, attributes } from '../benchmarks/static-scenario.mjs';

const component = input => requireIR(compile(input)).components[0];

test('immutable decoration stays in HTML and only the changing string crosses the resume boundary', async () => {
  const input = component(source), generated = generateComponent(input);
  assert.deepEqual(generated.fields.map(field => field.name), ['title']);
  assert.deepEqual(generated.handlers[0].captureNames, ['title']);
  const rendered = renderComponent(input, { initial: 'Draft' });
  assert.deepEqual(rendered.snapshot[3], ['Draft']);
  assert.ok(rendered.html.includes(`<!--i:0-->${prefix}Draft${suffix}<!---->`));
  assert.ok(!rendered.snapshotHtml.includes('catalog-'));
  assert.ok(!generated.handlers[0].code.includes('catalog-'));
  assert.ok(!generated.handlers[0].code.includes('fixed suffix'));
  const module = await import(`data:text/javascript,${encodeURIComponent(generated.handlers[0].code)}`);
  const values = ['Draft'], patches = [];
  await module.run(values, (key, value) => { values[key] = value; }, (key, value) => patches.push([key, value]));
  assert.deepEqual(patches, [[0, 'Draft!']]);
  const changed = component(source.replace('fixed suffix', 'other suffix'));
  assert.equal(generateComponent(changed).schemaId, generated.schemaId, 'static-only edits do not invalidate the resume contract');
  assert.equal(generateComponent(changed).handlers[0].code, generated.handlers[0].code);
});

test('static-only edits preserve hashed JavaScript while changing the rendered HTML', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-static-cache-'));
  try {
    const entry = join(directory, 'app.isle');
    await writeFile(join(directory, 'index.html'), '<html><head></head><body><!--isle:ssr--></body></html>');
    const compile = () => build({ configFile: false, root: directory, logLevel: 'silent', plugins: [isle({ entry,
      mounts: [{ component: 'Decorated', props: { initial: 'Draft' }, label: 'Decorated' }] })], build: { write: false } });
    await writeFile(entry, source);
    const first = (await compile()).output;
    await writeFile(entry, source.replace('fixed suffix', 'other suffix'));
    const second = (await compile()).output;
    const scripts = output => output.filter(item => item.type === 'chunk').map(item => [item.fileName, item.code]).sort();
    assert.deepEqual(scripts(second), scripts(first));
    assert.notEqual(second.find(item => item.fileName === 'index.html').source, first.find(item => item.fileName === 'index.html').source);
    await writeFile(entry, source.replace('<button>', '<section><p>Extra static content</p><button>').replace('</button>', '</button></section>'));
    assert.deepEqual(scripts((await compile()).output), scripts(first), 'static layout and source positions do not invalidate dynamic assets');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('constant propagation removes immutable state and SSR skips unused initialization work', async () => {
  const input = component(`export client component Counter() {
    state count = 1;
    state step = 2 + 3;
    state unused = step * 100;
    derive increment = step * 2;
    <button>on click add { count += increment; }{count}</button>
  }`);
  const prepared = prepareComponent(input), generated = prepared.generate();
  assert.deepEqual(generated.fields.map(field => field.name), ['count']);
  assert.ok(generated.analysis.folded.includes('step'));
  assert.deepEqual(generated.analysis.serverStates, ['count']);
  const module = await import(`data:text/javascript,${encodeURIComponent(generated.handlers[0].code)}`);
  const values = [1];
  await module.run(values, (key, value) => { values[key] = value; }, () => {});
  assert.deepEqual(values, [11]);
  assert.ok(prepared.render({}, { mode: 'ssr' }).html.includes('>1</button>'));
});

test('SSR-only rendering does not evaluate or serialize state used exclusively by events', () => {
  const input = component(`export client component Static() {
    state eventOnly = ${'9'.repeat(200)} * ${'9'.repeat(200)};
    <button>on click hidden { eventOnly += 1; }Static output</button>
  }`);
  assert.equal(renderComponent(input, {}, { mode: 'ssr' }).html, '<button>Static output</button>');
  assert.throws(() => renderComponent(input, {}), /snapshot.eventOnly must be number/);
});

test('a state written by another event stays dynamic even when its initializer is a literal', async () => {
  const input = component(`export client component Counter() {
    state count = 0;
    state step = 5;
    <button>on click add { count += step; }on change grow { step += 1; }{count}</button>
  }`);
  const generated = generateComponent(input), values = renderComponent(input, {}).snapshot[3];
  assert.deepEqual(generated.fields.map(field => field.name), ['count', 'step']);
  const scope = { _values: values, _validate() {}, _set(key, value) { values[key] = value; }, _text() {} };
  for (const index of [0, 1, 0]) {
    const handler = generated.handlers[index], module = await import(`data:text/javascript,${encodeURIComponent(handler.code)}`);
    await runTransaction(scope, module.run, {}, () => true, handler.captures);
  }
  assert.deepEqual(values, [11, 6]);
});

test('constant propagation preserves validation of non-serializable numeric state', () => {
  const input = component('export client component Counter() { state count = 1; state step = 0; <button>on click { count += step; }{count}</button> }');
  for (const value of [-0, NaN, Infinity]) {
    const variant = structuredClone(input);
    variant.states.find(state => state.name === 'step').initial = { kind: 'number', value };
    assert.throws(() => renderComponent(variant, {}), /snapshot.step must be number/);
  }
});

test('unsafe HTML text boundaries are kept whole and numeric addition is never split as text', () => {
  const input = component(source);
  for (const value of ['\r', '\0', '\ud800']) {
    const variant = structuredClone(input);
    variant.states.find(state => state.name === 'prefix').initial = { kind: 'string', value };
    const generated = generateComponent(variant);
    assert.ok(generated.handlers[0].code.includes(JSON.stringify(value)), 'unsafe prefix stays in the update expression');
  }
  const newline = structuredClone(input);
  newline.states.find(state => state.name === 'suffix').initial = { kind: 'string', value: '\nend' };
  assert.ok(generateComponent(newline).handlers[0].code.includes(JSON.stringify('\nend')), 'a newline suffix may join a dynamic CR during HTML parsing');
  const numeric = component('export client component Counter() { state count = 1; <button>on click { count += 1; }{100 + count + 200}</button> }');
  const rendered = renderComponent(numeric, {});
  assert.match(rendered.html, /<!--i:0-->301<!---->/);
});

test('prepared rendering reuses static subtrees across instances and retains prop validation', () => {
  const input = component(`export client component Counter({ initial }: { initial: number }) {
    state count = initial;
    <div><section><p>Static &amp; content</p><span title="constant">Fixed</span></section>
      <button>on click { count += 1; }{count}</button></div>
  }`);
  const prepared = prepareComponent(input);
  assert.ok(prepared.generate().analysis.staticFragments > 0);
  assert.equal(prepared.generate().analysis.resumeRoot.tag, 'button');
  assert.match(prepared.render({ initial: 37 }).html, /<button data-isle-root="s0"/);
  assert.ok(!prepared.render({ initial: 37 }).html.startsWith('<div data-isle-root='));
  assert.match(prepared.render({ initial: 37 }).html, /<!--i:0-->37<!---->/);
  assert.match(prepared.render({ initial: 5 }).html, /<!--i:0-->5<!---->/);
  assert.throws(() => prepared.render({ initial: 'bad' }), /must be number/);
  prepared.generate().fields[0].type = 'string';
  assert.match(prepared.render({ initial: 8 }).html, /<!--i:0-->8<!---->/, 'returned metadata cannot mutate the prepared plan');
});

test('attribute-only builds remove text restoration while retaining attribute updates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-static-build-'));
  try {
    const entry = join(directory, 'app.isle');
    await writeFile(entry, attributes);
    await writeFile(join(directory, 'index.html'), '<html><head></head><body><!--isle:ssr--></body></html>');
    const result = await build({ configFile: false, root: directory, logLevel: 'silent', plugins: [isle({ entry,
      mounts: [{ component: 'AttributeOnly', props: {}, label: 'Attribute only' }] })], build: { write: false } });
    const code = result.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
    assert.ok(!code.includes('createTreeWalker'));
    assert.ok(!code.includes('createTextNode'));
    assert.ok(code.includes('setAttribute'));
    const html = result.output.find(item => item.fileName === 'index.html').source;
    assert.ok(!html.includes('<!--i:'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
