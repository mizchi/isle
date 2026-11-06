import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade } from '../tools/eval.mjs';

test('both schema authoring graders accept the contract and reject missing correlation or wrong bounds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-schema-eval-'));
  try {
    for (const [scenario, solution, extension] of [
      ['author-schema-dsl', 'schema-dsl.isle', 'isle'], ['author-schema-ts', 'schema-ts.ts', 'ts'],
    ]) {
      const original = await readFile(new URL(`../evals/solutions/${solution}`, import.meta.url), 'utf8');
      assert.equal((await grade(scenario, new URL(`../evals/solutions/${solution}`, import.meta.url))).pass, true);
      const source = original.replace("'../../lib/schema.mjs'", JSON.stringify(new URL('../lib/schema.mjs', import.meta.url).href));
      const file = join(directory, `wrong.${extension}`);
      await writeFile(file, source.replaceAll(extension === 'ts' ? 'minLength: 8' : 'minLength(8)', extension === 'ts' ? 'minLength: 7' : 'minLength(7)'));
      assert.equal((await grade(scenario, file)).pass, false);
      const second = join(directory, `uncorrelated.${extension}`);
      await writeFile(second, source.replace(extension === 'ts' ? ", sameAs: 'password'" : ' sameAs(password)', ''));
      assert.equal((await grade(scenario, second)).pass, false);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
