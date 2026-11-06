import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('reset intent grader rejects guessed inheritance and automatic browser injection claims', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-reset-intent-'));
  try {
    const answers = JSON.parse(await readFile('evals/expect/layout-reset-intent.json', 'utf8'));
    const file = join(directory, 'answer.json');
    await writeFile(file, JSON.stringify(answers));
    assert.equal((await grade('layout-reset-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...answers, boxSizingNaturallyInherited: true, selectedComponentIsDocumentRoot: true, analysisInjectsBrowserReset: true }));
    const report = await grade('layout-reset-intent', file);
    assert.equal(report.pass, false);
    assert.deepEqual(report.checks.filter(c => !c.pass).map(c => c.name), ['boxSizingNaturallyInherited', 'selectedComponentIsDocumentRoot', 'analysisInjectsBrowserReset']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
