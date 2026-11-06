import assert from 'node:assert/strict';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, expect } from '@playwright/test';
import { createBenchmarkServer, variantIds } from './serve.mjs';
import { size, summarizeTransfers } from './metrics.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const initialText = ['37 / 74', '5 / 10', 'Draft'];
const buttons = page => page.locator('main section.card button');
async function files(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}
async function buildSizes(id) {
  const assets = await Promise.all((await files(`${root}/dist/${id}/client`)).filter(path => path.endsWith('.js')).map(async path =>
    ({ file: relative(`${root}/dist/${id}/client`, path), ...size(await readFile(path)) })));
  return { assets, raw: assets.reduce((sum, file) => sum + file.raw, 0), gzip: assets.reduce((sum, file) => sum + file.gzip, 0) };
}
async function versions(id) {
  const require = createRequire(`${root}/variants/${id}/vite.config.mjs`);
  const name = { isle: '@isle/prototype', qwik: '@builder.io/qwik', 'qwik-next': '@qwik.dev/core', preact: 'preact' }[id];
  const packagePath = id === 'isle' ? `${root}/../package.json` : `${root}/variants/${id}/node_modules/${name}/package.json`;
  const version = JSON.parse(await readFile(packagePath, 'utf8')).version;
  return { package: name, version, vite: require('vite/package.json').version };
}

