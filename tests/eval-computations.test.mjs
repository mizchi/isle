import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';
import { compileFile, requireIR } from '../lib/compiler.mjs';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';

const expectation = new URL('../evals/expect/computation-intent.json', import.meta.url);

test('computation intent grader rejects merging mutable copies and caching across writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-computation-intent-'));
  try {
    const file = join(directory, 'answers.json');
    const answers = JSON.parse(await readFile(expectation, 'utf8'));
    await writeFile(file, JSON.stringify(answers));
    assert.equal((await grade('computation-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...answers, frozenSnapshotSlots: ['count', 'total'],
      phasedAfterOneClick: 30, cacheCrossesWrites: true }));
    const result = await grade('computation-intent', file);
    assert.equal(result.pass, false);
    assert.deepEqual(result.checks.filter(check => !check.pass).map(check => check.name),
      ['frozenSnapshotSlots', 'phasedAfterOneClick', 'cacheCrossesWrites']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('computation reading expectations agree with executed fixture semantics', async () => {
  const expected = JSON.parse(await readFile(expectation, 'utf8'));
  const fixture = requireIR(await compileFile(new URL('../evals/scenarios/computation-lifetime/fixture.isle', import.meta.url)));
  for (const [name, props, clicks, slotsKey, resultKey] of [
    ['Aliases', { base: 37 }, 1, 'aliasSnapshotSlots', 'aliasClickValue'],
    ['Frozen', { initial: 1 }, 2, 'frozenSnapshotSlots', 'frozenAfterTwoClicks'],
    ['Phased', { factor: 3 }, 1, 'phasedSnapshotSlots', 'phasedAfterOneClick'],
  ]) {
    const input = fixture.components.find(component => component.name === name);
    const generated = generateComponent(input), handler = generated.handlers[0];
    assert.deepEqual(generated.fields.map(field => field.name), expected[slotsKey]);
    const snapshot = renderComponent(input, props).snapshot;
    const values = handler.captures.map(index => snapshot[3][index]), patches = [];
    const module = await import(`data:text/javascript,${encodeURIComponent(handler.code)}`);
    for (let click = 0; click < clicks; click++) await module.run(values,
      (index, value) => { values[index] = value; }, (_, value) => patches.push(value));
    assert.equal(patches.at(-1), String(expected[resultKey]));
  }
});
