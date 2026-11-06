import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('cost CLI enforces source and artifact budgets with a machine-readable failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-cost-cli-'));
  const run = (...args) => spawnSync(process.execPath, ['tools/isle.mjs', 'cost', ...args], { encoding: 'utf8' });
  try {
    const entry = join(directory, 'app.isle'), budgets = join(directory, 'budgets.json'), artifact = join(directory, 'isle.cost.json');
    await writeFile(entry, 'client component Counter() { state n = 0; <button>on click add { n += 1; }{n}</button> }');
    const normal = run(entry);
    assert.equal(normal.status, 0, normal.stderr);
    const report = JSON.parse(normal.stdout);
    await writeFile(artifact, JSON.stringify(report));
    await writeFile(budgets, JSON.stringify([{ entry: 'Counter.add', metric: 'textPatchCalls', max: 0 }]));
    for (const file of [entry, artifact]) {
      const exceeded = run(file, budgets);
      assert.equal(exceeded.status, 1, exceeded.stderr);
      assert.equal(JSON.parse(exceeded.stdout).budget.checks[0].status, 'exceeded');
    }
    await writeFile(budgets, JSON.stringify([{ entry: 'Counter.add', metric: 'textPatchCalls', max: 1 }]));
    assert.equal(run(artifact, budgets).status, 0);
    await writeFile(entry, 'client component Invalid() { await forbidden(); }');
    const invalid = run(entry);
    assert.equal(invalid.status, 1);
    assert.equal(JSON.parse(invalid.stdout).ok, false);
    await writeFile(budgets, JSON.stringify([{ entry: '*', metric: 'textPatchCallz', max: 10 }]));
    const malformed = run(artifact, budgets);
    assert.equal(malformed.status, 1);
    assert.match(malformed.stderr, /budget/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
