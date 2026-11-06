import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import { chromium } from '@playwright/test';
import { readBuilds, resultsDirectory } from './build.mjs';
import { createHeavyServer } from './serve.mjs';
import { products, expectedProduct } from './scenario.mjs';
import { installProbe } from '../dashboard/probe.mjs';
import { summary } from '../dashboard/statistics.mjs';
import { nativeClickTiming } from './statistics.mjs';

const samples = Number(process.env.HEAVY_SAMPLES ?? 5), warm = Number(process.env.HEAVY_WARM ?? 8);
if (![samples, warm].every(value => Number.isInteger(value) && value > 0)) throw new Error('Positive HEAVY_SAMPLES / HEAVY_WARM required');
const profiles = [{ id: 'native', cpu: 1 }, { id: 'cpu4', cpu: 4 }];
const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

async function trial(browser, server, entry, profile, iteration) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  try {
    const page = await context.newPage(), errors = [], responses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      const headers = response.headers();
      responses.push({ url: response.url(), start: response.request().timing().startTime,
        bytes: headers['content-length'] === undefined ? null : Number(headers['content-length']), status: response.status(), type: headers['content-type'] ?? '' });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    await cdp.send('Performance.enable');
    await page.addInitScript(installProbe);
    await page.goto(`${server.url}/heavy-render/${entry.id}/`);
    await page.waitForFunction(() => Boolean(window.heavyDemo));
    await page.evaluate(frames);
    const operations = [];
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
    async function measure(name, trigger, expected) {
      const ticket = await page.evaluate(spec => window.__dashboard.arm(spec), { name, event: 'click', trigger, expected, timeout: 30000 });
      const before = await metrics();
      await page.locator(trigger).click();
      const result = await page.evaluate(ticket => window.__dashboard.wait(ticket), ticket);
      assert.ok(!result.error, result.error);
      await page.evaluate(frames);
      const after = await metrics();
      const elapsed = Object.fromEntries(['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].map(key =>
        [key, Number.isFinite(before[key]) && Number.isFinite(after[key]) ? Math.max(0, after[key] - before[key]) * 1000 : null]));
      operations.push({ ...result, cpuIntervalMs: elapsed });
    }
    for (let adjustment = 1; adjustment <= warm + 1; adjustment++) {
      const expected = expectedProduct(products[entry.rows - 1], adjustment), last = `[data-product="${products[entry.rows - 1].sku}"]`;
      await measure(adjustment === 1 ? 'cold-bulk' : 'warm-bulk', '[data-action="add-all"]', [
        { selector: '[data-value="adjustment"]', text: String(adjustment) },
        { selector: `${last} [data-value="weight"]`, text: `${expected.weight} g` },
      ]);
      // Alternate the cheap action in the same large document, rather than measuring a separate tiny page.
      await measure(adjustment === 1 ? 'cold-audit' : 'warm-audit', '[data-action="check"]', [
        { selector: '[data-value="checks"]', text: String(adjustment) },
      ]);
    }
    await page.waitForLoadState('networkidle');
    const report = await page.evaluate(() => window.__dashboard.report());
    assert.deepEqual(errors, []);
    assert.ok(responses.every(response => response.status < 400));
    assert.ok(!responses.some(response => response.url.endsWith('isle.cost.json')), 'normal page never fetches cost metadata');
    return { rows: entry.rows, profile: profile.id, iteration, operations, responses,
      paints: report.paints, navigation: report.navigation, longTasks: report.longTasks,
      eventTimings: report.eventTimings, timeOrigin: report.timeOrigin };
  } finally { await context.close(); }
}

async function diagnose(browser, server, entry) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(`${server.url}/heavy-render/${entry.id}/`);
    await page.waitForFunction(() => Boolean(window.heavyDemo));
    await page.evaluate(frames);
    const passes = [];
    for (const name of ['cold', 'warm']) {
      await page.locator('[data-action="add-all"]').click();
      await page.evaluate(() => window.heavyDemo.settled());
      await page.evaluate(frames);
      const timings = await page.evaluate(() => {
        const entries = performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('isle:'));
        const result = entries.map(entry => ({ name: entry.name, ms: entry.duration, detail: entry.detail }));
        for (const entry of entries) performance.clearMeasures(entry.name);
        return result;
      });
      assert.ok(timings.some(entry => entry.detail.phase === 'run'));
      passes.push({ name, timings });
    }
    return { rows: entry.rows, cpu: 4, profile: true, note: 'Separate instrumented pass, excluded from headline latency samples.', passes };
  } finally { await context.close(); }
}

