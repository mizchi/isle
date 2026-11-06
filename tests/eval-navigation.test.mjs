import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('navigation reading distinguishes native page preparation from island resumption', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isle-navigation-eval-'));
  try {
    const expected = JSON.parse(await readFile(new URL('../evals/expect/navigation-loading-intent.json', import.meta.url), 'utf8'));
    const file = join(root, 'answers.json');
    await writeFile(file, JSON.stringify(expected));
    assert.equal((await grade('navigation-loading-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...expected, prefetchExecutesPageScripts: true, speculationResumesIslands: true, browserMustHonorRules: true }));
    const report = await grade('navigation-loading-intent', file);
    assert.equal(report.pass, false);
    assert.deepEqual(report.checks.filter(check => !check.pass).map(check => check.name),
      ['prefetchExecutesPageScripts', 'speculationResumesIslands', 'browserMustHonorRules']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
