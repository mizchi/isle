import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('shared form reading rejects trusting preflight, stale responses and reset rollback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-shared-form-eval-'));
  try {
    const file = join(directory, 'answers.json');
    const expected = JSON.parse(await readFile(new URL('../evals/expect/shared-form-intent.json', import.meta.url)));
    await writeFile(file, JSON.stringify(expected));
    assert.equal((await grade('shared-form-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...expected, validationOwner: 'schema', submissionRevalidates: false, staleValidationApplies: true, resetRollsBackServerWrites: true }));
    const result = await grade('shared-form-intent', file);
    assert.equal(result.pass, false);
    assert.deepEqual(result.checks.filter(check => !check.pass).map(check => check.name),
      ['validationOwner', 'submissionRevalidates', 'staleValidationApplies', 'resetRollsBackServerWrites']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