export function aggregate(cases, trials) {
  return profiles.map(profile => ({ profile, cases: cases.map(entry => {
    const rows = trials.filter(row => row.profile === profile.id && row.rows === entry.rows);
    const operations = rows.flatMap(row => row.operations);
    const latency = Object.fromEntries(['cold-bulk', 'warm-bulk', 'cold-audit', 'warm-audit'].map(name =>
      [name, summary(operations.filter(operation => operation.name === name).map(operation => operation.duration))]));
    const cpu = Object.fromEntries(['warm-bulk', 'warm-audit'].map(name => [name, Object.fromEntries(['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].map(key => {
      const values = operations.filter(operation => operation.name === name).map(operation => operation.cpuIntervalMs[key]).filter(Number.isFinite);
      return [key, values.length ? summary(values) : null];
    }))]));
    return { rows: entry.rows, static: entry.static, latency, cpu,
      nativeClick: Object.fromEntries(['warm-bulk', 'warm-audit'].map(name => [name, nativeClickTiming(rows, name)])),
      initialLongTasks: rows.flatMap(row => row.longTasks.filter(task => task.startTime < row.operations[0].start)),
      interactionLongTasks: rows.flatMap(row => row.longTasks.filter(task => task.startTime >= row.operations[0].start)),
      noCostMetadataRequest: true };
  }) }));
}

export function markdown(report) {
  const ms = stat => `${stat.median.toFixed(2)} / ${stat.p95.toFixed(2)}`;
  return `# 大量発注行の静的解析とブラウザー計測\n\n` +
    `同じ4,096商品のデータから表示件数を変え、全表示行の数量・発注額・重量を一括更新する。確認メモは同じ大きな document 内の独立 owner。\n\n` +
    `## 静的解析\n\n| 商品数 | DOM element | text patch 上限 | attribute patch 上限 | 算術演算上限 | 復元 locator | 検証用 budget |\n|---:|---:|---:|---:|---:|---:|---|\n` +
    report.cases.map(entry => { const sheet = entry.static.entries.find(row => row.id === 'Sheet.addAll');
      return `| ${entry.rows} | ${entry.static.scenario.domElements} | ${sheet.work.textPatchCalls.value} | ${sheet.work.attributePatchCalls.value} | ${sheet.work.binaryOperations.value} | ${sheet.restore.bindingLocators} | ${entry.static.budget.ok ? 'pass' : 'exceeded'} |`; }).join('\n') +
    `\n\n` + report.summary.map(group => `## ${group.profile.id} / CPU ${group.profile.cpu}x\n\n` +
      `DOM 列は入力 event timestamp → 最後の期待 DOM 更新、median / p95 (ms)。Event Timing 列は同じ warm click の browser 計測と捕捉件数。\n\n| 商品数 | cold DOM 完了 | warm DOM 完了 | warm 確認メモ DOM | warm layout (CDP) | warm click Event Timing |\n|---:|---:|---:|---:|---:|---:|\n` +
      group.cases.map(row => { const event = row.nativeClick['warm-bulk'];
        return `| ${row.rows} | ${ms(row.latency['cold-bulk'])} | ${ms(row.latency['warm-bulk'])} | ${ms(row.latency['warm-audit'])} | ${row.cpu['warm-bulk'].LayoutDuration ? ms(row.cpu['warm-bulk'].LayoutDuration) : 'missing'} | ${event.latency ? ms(event.latency) : 'missing'} (${event.reported}/${event.attempts}) |`; }).join('\n')).join('\n\n') +
    `\n\n## 方法と限界\n\n- ${report.samples} fresh contexts / 件数 / CPU条件、各 context に warm ${report.warm}回。順序を round ごとに回転し、外れ値を除去しない。cold の p95 は小標本。\n- production minified、diagnostics=false、profile=false。計測 probe は Playwright から注入し、通常 JS に含めない。HTTP は localhost gzip、追加のネットワーク遅延なし。SSR と server の圧縮 CPU は計測前。\n- 対象 node だけを観測して DOM 完了を計測。全 DOM の mutation 数検査は別 pass。表示件数の違いであり、同じ全件 UI の意味を変えずに高速化した比較ではない。\n- DOM 完了は次の paint や INP ではない。CDP の Script/Layout/RecalcStyle/TaskDuration は click 前から二つの rAF 後までの累積 duration 差分で、OS の CPU 消費時間ではない。automation/probe の仕事も含む。\n- warm click の Event Timing は startTime が1ms以内で一致する一意な trusted click だけを結合する。16ms reporting threshold、duration は8ms刻み。非同期 cold 操作の最終結果の描画や field INP と混同しない。\n- 4x は Chromium CPU slowdown で、特定端末の再現ではない。Event Timing は閾値以下を0に補完せず、long task も生データに残す。\n- 時間を静的に保証せず、計算・更新上限と layout の不明を区別する。予算は検証用の設定値。\n- instrumented.json は profile=true の別 pass。通常 runtime の速度比較には混ぜない。\n\nNode ${report.environment.node}; Chromium ${report.environment.chromium}; ${report.environment.cpu}; ${report.environment.platform}.\n`;
}

