import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('chunk author grader rejects a named handler that performs the wrong update', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-chunk-eval-'));
  try {
    const source = await readFile(new URL('../evals/solutions/chunks.isle', import.meta.url), 'utf8');
    const file = join(directory, 'chunks.isle');
    await writeFile(file, source);
    assert.equal((await grade('author-chunks', file)).pass, true);
    await writeFile(file, source.replace('count -= 1', 'count += 1'));
    const result = await grade('author-chunks', file);
    assert.equal(result.pass, false);
    assert.ok(result.checks.some(check => check.name === 'decrement resumes correctly' && !check.pass));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
