import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';
import { compileFile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
const expectedURL = new URL('../evals/expect/composition-intent.json', import.meta.url);

test('composition intent grading rejects eager restoration, serialized children and reactive client props', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-composition-intent-'));
  try {
    const file = join(directory, 'answers.json'), expected = JSON.parse(await readFile(expectedURL, 'utf8'));
    await writeFile(file, JSON.stringify(expected)); assert.equal((await grade('composition-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...expected, firstChildResumesParent: true, childrenInSnapshot: true, reactiveClientPropsSupported: true }));
    const result = await grade('composition-intent', file); assert.equal(result.pass, false);
    assert.deepEqual(result.checks.filter(check => !check.pass).map(check => check.name), ['childrenInSnapshot', 'firstChildResumesParent', 'reactiveClientPropsSupported']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('composition reading expectations agree with independently owned SSR snapshots', async () => {
  const ir = requireIR(await compileFile(new URL('../evals/scenarios/composition-intent/fixture.isle', import.meta.url)));
  const program = prepareProgram(ir), expected = JSON.parse(await readFile(expectedURL, 'utf8'));
  assert.deepEqual(program.reachable('Page'), ['Page', 'Parent', 'Counter']);
  const counter = program.get('Counter').generate(), rendered = program.render('Page', { seed: 5 });
  const snapshots = [...rendered.html.matchAll(/<script[^>]*data-isle-snapshot[^>]*>(.*?)<\/script>/g)].map(match => JSON.parse(match[1]));
  const children = snapshots.filter(snapshot => snapshot[1] === counter.schemaId);
  assert.deepEqual(children.map(snapshot => snapshot[3][0]), expected.counterInitialValues);
  assert.notEqual(children[0][2], children[1][2]);
  assert.ok(snapshots.every(snapshot => snapshot[3].every(value => typeof value === 'number')));
  assert.equal(program.get('Card').generate().handlers.length, 0);
});
