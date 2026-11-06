import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { createProfileServer, cases } from './profile-server.mjs';
import { capture, networkSummary } from './profile-capture.mjs';
import { describeChunks } from '../../lib/chunks.mjs';

const output = fileURLToPath(new URL('../results/todomvc/profiling/', import.meta.url)), raw = output + 'raw';
function browserErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  return errors;
}

async function operations(page, url, checkpoint, recorder) {
  const input = page.locator('.new-todo'), titles = page.locator('.todo-title');
  await page.goto(url, { waitUntil: 'load' }); await expect(page.locator('h1')).toHaveText('todos');
  await page.waitForTimeout(2000); await recorder.settled(); await checkpoint('initial');
  await input.fill('Write tests'); await recorder.settled(); await checkpoint('first-input');
  await input.press('Enter'); await expect(titles).toHaveText(['Write tests']); await recorder.settled(); await checkpoint('first-add');
  await input.fill('Ship demo'); await input.press('Enter'); await expect(titles).toHaveCount(2); await recorder.settled(); await checkpoint('warm-add');
  await page.locator('.toggle').first().check(); await expect(page.locator('.completed')).toHaveCount(1); await recorder.settled(); await checkpoint('toggle');
  await page.getByRole('link', { name: 'Active', exact: true }).click(); await expect(titles).toHaveText(['Ship demo']);
  await page.getByRole('link', { name: 'All', exact: true }).click(); await expect(titles).toHaveCount(2); await recorder.settled(); await checkpoint('filter');
  await titles.nth(1).click(); await expect(page.locator('.editing .edit')).toBeFocused(); await recorder.settled(); await checkpoint('edit-open');
  await page.locator('.editing .edit').fill('Ship accessible demo'); await page.locator('.editing .edit').press('Enter');
  await expect(titles).toHaveText(['Write tests', 'Ship accessible demo']); await recorder.settled(); await checkpoint('edit-save');
  await page.locator('.destroy').nth(1).click(); await expect(titles).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear completed' }).click(); await expect(titles).toHaveCount(0); await recorder.settled(); await checkpoint('remove-clear');
}
const nextPhase = { initial: 'first-input', 'first-input': 'first-add', 'first-add': 'warm-add', 'warm-add': 'toggle', toggle: 'filter', filter: 'edit-open', 'edit-open': 'edit-save', 'edit-save': 'remove-clear', 'remove-clear': 'complete' };

async function coverageTrial(browser, server, row) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage(), errors = browserErrors(page), recorder = await capture(page, server, { coverage: true, latency: 80 }), checkpoints = [];
    await operations(page, server.url + row.path, async phase => {
      checkpoints.push({ phase, files: await recorder.snapshot() }); recorder.setPhase(nextPhase[phase]);
    }, recorder);
    assert.deepEqual(errors, [], row.id);
    const result = { case: row.id, coverageDisablesOptimization: true, checkpoints, network: networkSummary(recorder.requests, server) };
    await writeFile(`${raw}/${row.id}.coverage.json.gz`, gzipSync(JSON.stringify(result)));
    await recorder.close();
    return result;
  } finally { await context.close(); }
}

async function evalTrial(browser, server, row) {
  const originals = new Map();
  for (const [path, asset] of server.routes) if (path.startsWith(`/${row.target}/isle/`) && path.endsWith('.js')) {
    originals.set(path, asset);
    const body = Buffer.from(`performance.mark(${JSON.stringify(`module-eval:${path}`)});\n${asset.body}`);
    server.routes.set(path, { ...asset, body, gzip: gzipSync(body, { level: 6 }) });
  }
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage(), errors = browserErrors(page), recorder = await capture(page, server, { latency: 80 }), checkpoints = [];
    await operations(page, server.url + row.path, async phase => {
      checkpoints.push({ phase, ...await page.evaluate(() => ({
        now: performance.now(), marks: performance.getEntriesByType('mark').filter(row => row.name.startsWith('module-eval:')).map(row => row.toJSON()),
        measures: performance.getEntriesByType('measure').filter(row => row.name.startsWith('isle:')).map(row => ({ ...row.toJSON(), detail: row.detail })),
      })) }); recorder.setPhase(nextPhase[phase]);
    }, recorder);
    assert.deepEqual(errors, [], row.id);
    for (const checkpoint of checkpoints) for (const measure of checkpoint.measures) assert.equal(measure.detail.status, 'ok', measure.name);
    await recorder.close();
    const result = { case: row.id, diagnosticOnly: true, moduleBodiesInstrumented: true, checkpoints };
    await writeFile(`${raw}/${row.id}.evaluation.json`, JSON.stringify(result));
    return result;
  } finally { await context.close(); for (const [path, asset] of originals) server.routes.set(path, asset); }
}