async function main() {
  if (process.argv.includes('--summarize')) {
    const report = JSON.parse(await readFile(resolve(resultsDirectory, 'latest.json'), 'utf8'));
    const raw = JSON.parse(await readFile(resolve(resultsDirectory, 'raw.json'), 'utf8'));
    report.summary = aggregate(report.cases, raw.trials);
    await writeFile(resolve(resultsDirectory, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(resolve(resultsDirectory, 'latest.md'), markdown(report));
    await writeFile(resolve(resultsDirectory, 'checkpoint.json'), JSON.stringify({ complete: true, samples: raw.samples, warm: raw.warm, trialCount: raw.trials.length, raw: 'raw.json' }) + '\n');
    return;
  }
  const builds = await readBuilds(), cases = builds.filter(entry => !entry.profile), server = await createHeavyServer(builds);
  let browser;
  try {
    browser = await chromium.launch();
    const trials = [];
    await mkdir(resultsDirectory, { recursive: true });
    for (const profile of profiles) for (let iteration = 0; iteration < samples; iteration++) {
      const order = cases.map((_, index) => cases[(index + iteration) % cases.length]);
      for (const entry of order) {
        const result = await trial(browser, server, entry, profile, iteration); trials.push(result);
        console.log(`${profile.id} ${iteration + 1}/${samples} ${entry.rows}: cold ${result.operations[0].duration.toFixed(2)} ms`);
        await writeFile(resolve(resultsDirectory, 'checkpoint.json'), JSON.stringify({ complete: false, samples, warm, trials }) + '\n');
      }
    }
    const diagnostic = await diagnose(browser, server, builds.find(entry => entry.profile));
    await writeFile(resolve(resultsDirectory, 'instrumented.json'), JSON.stringify(diagnostic, null, 2) + '\n');
    const report = { version: 1, generatedAt: new Date().toISOString(), samples, warm, cases,
      environment: { node: process.version, chromium: browser.version(), cpu: cpus()[0].model, platform: `${process.platform}/${process.arch}` },
      summary: aggregate(cases, trials) };
    assert.deepEqual(server.errors, []);
    await writeFile(resolve(resultsDirectory, 'raw.json'), JSON.stringify({ samples, warm, trials }, null, 2) + '\n');
    await writeFile(resolve(resultsDirectory, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(resolve(resultsDirectory, 'latest.md'), markdown(report));
    await writeFile(resolve(resultsDirectory, 'checkpoint.json'), JSON.stringify({ complete: true, samples, warm, trialCount: trials.length, raw: 'raw.json' }) + '\n');
    console.log(`Report: benchmarks/results/heavy-render/latest.md`);
  } finally { await browser?.close(); await server.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
