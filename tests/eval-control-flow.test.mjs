import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('control-flow design grader distinguishes regions, keyed identity and bounded work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-control-intent-'));
  try {
    const file = join(directory, 'answers.json');
    const answers = { requiresStableKey: true, sameArmRecreatesDom: false, surchargeReconcilesItems: false,
      surchargeUpdatesAllActivePrices: true, reorderPreservesOwner: true, opaqueReplacementAlwaysCostsOnlyChangedRows: false,
      duplicateKeyPolicy: 'reject-before-commit', catchRollsBackRpc: false, failedTryIncludesFallbackCost: true,
      unusedDirectiveHelpersShip: false, resumeRepeatsSetup: false };
    await writeFile(file, JSON.stringify(answers));
    assert.equal((await grade('control-flow-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...answers, opaqueReplacementAlwaysCostsOnlyChangedRows: true,
      catchRollsBackRpc: true, failedTryIncludesFallbackCost: false }));
    const result = await grade('control-flow-intent', file);
    assert.equal(result.pass, false);
    assert.deepEqual(result.checks.filter(check => !check.pass).map(check => check.name),
      ['opaqueReplacementAlwaysCostsOnlyChangedRows', 'catchRollsBackRpc', 'failedTryIncludesFallbackCost']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
