import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { examples } from '../examples/catalog.mjs';

const ids = ['hello', 'ssr-only', 'partial-updates', 'control-flow', 'loading', 'resources', 'styles', 'navigation'];
const selected = examples.filter(example => ids.includes(example.id));
const server = spawn(process.execPath, ['tools/examples.mjs', 'preview'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverOutput = (serverOutput + data).slice(-8000); });
const results = [];
try {
  const deadline = Date.now() + 60000;
  while (true) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try { if ((await fetch('http://127.0.0.1:4373/')).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error(`Example server timeout: ${serverOutput}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const binary = fileURLToPath(new URL('../node_modules/.bin/vlmkit', import.meta.url));
  for (const example of selected) {
    const url = `http://127.0.0.1:${example.port + 200}/`;
    const gates = [
      ['check', 'integrity'],
      ['check', 'copy', '--manifest', `examples/${example.id}/copy.txt`],
      ['scan', 'scroll'],
      ['scan', 'handlers'],
      ['check', 'interactions'],
    ];
    for (const [group, name, ...options] of gates) {
      const run = spawnSync(binary, [group, name, url, ...options, '--json'], { encoding: 'utf8', maxBuffer: 8 << 20 });
      let report;
      try { report = JSON.parse(run.stdout); } catch { throw new Error(`vlmkit failed: ${run.stdout}\n${run.stderr}`); }
      results.push({ example: example.id, gate: report.gate, verdict: report.verdict, counts: report.counts, findings: report.findings });
      await mkdir('evals/results/examples', { recursive: true });
      await writeFile('evals/results/examples/quality.json', JSON.stringify({ examples: selected.length, results }, null, 2) + '\n');
      assert.equal(run.status, 0, `${example.id} ${group} ${name}: ${JSON.stringify(report.findings)}`);
      console.log(`${example.id}: ${group} ${name} ${report.verdict}`);
    }
  }
} finally {
  server.kill('SIGTERM');
}
