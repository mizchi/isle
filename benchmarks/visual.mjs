import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createBenchmarkServer, variantIds } from './serve.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
async function command(args) {
  const child = spawn('pnpm', ['exec', 'vlmkit', ...args], { cwd: `${root}/..`, stdio: 'inherit' });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`vlmkit exited ${code}`)));
  });
}
async function main() {
  const server = await createBenchmarkServer();
  try {
    const summary = [];
    for (const id of variantIds.filter(id => id !== 'isle')) {
      console.log(`Visual equivalence: Isle → ${id}`);
      const output = `benchmarks/results/visual/${id}`;
      await command(['migration', 'compare', '--url', `${server.url}/isle/`, '--current-url', `${server.url}/${id}/`, '--output', output]);
      const report = JSON.parse(await readFile(`${root}/results/visual/${id}/diff-report.json`, 'utf8'));
      assert.equal(report.baselineSanity.ok, true);
      assert.equal(report.results.length, 3, `${id}: all three viewports captured`);
      assert.ok(report.results.every(result => result.rawDiffRatio === 0), `${id}: raw pixel differences`);
      assert.ok(report.computedStyleDiff.every(result => result.result.totalDiffs === 0), `${id}: computed style differences`);
      await command(['diff', 'agent', `${output}/diff-report.json`]);
      summary.push({ id, viewports: report.results.map(result => ({ name: result.viewport, rawDiffRatio: result.rawDiffRatio })),
        computedStyleDiffs: 0, paintTree: report.paintTree,
        domWarnings: report.domEquivalence.flatMap(result => result.result.warnings) });
    }
    assert.deepEqual(server.errors, []);
    await writeFile(`${root}/results/visual/summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
  } finally { await server.close(); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
