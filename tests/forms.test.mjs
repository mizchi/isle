import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compile, requireIR } from '../lib/compiler.mjs';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';
import { runTransaction } from '../runtime/client.mjs';

const source = await readFile(new URL('../evals/scenarios/forms/fixture.isle', import.meta.url), 'utf8');
const input = text => requireIR(compile(text)).components[0];

test('forms expose typed event values without capturing an Event in the snapshot', async () => {
  const component = input(source), generated = generateComponent(component);
  assert.deepEqual(generated.events, ['submit', 'input', 'invalid', 'change']);
  assert.deepEqual(generated.analysis.snapshotSlots, ['email', 'accepted', 'invalid', 'error', 'submitted']);
  const fields = generated.fields.map(field => field.name), patches = [];
  const scope = { _values: renderComponent(component, { initial: '' }).snapshot[3],
    _validate(index, value) { assert.equal(typeof value, generated.fields[index].type); },
    _set(index, value) { this._values[index] = value; }, _text(...args) { patches.push(args); }, _attribute(...args) { patches.push(args); } };
  for (const [id, payload] of [
    ['edit', { type: 'input', value: 'hello@example.com', invalid: false, validationMessage: '' }],
    ['consent', { type: 'change', checked: true }], ['save', { type: 'submit' }],
  ]) {
    const handler = generated.handlers.find(handler => handler.id === `Signup.${id}`);
    await runTransaction(scope, (await import(`data:text/javascript,${encodeURIComponent(handler.code)}`)).run, payload, () => true, handler.captures);
  }
  assert.equal(scope._values[fields.indexOf('submitted')], 'hello@example.com');
  assert.equal(scope._values[fields.indexOf('accepted')], true);
  const handler = generated.handlers.find(handler => handler.id === 'Signup.edit');
  const before = scope._values.slice(), count = patches.length;
  await assert.rejects(runTransaction(scope, (await import(`data:text/javascript,${encodeURIComponent(handler.code)}`)).run,
    { type: 'input', value: 3, invalid: false, validationMessage: '' }, () => true, handler.captures));
  assert.deepEqual(scope._values, before);
  assert.equal(patches.length, count);
});

test('SSR keeps native constraints, omits false boolean attributes and scopes ID references per mount', () => {
  const component = input(source), a = renderComponent(component, { initial: '' }, { scopeId: 'a' });
  const b = renderComponent(component, { initial: '' }, { scopeId: 'b', mode: 'ssr' });
  assert.match(a.html, / required/);
  assert.match(a.html, /minlength="6" maxlength="80"/);
  assert.doesNotMatch(a.html, / checked(?:[\s=>])/);
  assert.match(a.html, /id="isle-a:email"/);
  assert.match(a.html, /for="isle-a:email"/);
  assert.match(a.html, /aria-describedby="isle-a:email-help isle-a:email-error"/);
  assert.match(b.html, /id="isle-b:email"/);
  assert.doesNotMatch(b.html, /data-isle-|<!--i:|<script/);
  assert.equal(b.snapshot, null);
});

test('accessibility and event contracts reject invalid controls with source locations', () => {
  const cases = [
    ['<input />', 'E_A11Y_LABEL'],
    ['<input placeholder="Name" />', 'E_A11Y_LABEL'],
    ['<label for="missing">Name</label>', 'E_A11Y_REFERENCE'],
    ['<input aria-label="Name" aria-describedby="missing" />', 'E_A11Y_REFERENCE'],
    ['<div><p id="same">A</p><p id="same">B</p></div>', 'E_A11Y_ID'],
    ['<div><label for="hint">Name</label><p id="hint">Not a control</p></div>', 'E_A11Y_REFERENCE'],
    ['<form><button>Save</button></form>', 'E_FORM_BUTTON_TYPE'],
    ['<form><form></form></form>', 'E_FORM_NESTING'],
    ['<input aria-label="Name" required="false" />', 'E_ATTRIBUTE_TYPE'],
    ['<p required>Bad target</p>', 'E_FORM_CONSTRAINT'],
    ['<input aria-label="Name" checked />', 'E_FORM_CONSTRAINT'],
    ['<input aria-label="Name" minlength={-1} />', 'E_FORM_CONSTRAINT'],
    ['<input aria-label="Name" pattern={count} />', 'E_FORM_CONSTRAINT'],
    ['<input aria-label="Name" minlength="8" maxlength="2" />', 'E_FORM_CONSTRAINT'],
    ['<input aria-label="Name" min="8" max="2" type="number" />', 'E_FORM_CONSTRAINT'],
    ['<div><span id="empty"></span><input aria-labelledby="empty" /></div>', 'E_A11Y_LABEL'],
    ['<label>Two<div><input /><input /></div></label>', 'E_A11Y_LABEL'],
    ['<div>on submit save { count += 1; }</div>', 'E_EVENT_TARGET'],
    ['<input aria-label="Name">on input edit { count = event.checked; }</input>', 'E_EVENT_FIELD'],
    ['<button>on click { count = event.value; }Save</button>', 'E_EVENT_FIELD'],
    ['<p>{event.value}</p>', 'E_EVENT_SCOPE'],
  ];
  for (const [template, code] of cases) {
    const text = `export client component Bad() { state count = 0; ${template} }`;
    const result = compile(text);
    assert.equal(result.ok, false, template);
    assert.equal(result.diagnostics[0].code, code, JSON.stringify(result));
    assert.ok(result.diagnostics[0].start >= text.indexOf('<'), template);
    assert.ok(result.diagnostics[0].end > result.diagnostics[0].start, template);
  }
});

