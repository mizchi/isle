import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR, explain } from '../lib/compiler.mjs';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';

const source = `// 日本語😀: offsets are UTF-16
export client component Counter({ initial }: { initial: number }) {
  state count = initial;
  <div>
    <button>on click increment { count += 1; }{count}</button>
    <button>on click decrement { count -= 1; }{count}</button>
  </div>
}`;

test('named event blocks are stable logical chunk boundaries with source ranges', () => {
  const ir = requireIR(compile(source)), component = ir.components[0];
  const generated = generateComponent(component);
  assert.deepEqual(generated.handlers.map(handler => handler.id), ['Counter.increment', 'Counter.decrement']);
  const handler = generated.handlers[0];
  assert.equal(source.slice(handler.source.start, handler.source.end), 'on click increment { count += 1; }');
  assert.deepEqual(handler.captureNames, ['count']);
  assert.deepEqual(handler.writes, ['count']);
  assert.equal(handler.async, false);
  assert.match(renderComponent(component, { initial: 37 }).html, /s0\|Counter.increment/);
  const shifted = generateComponent(requireIR(compile(source.replace('  state', '\n  state'))).components[0]);
  assert.equal(shifted.handlers[0].id, handler.id);
  assert.equal(shifted.schemaId, generated.schemaId, 'source-only movement is not a snapshot ABI change');
  const metadata = explain(ir).components[0].chunks[0];
  assert.equal(metadata.id, handler.id);
  assert.equal(metadata.loading, 'lazy');
  assert.equal(metadata.async, false);
  assert.deepEqual(metadata.captureNames, ['count']);
});

test('named async blocks retain explicit remote authorization boundaries', () => {
  const source = `schema Input { id: string; }
view Output { title: string; }
export server action save(input: Input): Output using request: RequestContext
authorize grant = policy.editor(request, input.id) effects { db.write }
{ return await documents.save(grant, input.id); }
export client component Editor({ id }: { id: string }) {
  state title = "Draft";
  <button>on click async save { title = (await remote save({ id })).title; }{title}</button>
}`;
  const handler = generateComponent(requireIR(compile(source)).components[0]).handlers[0];
  assert.equal(handler.id, 'Editor.save');
  assert.equal(handler.async, true);
  assert.deepEqual(handler.actions, ['save']);
  const invalid = compile(source.replace('on click async save', 'on click save'));
  assert.equal(invalid.diagnostics[0].code, 'E_ASYNC_BOUNDARY');
});

test('ambiguous names and duplicate event attachments are rejected at their source', () => {
  for (const [candidate, code] of [
    [source.replace('on click decrement', 'on click increment'), 'E_CHUNK_NAME'],
    [source.replace('on click increment', 'on click h0'), 'E_CHUNK_NAME'],
    [source.replace('on click increment { count += 1; }', 'on click increment { count += 1; } on click other { count += 1; }'), 'E_EVENT_DUPLICATE'],
  ]) {
    const result = compile(candidate);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, code);
    assert.match(candidate.slice(result.diagnostics[0].start, result.diagnostics[0].end), /^on click/);
  }
});
