import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { createTodoServer, files } from './serve.mjs';
import { variants } from './scenario.mjs';
import { todoFlow } from './flow.mjs';
import { measureBytes, sumSizes } from './metrics.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));

async function measure(browser, server, id) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage(), starts = new WeakMap(), pending = [], entries = [], errors = [];
    let phase = 'initial', order = 0;
    page.on('request', request => starts.set(request, { phase, order: order++ }));
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      const started = starts.get(response.request()), type = response.headers()['content-type'] ?? '';
      pending.push((async () => entries.push({ url: new URL(response.url()).pathname, ...started, status: response.status(), kind: /javascript/.test(type) ? 'js' : type.includes('text/html') ? 'html' : 'other', ...measureBytes(await response.body()) }))());
    });
    async function settle() { await page.waitForLoadState('networkidle'); await Promise.all(pending); }
    await todoFlow(page, `${server.url}/todomvc/${id}/`, { storageKey: `todos-${id}`, phase: async completed => {
      if (completed === 'initial') await page.waitForTimeout(2000);
      await settle();
      phase = ({ initial: 'first-add', 'first-add': 'crud', crud: 'persistence', complete: 'complete' })[completed];
    } });
    await settle();
    assert.deepEqual(errors, [], id);
    assert.ok(entries.every(entry => entry.status === 200), `${id}: failed response`);
    entries.sort((a, b) => a.order - b.order);
    const seen = new Set(), unique = entries.filter(entry => { if (seen.has(entry.url)) return false; seen.add(entry.url); return true; });
    const directory = `${root}/dist/todomvc/${id}/client`;
    const emitted = await Promise.all((await files(directory)).filter(file => file.endsWith('.js')).map(async file => ({ file: relative(directory, file).replaceAll('\\', '/'), ...measureBytes(await readFile(file)) })));
    const packageName = { isle: '@isle/prototype', qwik: '@builder.io/qwik', 'qwik-next': '@qwik.dev/core', preact: 'preact' }[id];
    const packagePath = id === 'isle' ? `${root}/../package.json` : `${root}/variants/${id}/node_modules/${packageName}/package.json`;
    const require = createRequire(`${root}/variants/${id}/vite.todomvc.config.mjs`);
    return { id, package: packageName, version: JSON.parse(await readFile(packagePath, 'utf8')).version, vite: require('vite/package.json').version,
      buildJS: sumSizes(emitted), emitted,
      initialHTML: sumSizes(unique.filter(entry => entry.kind === 'html' && entry.phase === 'initial')),
      initialJS: sumSizes(unique.filter(entry => entry.kind === 'js' && entry.phase === 'initial')),
      firstAddJS: sumSizes(unique.filter(entry => entry.kind === 'js' && entry.phase === 'first-add')),
      observedJS: sumSizes(unique.filter(entry => entry.kind === 'js')), observedAssets: sumSizes(unique), requests: unique,
      correctness: { add: true, editEnterBlurEscape: true, delete: true, hashFilters: true, toggleAll: true, clearCompleted: true, persistence: true, retainedKeyedDOM: true } };
  } finally { await context.close(); }
}
function markdown(report) {
  return `# TodoMVC build size comparison\n\nMeasured ${report.generatedAt}. Sizes are **bytes**, compressed per file/response: gzip level 6; Brotli quality 11.\n\n| Implementation | All emitted JS raw | gzip | Brotli |\n|---|---:|---:|---:|\n${report.variants.map(r => `| ${r.id} ${r.version} | ${r.buildJS.raw} | ${r.buildJS.gzip} | ${r.buildJS.br} |`).join('\n')}\n\n| Implementation | Initial HTML gzip | Initial external JS gzip | First add additional JS gzip | All exercised JS gzip | Observed asset total gzip |\n|---|---:|---:|---:|---:|---:|\n${report.variants.map(r => `| ${r.id} | ${r.initialHTML.gzip} | ${r.initialJS.gzip} | ${r.firstAddJS.gzip} | ${r.observedJS.gzip} | ${r.observedAssets.gzip} |`).join('\n')}\n\nAll implementations passed the same add/trim/empty, complete, keyed DOM identity, edit (Enter/blur/Escape/empty-delete), delete, hash filters, persistence/reload, toggle-all and clear-completed flow. The separate check runs this at 1280px and 375px and verifies the empty SSR view without JavaScript.\n\nProduction/minified, ES2023, no source maps, Vite modulePreload disabled. Empty initial storage and a fresh Chromium context per implementation; service workers blocked. Initial = load + 2s + network idle, including default Qwik speculative preloads. Subsequent phases are assigned when each request starts. Assets count once per URL, including the persistence reload. Shared inline CSS, shell and browser host adapter (storage/hash/focus); all adapter code is included. HTML includes inline loaders, state and CSS; it is not counted again as external JS. Auxiliary fetched assets, e.g. Qwik graph JSON, are included in observed totals. HTTP headers, compiler/SSR bundles, source maps and unrequested manifests/diagnostic reports are excluded. Brotli is a size estimate; the common server serves gzip.\n\nQwik stable ${report.variants.find(r => r.id === 'qwik').version} uses its supported Vite 7 / Rollup. Isle, Qwik 2 RC and Preact use Vite 8 / Rolldown. Exact versions, individual emitted files and fetched URLs are in latest.json. Qwik 2 is a release candidate. Isle's typed JSON decoder and generated region reconciler are included. This is an equal-feature fixture implemented here, not a measurement of official TodoMVC distributions or runtime speed. Custom accessible CSS and native hash handling replace the official site's presentation/router dependencies.\n\nNode ${report.environment.node}; Chromium ${report.environment.chromium}; ${report.environment.platform}. Reproduce: \`just todomvc-size\`.\n`;
}
async function main() {
  const server = await createTodoServer(); let browser;
  try {
    browser = await chromium.launch();
    const report = { generatedAt: new Date().toISOString(), environment: { node: process.version, chromium: browser.version(), platform: `${process.platform}/${process.arch}` }, variants: [] };
    for (const id of variants) { report.variants.push(await measure(browser, server, id)); console.log(`${id}: measured`); }
    assert.deepEqual(server.errors, []);
    await mkdir(`${root}/results/todomvc`, { recursive: true });
    await writeFile(`${root}/results/todomvc/latest.json`, JSON.stringify(report, null, 2) + '\n');
    await writeFile(`${root}/results/todomvc/latest.md`, markdown(report));
    console.log(markdown(report));
  } finally { await browser?.close(); await server.close(); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