test('textarea and select use native initial values rather than ineffective value attributes', () => {
  const component = input(`export client component Controls({ initial }: { initial: string }) {
    state text = initial;
    <div><label>Notes<textarea value={text}>on input edit { text = event.value; }</textarea></label>
      <label>Choice<select value={text}><option value="one">One</option><option value="two">Two</option></select></label>
    </div>
  }`);
  const html = renderComponent(component, { initial: 'two' }).html;
  assert.match(html, /<textarea[^>]*>two<\/textarea>/);
  assert.match(html, /<option value="two" selected>Two<\/option>/);
  assert.doesNotMatch(html, /<(?:textarea|select)[^>]* value=/);
  const textarea = input('export client component Notes({ initial }: { initial: string }) { <label>Notes<textarea value={initial}></textarea></label> }');
  assert.match(renderComponent(textarea, { initial: '\n<&' }).html, /<textarea[^>]*>\n\n&lt;&amp;<\/textarea>/);
  assert.throws(() => renderComponent(component, { initial: 'missing' }), /Select value/);
});

test('invalid patterns and event expressions outside handlers cannot pass through manual IR', () => {
  const component = input(source);
  component.states[0].initial = { kind: 'event', field: 'value' };
  assert.throws(() => generateComponent(component), /Event values/);
  const bad = compile('export client component Pattern() { <label>Code<input pattern="[" /></label> }');
  assert.equal(bad.ok, false);
  assert.equal(bad.diagnostics[0].code, 'E_FORM_PATTERN');
  const pattern = input('export client component Pattern() { <label>Code<input pattern="[a-z]+" /></label> }');
  pattern.root.children[1].attributes[0].value.value = '[';
  assert.throws(() => generateComponent(pattern), /Invalid form pattern/);
});

test('wrapping labels, named references and hidden inputs are accepted', () => {
  for (const template of [
    '<label>Name<input /></label>',
    '<div><span id="name">Name</span><input aria-labelledby="name" /></div>',
    '<input type="hidden" name="token" value="x" />',
    '<form><button type="submit">Save</button></form>',
    '<input aria-label="Name" required={false} />',
    '<div><span id="name">Name</span><input aria-labelledby="\tname\n" /></div>',
  ]) assert.equal(compile(`export client component Good() { ${template} }`).ok, true, template);
});

test('native output and button labels compile and keep mount-local references', () => {
  const component = input(`component Summary() {
    <div><label for="total">Total reviews</label><output id="total">3</output>
      <label for="save">Save review</label><button id="save" type="button">Save</button>
      <label>Open reviews<output>2</output></label>
    </div>
  }`);
  const html = renderComponent(component, {}, {scopeId:'summary',mode:'ssr'}).html;
  assert.match(html, /for="isle-summary:total"/);
  assert.match(html, /<output id="isle-summary:total">3<\/output>/);
  const bad = compile('component Bad() { <label>Summary<output>1</output><button type="button">Save</button></label> }');
  assert.equal(bad.ok, false);
  assert.equal(bad.diagnostics[0].code, 'E_A11Y_LABEL');
  assert.equal(compile('component Bad() { <div><label for="token">Token</label><input id="token" type="hidden" /></div> }').ok, false);
});
