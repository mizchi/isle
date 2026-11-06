import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('form intent grading distinguishes event timing, labels and server checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isle-form-intent-'));
  try {
    const file = join(root, 'answers.json');
    const answers = JSON.parse(await readFile(new URL('../evals/expect/form-intent.json', import.meta.url)));
    await writeFile(file, JSON.stringify(answers));
    assert.equal((await grade('form-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...answers, eventValueCapturedAt: 'after-import',
      placeholderIsLabel: true, browserValidationReplacesServerChecks: true }));
    const result = await grade('form-intent', file);
    assert.equal(result.pass, false);
    assert.deepEqual(result.checks.filter(check => !check.pass).map(check => check.name),
      ['eventValueCapturedAt', 'placeholderIsLabel', 'browserValidationReplacesServerChecks']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
