import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const dependency = await readFile(new URL('../.mooncakes/mizchi/veri/moon.mod', import.meta.url), 'utf8');
if (!/^version\s*=\s*"0\.2\.1"$/m.test(dependency)) throw new Error('Resolved veri must be exactly 0.2.1');
const run = spawnSync('moon', ['run', 'cmd/verify', '--target', 'js'], { encoding: 'utf8', timeout: 60000 });
if (run.error) throw run.error;
if (run.status !== 0) throw new Error(run.stderr || run.stdout);
const report = JSON.parse(run.stdout);
if (report.version !== 2 || !report.passed || report.cases.some(c => !c.passed || !c.complete)) throw new Error('Formal finite-model check failed');
for (const entry of report.cases) {
  if (!Array.isArray(entry.weak_fairness) || typeof entry.formula !== 'string') throw new Error('Missing temporal contract metadata');
  if (entry.property.startsWith('response:') && entry.actual === 'counterexample' &&
      (!Number.isInteger(entry.witness_loop_start) || entry.witness_loop_start < 0 || entry.witness_loop_start >= entry.witness_actions.length || !entry.witness_replayed)) throw new Error('Response counterexample must contain a replayed infinite lasso');
}
await mkdir(new URL('../evals/results/', import.meta.url), { recursive: true });
await writeFile(new URL('../evals/results/formal.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, veri: report.veri_version,
  cases: report.cases.length, counterexamples: report.cases.filter(c => c.actual === 'counterexample').length,
  responseChecks: report.cases.filter(c => c.property.startsWith('response:')).length,
  responseCounterexamples: report.cases.filter(c => c.property.startsWith('response:') && c.actual === 'counterexample').length,
  strict: report.cases.filter(c => c.name.endsWith('/strict')).map(c => ({ name: c.name, states: c.reachable_states })),
  report: 'evals/results/formal.json' }, null, 2));
