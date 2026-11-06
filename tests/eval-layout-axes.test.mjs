import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('container/block intent grader distinguishes query selection, geometric regions and trusted metrics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-axes-'));
  try {
    const answers = JSON.parse(await readFile('evals/expect/layout-axes-intent.json', 'utf8'));
    const file = join(directory, 'answer.json');
    await writeFile(file, JSON.stringify(answers));
    assert.equal((await grade('layout-axes-intent', file)).pass, true);
    await writeFile(file, JSON.stringify({ ...answers, querySelectsSelf: true, intrinsicBlockSizeAutomaticallyProved: true, boundingRectangleIsAlwaysExactRegion: true }));
    const report = await grade('layout-axes-intent', file);
    assert.equal(report.pass, false);
    assert.deepEqual(report.checks.filter(c => !c.pass).map(c => c.name), ['querySelectsSelf', 'intrinsicBlockSizeAutomaticallyProved', 'boundingRectangleIsAlwaysExactRegion']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
