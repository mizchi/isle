import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';
import { compileFile, requireIR } from '../lib/compiler.mjs';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';

const expectation = new URL('../evals/expect/component-intent.json', import.meta.url);
test('component intent grader rejects implicit phases, positional props and destructuring type confusion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-component-intent-'));
  try {
    const file = join(directory, 'answers.json'), answers = JSON.parse(await readFile(expectation, 'utf8'));
    await writeFile(file, JSON.stringify(answers)); assert.equal((await grade('component-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...answers, universalInfersClient: true, propsArePositional: true, destructureColonIsType: true }));
    const result = await grade('component-intent', file); assert.equal(result.pass, false);
    assert.deepEqual(result.checks.filter(check => !check.pass).map(check => check.name), ['universalInfersClient', 'propsArePositional', 'destructureColonIsType']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('component reading expectations agree with executed fixture semantics', async () => {
  const expected = JSON.parse(await readFile(expectation, 'utf8'));
  const ir = requireIR(await compileFile(new URL('../evals/scenarios/component-intent/fixture.isle', import.meta.url)));
  for (const [name, key] of [['Label', 'labelPhase'], ['ServerNote', 'serverNotePhase'], ['Counter', 'counterPhase']]) assert.equal(ir.components.find(c => c.name === name).side, expected[key]);
  const label = ir.components[0]; assert.equal(Boolean(renderComponent(label, { title: 'Pure' }).snapshot), expected.universalHasSnapshot);
  const counter = ir.components[2], generated = generateComponent(counter), handler = generated.handlers[0];
  const values = handler.captures.map(index => renderComponent(counter, { initial: 5 }).snapshot[3][index]);
  const patches = new Map(), module = await import(`data:text/javascript,${encodeURIComponent(handler.code)}`);
  await module.run(values, (index, value) => { values[index] = value; }, (index, value) => patches.set(index, value));
  assert.equal([...patches.values()].join(' / '), expected.counterAfterClick);
});
