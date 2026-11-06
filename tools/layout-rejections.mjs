import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cases as examples } from '../evals/scenarios/layout-rejections/cases.mjs';

const cli = fileURLToPath(new URL('./isle.mjs', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
function validate(cases) {
  const ids = new Set();
  for (const example of cases) {
    if (!/^[a-z][a-z0-9-]*$/.test(example.id)) throw new Error('Invalid example identifier');
    if (ids.has(example.id)) throw new Error(`Duplicate example identifier: ${example.id}`);
    ids.add(example.id);
    if (!['violated', 'unknown'].includes(example.expected?.status) || !/^[EU]_LAYOUT_[A-Z_]+$/.test(example.expected?.code)) throw new Error('Invalid expected layout diagnostic');
    for (const variant of [example.reject, example.accept]) {
      if (typeof variant?.source !== 'string' || typeof variant?.options?.css !== 'string') throw new Error('Invalid executable example');
    }
  }
}
async function execute(variant, directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'app.isle'), variant.source + '\n');
  await writeFile(join(directory, 'app.css'), variant.options.css + '\n');
  const { css, cssFile, reset = [], ...options } = variant.options;
  const resetFiles = [];
  for (let i = 0; i < reset.length; i++) {
    const name = `reset-${i}.css`;
    await writeFile(join(directory, name), reset[i].css + '\n'); resetFiles.push(`./${name}`);
  }
  await writeFile(join(directory, 'layout.json'), JSON.stringify({ ...options, css: './app.css', reset: resetFiles }, null, 2) + '\n');
  const result = spawnSync(process.execPath, [cli, 'layout', join(directory, 'app.isle'), join(directory, 'layout.json')], { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  let report;
  try { report = JSON.parse(result.stdout); } catch { report = { ok: false, diagnostics: [], error: result.error?.message ?? result.stderr }; }
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return {
    exitCode: result.status,
    status: report.status ?? (report.diagnostics?.length ? 'compile-error' : 'execution-error'),
    diagnostics: report.diagnostics ?? [],
    ...(result.stderr ? { stderr: result.stderr } : {}),
    ok: report.ok,
  };
}
const matches = (diagnostic, expected) => diagnostic.code === expected.code &&
  (expected.axis === undefined || diagnostic.axis === expected.axis) &&
  (expected.box === undefined || diagnostic.box === expected.box) &&
  Object.entries(expected.range ?? {}).every(([key, value]) => diagnostic.range?.[key] === value);

/** Materialize reviewable inputs, then run the real CLI for both sides of each case. */
export async function evaluateLayoutRejections(cases, directory) {
  validate(cases);
  directory = resolve(directory);
  const results = [];
  for (const example of cases) {
    const reject = await execute(example.reject, join(directory, example.id, 'reject'));
    const accept = await execute(example.accept, join(directory, example.id, 'accept'));
    reject.matched = reject.diagnostics.find(d => matches(d, example.expected));
    const pass = reject.exitCode === 1 && reject.ok === false && reject.status === example.expected.status && Boolean(reject.matched) && accept.exitCode === 0 && accept.ok === true && accept.status === 'verified';
    delete reject.ok; delete accept.ok;
    results.push({ id: example.id, title: example.title, note: example.note, pass, expected: example.expected, reject, accept });
  }
  const report = { version: 1, pass: results.length > 0 && results.every(c => c.pass), cases: results };
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const lines = ['# リジェクト例の実行結果', '', '各例は独立した入力。対応版は一般的な意味保存変換を保証しない。', '', '|結果|例|拒否版|実際の診断|対応版|', '|---|---|---|---|---|'];
  for (const c of results) lines.push(`|${c.pass ? 'PASS' : 'FAIL'}|[${c.id}](${c.id}/reject/app.css)|${c.reject.status}|[${[...new Set(c.reject.diagnostics.map(d => d.code))].join(' / ') || '診断なし'}](${c.id}/reject/report.json)|[${c.accept.status}](${c.id}/accept/app.css)|`);
  for (const c of results) lines.push('', `## ${c.title}`, '', c.note, '', `入力: [source](${c.id}/reject/app.isle)、[設定](${c.id}/reject/layout.json)。対応版: [source](${c.id}/accept/app.isle)、[設定](${c.id}/accept/layout.json)。`);
  await writeFile(join(directory, 'index.md'), lines.join('\n') + '\n');
  return report;
}
async function main() {
  const id = process.argv[2];
  const cases = id ? examples.filter(example => example.id === id) : examples;
  if (!cases.length) throw new Error(`Unknown example: ${id}`);
  const directory = resolve(root, 'evals/results/layout-rejections');
  const report = await evaluateLayoutRejections(cases, directory);
  for (const c of report.cases) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id}: ${c.reject.status}/${c.expected.code} → ${c.accept.status}`);
  console.log(`Report: ${join(directory, 'index.md')}`);
  if (!report.pass) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
