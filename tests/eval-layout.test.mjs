import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('layout intent grader rejects clipping-as-fit and stronger claims than the model', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-intent-'));
  try {
    const answers = JSON.parse(await readFile('evals/expect/layout-intent.json', 'utf8'));
    const path = join(directory, 'answer.json');
    await writeFile(path, JSON.stringify(answers));
    assert.equal((await grade('layout-intent', path)).pass, true);
    await writeFile(path, JSON.stringify({ ...answers, hiddenAloneSatisfiesFit: true, minInlineSizeAutomaticallyProved: true, provesBlockSize: true }));
    const report = await grade('layout-intent', path);
    assert.equal(report.pass, false);
    assert.deepEqual(report.checks.filter(check => !check.pass).map(check => check.name), ['hiddenAloneSatisfiesFit', 'minInlineSizeAutomaticallyProved', 'provesBlockSize']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
