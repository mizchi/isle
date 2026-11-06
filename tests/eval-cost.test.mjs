import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileFile, requireIR } from '../lib/compiler.mjs';
import { analyzeCosts } from '../lib/cost.mjs';
import { grade } from '../tools/eval.mjs';

test('static cost scenario detects wide updates and distinguishes isolated child work', async () => {
  const input = requireIR(await compileFile(new URL('../evals/scenarios/static-cost/fixture.isle', import.meta.url)));
  const budgets = JSON.parse(await readFile(new URL('../evals/scenarios/static-cost/budgets.json', import.meta.url)));
  const report = analyzeCosts(input, { mounts: [{ component: 'Page' }, { component: 'Page' }], budgets });
  const board = report.entries.find(entry => entry.id === 'Board.recalculate');
  const child = report.entries.find(entry => entry.id === 'Child.increment');
  assert.equal(board.work.textPatchCalls.value, 16);
  assert.equal(board.work.attributePatchCalls.value, 8);
  assert.equal(child.work.textPatchCalls.value, 1);
  assert.equal(board.restore.childOwners, 0);
  assert.equal(report.scenario.domElements, 22);
  assert.equal(report.scenario.resumableOwners, 4);
  assert.equal(report.ok, false);
  assert.equal(report.budget.checks[0].status, 'exceeded');
  // The author task's constant props, rather than a relaxed budget, remove four rows from the update.
  const source = await readFile(new URL('../evals/scenarios/static-cost/fixture.isle', import.meta.url), 'utf8');
  const { compile } = await import('../lib/compiler.mjs');
  let row = 0;
  const reduced = requireIR(compile(source.replaceAll('<Row value={projected} />', match => ++row <= 4 ? match : '<Row value={1} />')));
  assert.equal(analyzeCosts(reduced, { budgets }).ok, true);
});

test('static cost intent grader rejects time guarantees and summing shared code per instance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-cost-intent-'));
  try {
    const answers = JSON.parse(await readFile(new URL('../evals/expect/static-cost-intent.json', import.meta.url)));
    const file = join(directory, 'answers.json');
    await writeFile(file, JSON.stringify(answers));
    assert.equal((await grade('static-cost-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...answers, layoutTimeKnown: true, codeBytesMultiplyByMountCount: true }));
    const result = await grade('static-cost-intent', file);
    assert.equal(result.pass, false);
    assert.deepEqual(result.checks.filter(check => !check.pass).map(check => check.name), ['layoutTimeKnown', 'codeBytesMultiplyByMountCount']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