async function workload(page, mode, recorder, rows = 500, length = 64) {
  const input = page.locator('.new-todo');
  if (mode === 'keyboard') await input.pressSequentially('a'.repeat(length));
  else for (let i = 1; i <= length; i++) await input.fill('a'.repeat(i));
  await input.press('Enter'); await expect(page.locator('.todo-title').last()).toHaveText('a'.repeat(length));
  await expect(page.locator('.todo-title')).toHaveCount(rows + 1); await recorder.settled();
}
async function workloadTrial(browser, server, mode, coverage) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.addInitScript(() => localStorage.setItem('todos-isle', JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ id: i + 1, title: `Task ${i + 1}`, completed: false })))));
    const page = await context.newPage(), errors = browserErrors(page), recorder = await capture(page, server, { coverage, cpu: !coverage });
    await page.goto(server.url + '/analysis/production/'); await expect(page.locator('.todo-title')).toHaveCount(500); await recorder.settled();
    const initialNetwork = networkSummary(recorder.requests, server);
    let data;
    if (coverage) { await recorder.snapshot(); await workload(page, mode, recorder); data = await recorder.snapshot(); }
    else {
      const name = `warm-${mode}`;
      await recorder.startCPU(name); await workload(page, mode, recorder); data = await recorder.stopCPU(name, raw);
    }
    assert.deepEqual(errors, [], mode); await recorder.close(raw, `warm-${mode}`);
    return { mode, rows: 500, edits: 64, coverageDisablesOptimization: coverage, initialNetwork, ...(coverage ? { coverage: data } : { cpu: data }) };
  } finally { await context.close(); }
}

async function coldCPU(browser, server) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage(), errors = browserErrors(page), recorder = await capture(page, server, { cpu: true });
    const result = [];
    await recorder.startCPU('cold-load'); await page.goto(server.url + '/analysis/production/'); await recorder.settled(); result.push({ phase: 'initial', ...await recorder.stopCPU('cold-load', raw) });
    await recorder.startCPU('cold-input'); await page.locator('.new-todo').fill('Write tests'); await recorder.settled(); result.push({ phase: 'first-input', ...await recorder.stopCPU('cold-input', raw) });
    await recorder.startCPU('first-add'); await page.locator('.new-todo').press('Enter'); await expect(page.locator('.todo-title')).toHaveText('Write tests'); await recorder.settled(); result.push({ phase: 'first-add', ...await recorder.stopCPU('first-add', raw) });
    assert.deepEqual(errors, []); await recorder.close(raw, 'cold'); return result;
  } finally { await context.close(); }
}

function graphSummary(manifest) {
  const groups = new Map();
  for (const [id, ref] of Object.entries(manifest.references)) if (ref.kind === 'handler') {
    const ids = groups.get(ref.chunk) ?? []; ids.push(id); groups.set(ref.chunk, ids);
  }
  return { buildId: manifest.buildId, loading: manifest.loading, groups: [...groups].map(([chunk, ids]) => ({ chunk, ids, ...manifest.chunks[chunk] })),
    chunks: manifest.chunks, boundaries: describeChunks(manifest), js: Object.values(manifest.chunks).reduce((sum, row) => ({ raw: sum.raw + row.bytes, gzip: sum.gzip + row.gzipBytes }), { raw: 0, gzip: 0 }) };
}

async function main() {
  await mkdir(raw, { recursive: true });
  const server = await createProfileServer(); let browser;
  try {
    browser = await chromium.launch();
    const report = { generatedAt: new Date().toISOString(), baselineRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      environment: { node: process.version, chromium: browser.version(), platform: `${process.platform}/${process.arch}` },
      conditions: { coverageAndCPUSeparate: true, samplingIntervalUs: 1000, networkLatencyMs: 80, networkDownloadBytesPerSecond: 1048576, serviceWorkers: 'block', initialIdleMs: 2000, productionSourceUnchanged: true,
        cpuWeighting: 'Sort absolute sample timestamps; attribute each interval to its starting sample; tail ends at profile.endTime. No missing-sample repair.' },
      graphs: Object.fromEntries([...server.manifests].map(([target, manifest]) => [target, graphSummary(manifest)])), coverage: [], evaluations: [], cpu: [], workloads: [] };
    for (const row of cases.filter(row => !row.profile)) { report.coverage.push(await coverageTrial(browser, server, row)); console.log(`${row.id}: coverage/network captured`); }
    for (const row of cases.filter(row => ['production', 'auto', 'profile', 'profile-no-hints'].includes(row.id))) { report.evaluations.push(await evalTrial(browser, server, row)); console.log(`${row.id}: module evaluation/User Timing captured`); }
    report.cpu = await coldCPU(browser, server); console.log('production: CPU profiles and trace captured with optimized execution available');
    for (const mode of ['keyboard', 'input']) for (const coverage of [true, false]) {
      report.workloads.push(await workloadTrial(browser, server, mode, coverage)); console.log(`500 rows / ${mode}: ${coverage ? 'coverage calls' : 'CPU'} captured`);
    }
    assert.deepEqual(server.errors, []);
    await writeFile(output + 'latest.json', JSON.stringify(report, null, 2) + '\n');
    console.log(`Saved ${output}latest.json and DevTools profiles/traces`);
  } finally { await browser?.close(); await server.close(); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
