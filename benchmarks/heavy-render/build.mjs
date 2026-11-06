import { build } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { isle } from '../../lib/vite.mjs';
import { checkCostBudgets } from '../../lib/cost.mjs';
import { makeHeavySource, scenarioSizes } from './scenario.mjs';
import { heavyShell } from './shell.mjs';
import assert from 'node:assert/strict';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const resultsDirectory = resolve(projectRoot, 'benchmarks/results/heavy-render');
export const budgets = Object.freeze(JSON.parse(await readFile(new URL('./budgets.json', import.meta.url), 'utf8')));

export async function buildHeavyCase(rows, { directory = projectRoot, profile = false } = {}) {
  const id = `${rows}${profile ? '-profile' : ''}`;
  const root = resolve(directory, 'benchmarks/generated/heavy-render', id);
  const outDir = resolve(directory, 'benchmarks/dist/heavy-render', id);
  const source = makeHeavySource(rows);
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, 'app.isle'), source);
  await writeFile(resolve(root, 'index.html'), heavyShell(rows));
  await writeFile(resolve(root, 'main.mjs'), "import { boot } from 'virtual:isle-loader';\nwindow.heavyDemo = boot();\n");
  const start = performance.now();
  const result = await build({ configFile: false, root, base: './', logLevel: 'silent',
    plugins: [isle({ entry: resolve(root, 'app.isle'), clientEntry: resolve(root, 'main.mjs'), diagnostics: false,
      profile, handlerChunkBytes: 0, mounts: [{ component: 'Page', props: {}, scopeId: 'orders', label: '商品一覧' }],
    })], build: { outDir, emptyOutDir: true } });
  const report = JSON.parse(await readFile(resolve(outDir, 'isle.cost.json'), 'utf8'));
  if (!profile) for (const item of result.output.filter(item => item.type === 'chunk')) {
    assert.ok(!/__dashboard|__heavyCorrectness|PerformanceObserver|MutationObserver|\.measure\(/.test(item.code), 'benchmark probes never ship in the normal build');
  }
  return { id, rows, profile, root: relative(projectRoot, root), outDir: relative(projectRoot, outDir),
    buildMs: performance.now() - start, sourceBytes: Buffer.byteLength(source),
    chunks: result.output.filter(item => item.type === 'chunk').map(item => ({ file: item.fileName,
      bytes: Buffer.byteLength(item.code), sha256: createHash('sha256').update(item.code).digest('hex') })),
    static: { planId: report.planId, buildId: report.buildId, scenario: report.scenario,
      entries: report.entries.map(({ id, work, restore, code, instances, unknownCosts }) => ({ id, work, restore, code, instances, unknownCosts })),
      budget: checkCostBudgets(report, budgets) } };
}

export async function readBuilds() {
  return JSON.parse(await readFile(resolve(resultsDirectory, 'build.json'), 'utf8')).cases;
}

async function main() {
  const cases = [];
  for (const rows of scenarioSizes) {
    const result = await buildHeavyCase(rows); cases.push(result);
    console.log(`${result.id}: built ${result.rows} products in ${result.buildMs.toFixed(0)} ms`);
  }
  const diagnostic = await buildHeavyCase(scenarioSizes.at(-1), { profile: true });
  cases.push(diagnostic);
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(resolve(resultsDirectory, 'build.json'), JSON.stringify({ version: 1, budgets, cases }, null, 2) + '\n');
  console.log(`${diagnostic.id}: diagnostic User Timing build`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
