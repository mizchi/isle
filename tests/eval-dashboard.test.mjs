import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('dashboard reading rejects whole-app resumption and trusting validation preflight', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isle-dashboard-eval-'));
  try {
    const expected = JSON.parse(await readFile(new URL('../evals/expect/dashboard-intent.json', import.meta.url), 'utf8'));
    const file = join(root, 'answers.json'); await writeFile(file, JSON.stringify(expected));
    assert.equal((await grade('dashboard-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...expected, firstClickRestoresAllItems: true, preflightReplacesSubmissionValidation: true }));
    const result = await grade('dashboard-intent', file); assert.equal(result.pass, false);
    assert.deepEqual(result.checks.filter(check => !check.pass).map(check => check.name), ['firstClickRestoresAllItems', 'preflightReplacesSubmissionValidation']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
