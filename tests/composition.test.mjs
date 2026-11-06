import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';

const counter = `export client component Counter(initial: number) {
  state count = initial;
  <button type="button">on click increment { count += 1; }{count}</button>
}`;

test('forward component references render nested independent client instances and collect their code', () => {
  const ir = requireIR(compile(`export server component Page(seed: number) {
    <main><Counter initial={seed} /><Counter initial={seed + 1} /></main>
  } ${counter}`));
  const program = prepareProgram(ir);
  const result = program.render('Page', { seed: 5 }, { scopeId: 'page' });
  assert.match(result.html, /<main><button[^>]*>.*5.*<\/button>/);
  const snapshots = [...result.html.matchAll(/data-isle-snapshot="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(snapshots).size, 2); assert.equal(result.snapshot, null);
  assert.deepEqual(program.reachable('Page'), ['Page', 'Counter']);
  assert.deepEqual(program.get('Counter').generate().handlers.map(handler => handler.id), ['Counter.increment']);
  const ssr = program.render('Page', { seed: 5 }, { mode: 'ssr' });
  assert.equal(ssr.html, '<main><button type="button">5</button><button type="button">6</button></main>');
  assert.equal(ssr.snapshot, null);
});

test('pure components inline live props and namespace their local IDs without extra owners', async () => {
  const ir = requireIR(compile(`component Label(value: number) {
    derive doubled = value * 2;
    <p id="value" aria-live="polite">{doubled}</p>
  }
  client component Parent(initial: number) {
    state count = initial;
    <div><button type="button">on click increment { count += 1; }Add</button>
      <Label value={count} /><Label value={count + 1} />
    </div>
  }`));
  const program = prepareProgram(ir), generated = program.get('Parent').generate();
  assert.deepEqual(program.reachable('Parent'), ['Parent']);
  assert.equal(generated.handlers.length, 1);
  const rendered = program.render('Parent', { initial: 5 }, { scopeId: 'p' });
  assert.equal([...rendered.html.matchAll(/data-isle-root=/g)].length, 1);
  const ids = [...rendered.html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, 2);
  const handler = generated.handlers[0], values = handler.captures.map(index => rendered.snapshot[3][index]), patches = [];
  const module = await import(`data:text/javascript,${encodeURIComponent(handler.code)}`);
  await module.run(values, (index, value) => { values[index] = value; }, (_, value) => patches.push(value));
  assert.deepEqual(patches, ['12', '14']);
});

test('children are lexical render fragments, projected through pure wrappers without serialization', () => {
  const ir = requireIR(compile(`component Card(title: string, children: RenderFragment) {
    <section><h2>{title}</h2>{children}</section>
  }
  server component Page(initial: number) {
    <Card title="Nested"><p>Before</p><Counter initial={initial} /></Card>
  } ${counter}`));
  const program = prepareProgram(ir), result = program.render('Page', { initial: 7 });
  assert.match(result.html, /^<section><h2>Nested<\/h2><p>Before<\/p><button/);
  assert.deepEqual(program.get('Page').generate().fields, []);
  assert.deepEqual(program.reachable('Page'), ['Page', 'Counter']);
});

test('an opaque children projection can cross a client wrapper while keeping server content static', () => {
  const ir = requireIR(compile(`server component Note(message: string) { <p>{message}</p> }
    client component Panel(children: RenderFragment) {
      state count = 0;
      <section><button type="button">on click add { count += 1; }{count}</button>{children}</section>
    }
    server component Page() { <Panel><Note message="Server content" /><Counter initial={5} /></Panel> }
    ${counter}`));
  const program = prepareProgram(ir), result = program.render('Page', {}, { scopeId: 'page' });
  assert.match(result.html, /Server content/);
  assert.deepEqual(program.reachable('Page'), ['Page', 'Panel', 'Counter']);
  assert.equal([...result.html.matchAll(/data-isle-snapshot=/g)].length, 2);
  assert.ok(!JSON.stringify(result.html).includes('RenderFragment'));
});

test('component contracts reject unknown targets, invalid props, phase leaks and recursive expansion', () => {
  for (const [source, code] of [
    ['component Page() { <Missing /> }', 'E_COMPONENT_UNKNOWN'],
    [`server component Page() { <Counter /> } ${counter}`, 'E_COMPONENT_PROPS'],
    [`server component Page() { <Counter initial="5" /> } ${counter}`, 'E_COMPONENT_PROPS'],
    [`server component Page() { <Counter initial={5} extra /> } ${counter}`, 'E_COMPONENT_PROPS'],
    [`server component Page() { <Counter initial={5} initial={6} /> } ${counter}`, 'E_COMPONENT_PROPS'],
    [`component Page() { <Counter initial={5} /> } ${counter}`, 'E_COMPONENT_PHASE'],
    ['server component Secret() { <p>Server</p> } client component Page() { <Secret /> }', 'E_COMPONENT_PHASE'],
    ['component A() { <B /> } component B() { <A /> }', 'E_COMPONENT_CYCLE'],
    ['component A() { <A /> }', 'E_COMPONENT_CYCLE'],
    ['component Label() { <p>Label</p> } component Page() { <Label><p>Dropped</p></Label> }', 'E_COMPONENT_CHILDREN'],
    ['component Card(children: RenderFragment) { <div>{children}{children}</div> }', 'E_COMPONENT_CHILDREN'],
    [`client component Parent() { state count = 0; <div><button>on click { count += 1; }Add</button><Counter initial={count} /></div> } ${counter}`, 'E_COMPONENT_CAPTURE'],
    ['component Inner() { <form aria-label="Inner"><button type="submit">Save</button></form> } component Outer() { <form aria-label="Outer"><Inner /></form> }', 'E_FORM_NESTING'],
    ['component Inner() { <div>Invalid</div> } component Outer() { <select aria-label="Choose"><Inner /></select> }', 'E_COMPONENT_HTML'],
    ['component Inner() { <div>Invalid</div> } component Outer() { <input aria-label="Input"><Inner /></input> }', 'E_COMPONENT_HTML'],
  ]) {
    const result = compile(source); assert.equal(result.ok, false, source); assert.equal(result.diagnostics[0].code, code, source);
  }
});

test('program preparation owns its graph and detects collisions between explicit and generated scope IDs', () => {
  const ir = requireIR(compile(`server component Page() { <Counter initial={5} /> } ${counter}`));
  const program = prepareProgram(ir);
  ir.components[0].root.component = 'Missing';
  assert.deepEqual(program.reachable('Page'), ['Page', 'Counter']);
  assert.match(program.render('Page', {}).html, />.*5.*<\/button>/);
  assert.throws(() => program.renderAll([
    { component: 'Page', props: {}, scopeId: 'page', label: 'Parent' },
    { component: 'Counter', props: { initial: 1 }, scopeId: 'page/c0', label: 'Collision' },
  ]), /scope/);
});
