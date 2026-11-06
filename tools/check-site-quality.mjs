import { spawn, spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const { base } = JSON.parse(await readFile('dist/site/site.json', 'utf8'));
const server = spawn(process.execPath, ['tools/serve-site.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { log = (log + data).slice(-4000); });
const results = [];
const routes = ['', 'ja/', 'examples/', 'ja/examples/', 'docs/quick-start.html', 'examples/resources/', 'demos/portable-widget/', 'reports/layout.html'];
const tasks = routes.map(route => ({ route, args: ['check', 'integrity'] }));
for (const route of ['', 'ja/']) {
  const lang = route ? 'ja' : 'en';
  for (const args of [
    ['check', 'copy', '--manifest', `site/copy.${lang}.txt`], ['scan', 'scroll'], ['scan', 'handlers'], ['check', 'interactions'],
    ['check', 'a11y', 'contrast'], ['check', 'a11y', 'touch'], ['check', 'a11y', 'focus'],
    ['check', 'responsive', '--min-width', '375', '--max-width', '1440', '--runs', '24'],
  ]) tasks.push({ route, args });
}
try {
  const ready = 'http://127.0.0.1:4330' + base;
  const deadline = Date.now() + 30000;
  while (true) {
    if (server.exitCode !== null) throw new Error(log);
    try { if ((await fetch(ready)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Site server timeout: ' + log);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const binary = fileURLToPath(new URL('../node_modules/.bin/vlmkit', import.meta.url));
  for (const { route, args } of tasks) {
    const group = args[0], name = args[1], options = args.slice(2);
    const command = name === 'a11y' ? [group, name, options.shift(), ready + route, ...options] : [group, name, ready + route, ...options];
    const run = spawnSync(binary, [...command, '--json'], { encoding: 'utf8', maxBuffer: 16 << 20 });
    let report;
    try { report = JSON.parse(run.stdout); } catch { throw new Error(`vlmkit failed: ${run.stdout}\n${run.stderr}`); }
    results.push({ route: route || '/', gate: report.gate, verdict: report.verdict, counts: report.counts, findings: report.findings });
    await mkdir('evals/results/site', { recursive: true });
    await writeFile('evals/results/site/quality.json', JSON.stringify({ base, results }, null, 2) + '\n');
    console.log(`${route || '/'}: ${command.slice(0, name === 'a11y' ? 3 : 2).join(' ')} ${report.verdict}`);
    assert.equal(run.status, 0, JSON.stringify(report.findings, null, 2));
  }
} finally { server.kill('SIGTERM'); }
