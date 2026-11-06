import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('design intent grader distinguishes inline embedding, liveness and retained CSS', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-inline-intent-'));
  try {
    const file = join(directory, 'answers.json');
    const answers = { entry: 'Counter.increment', inlineForcesEager: false,
      doubledType: 'Live<Float64>', dependencyTracking: 'static', writableNames: ['count'],
      retainedClasses: ['button'], removedClasses: ['unused'], keepHoverRule: true,
      keepUnusedPulse: false, ssrOnlyHasCss: true, ssrOnlyHasBrowserJs: false };
    await writeFile(file, JSON.stringify(answers));
    assert.equal((await grade('inline-live-css-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...answers, inlineForcesEager: true, keepHoverRule: false, ssrOnlyHasCss: false }));
    const result = await grade('inline-live-css-intent', file);
    assert.equal(result.pass, false);
    assert.deepEqual(result.checks.filter(check => !check.pass).map(check => check.name), ['inlineForcesEager', 'keepHoverRule', 'ssrOnlyHasCss']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
