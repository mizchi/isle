import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { readFileSync } from 'node:fs';
import { prepareProgram } from '../lib/codegen.mjs';

const source = readFileSync(new URL('../evals/scenarios/control-flow/fixture.isle', import.meta.url), 'utf8');

test('control syntax lowers to typed regions and renders SSR without resume machinery', () => {
  const ir = requireIR(compile(source)), program = prepareProgram(ir);
  const html = program.render('Controls', { initial: [{ id: 'a', value: 10 }, { id: 'b', value: 20 }] }, { mode: 'ssr' });
  assert.match(html.html, /data-key="a"/);
  assert.match(html.html, /Visible/);
  assert.doesNotMatch(html.html, /data-isle-|<!--r:/);
  assert.equal(html.snapshot, null);
  const generated = program.get('Controls').generate();
  assert.ok(generated.regions);
  assert.equal(generated.handlers.length, 9);
});

test('every arm is checked; keys are mandatory, immutable and not array indexes', () => {
  for (const [source, expected] of [
    ['client component C() { <div>@if (true) {<p>{missing}</p>}</div> }', 'E_UNKNOWN_NAME'],
    ['client component C() { <div>@if (1) {<p>A</p>}</div> }', 'E_CONTROL_TYPE'],
    ['component C(xs: string[]) { <ul>@for (const x of xs) {<li>{x}</li>}</ul> }', 'E_SYNTAX'],
    ['component C(xs: string[]) { <ul>@for (const x of xs; index i; key i) {<li>{x}</li>}</ul> }', 'E_CONTROL_KEY'],
    ['client component C(xs: string[]) { state n=0; <ul>@for (const x of xs; key n) {<li>{x}</li>}</ul> }', 'E_CONTROL_KEY'],
    ['component C() { <div>@switch ("a") { @case "a": {<p>A</p>} @case "a": {<p>B</p>} }</div> }', 'E_CONTROL_CASE'],
  ]) {
    const result = compile(source);
    assert.equal(result.ok, false, source);
    assert.equal(result.diagnostics[0].code, expected, JSON.stringify(result));
  }
});

test('closed records, array literals, boolean operators and synchronous render fallbacks are checked', () => {
  const ir = requireIR(compile(`schema Item { id: string; value: number; }
    client component C() { state items: Item[] = [{ id: "a", value: 2 }]; state n=0;
    <div><button type="button">on click clear { items = []; }Clear</button>
      @if (!(n > 0) && items.length === 1) {<p>One</p>}
      @try {<p>{items[1].value}</p>} @catch(error) {<p>{error}</p>}
    </div> }`));
  const rendered = prepareProgram(ir).render('C', {});
  assert.match(rendered.html, />One<\/p>/);
  assert.match(rendered.html, /Render failed/);
  assert.equal(compile('component C() { <div>@try {<p>Ready</p>} @pending {<p>Wait</p>} @catch(e) {<p>{e}</p>}</div> }').diagnostics[0].code, 'E_RESOURCE_PENDING');
  assert.equal(compile('client component C() { state xs: number[] = ["wrong"]; <div/> }').diagnostics[0].code, 'E_STATE_TYPE');
  assert.equal(compile('component C(xs: readonly number[]) { <div>@for(const x of xs; key x){<p>{x}</p>}</div> }').ok, true);
  assert.equal(compile('component C(x: readonly number) { <p>{x}</p> }').diagnostics[0].code, 'E_TYPE');
});

test('SSR skips event-only initializers and duplicate keys fail before HTML is published', () => {
  const ir = requireIR(compile('client component C(xs: number[]) { state spare = xs[100]; <div><button type="button">on click add { spare += 1; }Add</button>@if (true) {<p>Static</p>}</div> }'));
  assert.doesNotThrow(() => prepareProgram(ir).render('C', { xs: [] }, { mode: 'ssr' }));
  const program = prepareProgram(requireIR(compile(source)));
  assert.throws(() => program.render('Controls', { initial: [{ id: 'a', value: 1 }, { id: 'a', value: 2 }] }), /Duplicate row key/);
});

test('unsupported cross-owner and cross-frame label edges fail with compiler diagnostics', () => {
  for (const code of [
    'client component Child() { <button>on click add {}Add</button> } client component C() { <div>@if (true) {<Child/>}</div> }',
    'component C() { <div><label for="x">X</label>@if (true) {<input id="x" type="text" aria-label="X"/>}</div> }',
  ]) assert.equal(compile(code).diagnostics[0].code, 'E_CONTROL_CONTRACT');
});
