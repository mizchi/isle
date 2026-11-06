import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('rejection intent grader distinguishes contract failures from missing analysis support', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-rejections-intent-'));
  try {
    const expected = JSON.parse(await readFile('evals/expect/layout-rejections-intent.json', 'utf8'));
    const file = join(directory, 'answers.json');
    await writeFile(file, JSON.stringify(expected));
    assert.equal((await grade('layout-rejections-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...expected, unknownMeansInvalidCSS: true, allCounterpartsAreEquivalent: true, sourceParseFailureCountsAsLayoutRejection: true }));
    const report = await grade('layout-rejections-intent', file);
    assert.equal(report.pass, false);
    assert.deepEqual(report.checks.filter(c => !c.pass).map(c => c.name), ['unknownMeansInvalidCSS', 'allCounterpartsAreEquivalent', 'sourceParseFailureCountsAsLayoutRejection']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
