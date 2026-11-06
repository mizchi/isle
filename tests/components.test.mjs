import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';

test('universal component is the pure intersection of server and client components', () => {
  const body = 'Label({ title }: { title: string }) { derive text = title + "!"; <p>{text}</p> }';
  const components = ['', 'server ', 'client '].map(side => requireIR(compile(`export ${side}component ${body}`)).components[0]);
  assert.deepEqual(components.map(component => component.side), ['universal', 'server', 'client']);
  for (const component of components) {
    for (const mode of ['resume', 'ssr']) {
      assert.deepEqual(renderComponent(component, { title: '<safe>' }, { mode }), { html: '<p>&lt;safe&gt;!</p>', snapshot: null, snapshotHtml: '' });
    }
    assert.deepEqual(generateComponent(component).handlers, []);
    assert.throws(() => renderComponent(component, { title: 1 }), /props/);
  }
});

test('universal rejects client features and keeps remote execution explicit', () => {
  for (const [source, code] of [
    ['component Bad() { state count = 0; <p>{count}</p> }', 'E_COMPONENT_STATE'],
    ['component Bad() { <button>on click {}Click</button> }', 'E_COMPONENT_EVENT'],
    ['component Bad() { derive value = event.value; <p>{value}</p> }', 'E_EVENT_SCOPE'],
  ]) {
    const result = compile(source); assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, code);
  }
});

test('universal schema forms cannot acquire client behavior during lowering', () => {
  const source = `schema Input { title: string; } view Output { title: string; }
    export server action save(input: Input): Output using request: RequestContext
      authorize grant = policy.edit(request, input.title) effects { db.write }
      { return await documents.save(grant, input.title); }
    component Form() { <form schema="Input" submit="save" aria-label="Save">
      <label>Title<input name="title" /></label><button type="submit">Save</button>
    </form> }`;
  const result = compile(source); assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, 'E_FORM_SCHEMA');
});

test('the backend rejects state and handlers in universal IR too', () => {
  const pure = { name: 'Label', side: 'universal', props: [], states: [], derives: [],
    root: { kind: 'element', tag: 'button', attributes: [], children: [{ kind: 'text', value: 'Click' }], handlers: [] } };
  assert.throws(() => generateComponent({ ...pure, states: [{ name: 'count', type: 'number', initial: { kind: 'number', value: 0 } }] }), /state/i);
  assert.throws(() => generateComponent({ ...pure, root: { ...pure.root, handlers: [{ id: 'click', event: 'click', async: false, statements: [] }] } }), /client/i);
});

test('direct typed props and legacy destructuring produce the same runtime contracts', () => {
  const body = ' { state count = initial; derive label = title + "!"; <button>on click reset { count = initial; }{label}{count}{enabled}</button> }';
  const [direct, legacy] = ['(initial: number, title: string, enabled: boolean,)', '({ initial, title, enabled }: { initial: number; title: string; enabled: boolean })']
    .map(props => requireIR(compile(`export client component Counter${props}${body}`)).components[0]);
  assert.deepEqual(direct.props, legacy.props);
  const props = { enabled: false, title: '<safe>', initial: 5 };
  assert.deepEqual(renderComponent(direct, props), renderComponent(legacy, props));
  const a = generateComponent(direct), b = generateComponent(legacy);
  assert.equal(a.schemaId, b.schemaId); assert.deepEqual(a.fields, b.fields); assert.equal(a.handlers[0].code, b.handlers[0].code);
  assert.throws(() => renderComponent(direct, [5, '<safe>', false]), /props/);
  assert.throws(() => renderComponent(direct, { initial: 5, title: '<safe>' }), /props/);
  assert.throws(() => renderComponent(direct, { ...props, initial: '5' }), /props/);
});

test('direct props work in every phase and preserve named object passing', () => {
  for (const side of ['', 'client ', 'server ']) {
    const component = requireIR(compile(`export ${side}component Label(title: string, count: number) { <p>{title}{count}</p> }`)).components[0];
    assert.equal(renderComponent(component, { count: 5, title: 'Count: ' }).html, '<p>Count: 5</p>');
  }
});

test('unsupported parameter features fail explicitly without reinterpreting TS destructuring', () => {
  for (const [props, code] of [
    ['value: number, value: number', 'E_PROPS'],
    ['value?: number', 'E_OPTIONAL_FIELD'],
    ['value: number = 1', 'E_PROPS_DEFAULT'],
    ['value: Date', 'E_TYPE'],
    ['value: number; other: number', 'E_SYNTAX'],
    ['{ value: number }', 'E_SYNTAX'],
    ['constructor: number', 'E_IDENTIFIER'],
  ]) {
    const result = compile(`component Bad(${props}) { <p>Invalid</p> }`);
    assert.equal(result.ok, false, props); assert.equal(result.diagnostics[0].code, code, props);
  }
});