async function measure(browser, server, id) {
  const url = `${server.url}/${id}/`;
  const ssrContext = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
  try {
    const ssrPage = await ssrContext.newPage();
    const response = await ssrPage.goto(url);
    assert.equal(response.status(), 200);
    await expect(buttons(ssrPage)).toHaveText(initialText);
  } finally { await ssrContext.close(); }

  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__benchButtons = [];
      const observer = new MutationObserver(() => {
        const found = [...document.querySelectorAll('main section.card button')];
        if (found.length === 3) { window.__benchButtons = found; observer.disconnect(); }
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    let phase = 'initial';
    const starts = new WeakMap(), pending = [], entries = [], failures = [], pageErrors = [];
    let order = 0;
    page.on('request', request => starts.set(request, { phase, order: order++ }));
    page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
    page.on('response', response => {
      const request = response.request();
      const started = starts.get(request);
      pending.push((async () => {
        const type = response.headers()['content-type'] ?? '';
        const path = new URL(response.url()).pathname;
        const kind = path.startsWith('/__isle/action/') ? 'rpc' : type.includes('text/html') ? 'html'
          : /javascript/.test(type) ? 'js' : type.includes('text/css') ? 'css' : 'other';
        entries.push({ url: path, ...started, kind, status: response.status(), method: request.method(), body: await response.body() });
      })());
    });
    // Keep default Qwik preloading enabled. Initial includes 2s idle after load,
    // plus network-idle; phases are assigned when requests start, not when bodies finish.
    async function settle({ initial = false } = {}) {
      if (initial) await page.waitForTimeout(2000);
      await page.waitForLoadState('networkidle');
      await Promise.all(pending);
    }
    await page.goto(url, { waitUntil: 'load' });
    await expect(buttons(page)).toHaveText(initialText);
    await settle({ initial: true });
    assert.equal(await page.evaluate(() => window.__benchButtons.length), 3, `${id}: captured SSR buttons`);

    phase = 'counter-first';
    await buttons(page).nth(0).click();
    await expect(buttons(page)).toHaveText(['38 / 76', '5 / 10', 'Draft']);
    await settle();
    phase = 'counter-repeat';
    await buttons(page).nth(0).click();
    await expect(buttons(page)).toHaveText(['39 / 78', '5 / 10', 'Draft']);
    await settle();
    phase = 'counter-other';
    await buttons(page).nth(1).click();
    await expect(buttons(page)).toHaveText(['39 / 78', '6 / 12', 'Draft']);
    await settle();
    phase = 'remote-first';
    await buttons(page).nth(2).click();
    await expect(buttons(page)).toHaveText(['39 / 78', '6 / 12', 'Draft!']);
    await settle();
    assert.equal(await page.evaluate(() => window.__benchButtons.every((button, i) => button === document.querySelectorAll('main section.card button')[i])), true, `${id}: retained DOM`);
    assert.deepEqual(pageErrors, [], `${id}: browser errors`);
    assert.deepEqual(failures, [], `${id}: network failures`);
    assert.ok(entries.every(entry => entry.status === 200), `${id}: non-200 response`);
    const remote = entries.filter(entry => entry.kind === 'rpc');
    assert.equal(remote.length, 1, `${id}: exactly one explicit remote request`);
    assert.equal(remote[0].method, 'POST');
    assert.deepEqual(JSON.parse(remote[0].body), { ok: true, value: { id: 'demo', title: 'Draft!' } });
    entries.sort((a, b) => a.order - b.order);
    const transfers = summarizeTransfers(entries);
    const build = await buildSizes(id);
    console.log(`${id}: SSR, independent state, repeated click, remote action, DOM identity OK; ${transfers.total.gzip} B gzip observed`);
    return { id, ...await versions(id), correctness: { ssrWithoutJS: true, independentState: true, repeatedClick: true, remoteAction: true, retainedDOM: true },
      transfers, build, requests: entries.map(({ body, ...entry }) => ({ ...entry, ...size(body) })) };
  } finally { await context.close(); }
}

function markdown(report) {
  const rows = report.variants.map(result => {
    const phases = result.transfers.phases;
    const initial = phases.initial;
    const count = phase => phases[phase]?.js.gzip ?? 0;
    return `| ${result.id} ${result.version} | ${initial.html.gzip} | ${initial.js.gzip} | ${count('counter-first')} | ${count('remote-first')} | ${result.transfers.total.gzip} | ${result.build.gzip} |`;
  });
  return `# UI framework comparison\n\nGenerated: ${report.generatedAt}\n\nAll values below are **bytes, gzip level 6**, compressed per response. HTML includes inline loader, state and CSS. Total observed includes auxiliary assets (e.g. Qwik bundle graph); RPC JSON is separate.\n\n| Implementation | HTML | Initial external JS | First counter additional JS | First remote additional JS | Observed asset total | All emitted JS |\n|---|---:|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n\nSSR without JS, both independent counters, repeated click, async Draft → Draft!, and retained button DOM: passed for all implementations.\n\nInitial window: load + 2 seconds idle + network-idle. Fresh Chromium context per implementation, service workers blocked, production builds targeting ES2023 with Vite modulePreload disabled. Isle diagnostics are disabled; Qwik preloading uses its defaults. Headers and RPC response bytes excluded from asset totals. Per-phase raw bytes and request URLs are in latest.json.\n\nIsle, Qwik 2 RC and Preact use Vite 8 / Rolldown; Qwik 1 uses its supported Vite 7 / Rollup. Shared shell/CSS and one shared RPC endpoint. Framework-native routers/RPC are excluded. This small fixture compares delivered code, not general runtime speed or feature equivalence. Qwik 2 is a release candidate.\n\nNode ${report.environment.node}; Chromium ${report.environment.chromium}; ${report.environment.platform}.\n`;
}

async function main() {
  const server = await createBenchmarkServer();
  let browser;
  try {
    browser = await chromium.launch();
    const report = { generatedAt: new Date().toISOString(), environment: { node: process.version, chromium: browser.version(), platform: `${process.platform}/${process.arch}` },
      buildPolicy: { target: 'es2023', viteModulePreload: false, isleDiagnostics: false }, variants: [] };
    for (const id of variantIds) report.variants.push(await measure(browser, server, id));
    assert.deepEqual(server.errors, [], 'server errors');
    await mkdir(`${root}/results`, { recursive: true });
    await writeFile(`${root}/results/latest.json`, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(`${root}/results/latest.md`, markdown(report));
    console.log(`Saved benchmarks/results/latest.{json,md}`);
  } finally { await browser?.close(); await server.close(); }
}
// Qwik 2 RC's server bundle creates a scheduler MessagePort at import time.
// Finish the CLI explicitly after awaiting report writes and closing our resources.
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
