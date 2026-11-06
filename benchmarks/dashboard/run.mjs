import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createDashboardServer, variants } from './serve.mjs';
import { tasks } from './model.mjs';
import { installProbe } from './probe.mjs';
import { summary, networkTransfers } from './statistics.mjs';
import { cpus } from 'node:os';

const profiles = [
  { id: 'desktop', cpu: 1, latency: 0, down: -1, up: -1 },
  { id: 'constrained', cpu: 4, latency: 80, down: 200000, up: 93750 },
];
const samples = Number(process.env.BENCH_SAMPLES ?? 12), warm = Number(process.env.BENCH_WARM ?? 12);
if (!Number.isInteger(samples) || samples < 1 || !Number.isInteger(warm) || warm < 1) throw new Error('Positive integer BENCH_SAMPLES / BENCH_WARM required');
const item = id => `[data-task="${id}"]`, value = (id, name, text) => ({ selector: `${item(id)} [data-value="${name}"]`, text: String(text) });

async function trial(browser, server, id, profile, iteration, collectNetwork = false) {
  server.reset();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  try {
    const page = await context.newPage(), errors = [];
    const networkResponses = [];
    if (collectNetwork) context.on('response', response => {
      const headers = response.headers();
      networkResponses.push({ url: response.url(), start: response.request().timing().startTime,
        bytes: headers['content-length'] === undefined ? null : Number(headers['content-length']),
        encoding: headers['content-encoding'] ?? '', type: headers['content-type'] ?? '', status: response.status() });
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && !response.url().includes('/__isle/')) errors.push(`${response.status()}: ${response.url()}`); });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    if (profile.latency) {
      const conditions = { latency: profile.latency, downloadThroughput: profile.down, uploadThroughput: profile.up, connectionType: 'cellular4g' };
      await cdp.send('Network.emulateNetworkConditionsByRule', { matchedNetworkConditions: [{ urlPattern: '', ...conditions }] });
      await cdp.send('Network.overrideNetworkState', { offline: false, ...conditions });
    }
    await page.addInitScript(installProbe);
    await page.goto(`${server.url}/dashboard/${id}/`, { waitUntil: 'domcontentloaded' });
    async function measure(name, event, trigger, expected, perform) {
      const ticket = await page.evaluate(spec => window.__dashboard.arm(spec), { name, event, trigger, expected });
      await perform();
      const result = await page.evaluate(ticket => window.__dashboard.wait(ticket), ticket);
      if (result.error) throw new Error(`${id}/${profile.id}: ${result.error}`);
      return result;
    }
    let hours = tasks[0].initial;
    const increment = `${item(tasks[0].id)} [data-action="increment"]`;
    await measure('cold-increment', 'click', increment, [value(tasks[0].id, 'hours', ++hours), value(tasks[0].id, 'cost', hours * tasks[0].rate)], () => page.locator(increment).click());
    for (let i = 0; i < warm; i++) await measure('warm-increment', 'click', increment,
      [value(tasks[0].id, 'hours', ++hours), value(tasks[0].id, 'cost', hours * tasks[0].rate)], () => page.locator(increment).click());
    const last = tasks.at(-1), lastTrigger = `${item(last.id)} [data-action="increment"]`;
    await measure('other-island', 'click', lastTrigger, [value(last.id, 'hours', last.initial + 1), value(last.id, 'cost', (last.initial + 1) * last.rate)], () => page.locator(lastTrigger).click());
    const save = `${item(tasks[0].id)} [data-action="save"]`;
    await measure('remote-save', 'click', save, [value(tasks[0].id, 'saved', hours), value(tasks[0].id, 'difference', 0)], () => page.locator(save).click());
    const form = page.locator('[data-project-form]');
    await measure('cold-form-input', 'input', '[data-project-form] [name="project"]',
      [{ selector: '[data-project-form]', attribute: 'data-isle-dirty', value: 'true' }], () => form.locator('[name=project]').fill('Delivery roadmap'));
    await form.locator('[name=email]').fill('owner@example.com');
    await form.locator('[name=confirmation]').fill('owner@example.com'); await form.locator('[name=accepted]').check();
    await expect(form).toHaveAttribute('data-isle-validating', 'false');
    await measure('form-submit', 'submit', '[data-project-form]', [
      { selector: '[data-project-form] [role="status"]', text: 'Saved.' },
      { selector: '[data-project-form] button[type="submit"]', property: 'disabled', value: false },
    ], () => form.getByRole('button', { name: 'Create project', exact: true }).click());
    assert.equal(server.commits.createProject, 1);
    const batch = tasks.slice(1, 33), burstTrigger = `${item(batch[0].id)} [data-action="increment"]`;
    await measure('burst-32-islands', 'click', burstTrigger, batch.flatMap(task => [value(task.id, 'hours', task.initial + 1), value(task.id, 'cost', (task.initial + 1) * task.rate)]), () =>
      page.evaluate(ids => { for (const id of ids) document.querySelector(`[data-task="${id}"] [data-action="increment"]`).click(); }, batch.map(task => task.id)));
    assert.deepEqual(errors, [], `${id}: browser errors`);
    // Resource and paint observers finish asynchronously; no timed operation includes this collection wait.
    await page.waitForLoadState('networkidle');
    const report = await page.evaluate(() => window.__dashboard.report());
    return { id, profile: profile.id, iteration, ...report, ...(collectNetwork ? { networkResponses } : {}) };
  } finally { await context.close(); }
}


function aggregate(trials, networkTrials) {
  return profiles.map(profile => ({ profile, variants: variants.map(id => {
    const rows = trials.filter(trial => trial.id === id && trial.profile === profile.id);
    const latencies = Object.fromEntries(['cold-increment', 'warm-increment', 'other-island', 'remote-save', 'cold-form-input', 'form-submit', 'burst-32-islands'].map(name =>
      [name, summary(rows.flatMap(row => row.operations.filter(operation => operation.name === name).map(operation => operation.duration)))]));
    return { id, trials: rows.length, latencies,
      domContentLoaded: summary(rows.map(row => row.navigation.domContentLoadedEventEnd)),
      firstContentfulPaint: summary(rows.map(row => row.paints.find(paint => paint.name === 'first-contentful-paint').startTime)),
      startupLongTaskMs: summary(rows.map(row => row.longTasks.filter(task => task.startTime < row.operations[0].start).reduce((sum, task) => sum + task.duration, 0))),
      transfers: networkTrials.filter(row => row.id === id && row.profile === profile.id).map(networkTransfers), eventTiming: { threshold: 16, reportedEntries: rows.reduce((sum, row) => sum + row.eventTimings.length, 0),
        note: 'Auxiliary native entries; durations below the reporting threshold are not replaced by zero. These samples are not field INP.' },
    };
  }) }));
}

function markdown(report) {
  const number = value => value.toFixed(2), cell = stat => `${number(stat.median)} / ${number(stat.p95)}`;
  return `# Work planning dashboard benchmark\n\nGenerated: ${report.generatedAt}\n\n64 independent work packages, calculated values, draft reset, lock, asynchronous save, native team filter/disclosure and a validated project form.\n\n` +
    report.summary.map(group => `## ${group.profile.id}\n\nCPU ${group.profile.cpu}x; configured network latency ${group.profile.latency} ms; download ${group.profile.down === -1 ? 'unlimited' : group.profile.down + ' B/s'}.\n\n` +
      `Event timestamp → expected DOM state, **median / p95 in milliseconds**. ${samples} fresh contexts per implementation; warm samples ${samples * warm}.\n\n` +
      `| Implementation | DCL | First increment | Warm increment | Other island | Save plan | First form input | Submit project | Burst 32 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n` +
      group.variants.map(row => `| ${row.id} | ${cell(row.domContentLoaded)} | ${['cold-increment', 'warm-increment', 'other-island', 'remote-save', 'cold-form-input', 'form-submit', 'burst-32-islands'].map(name => cell(row.latencies[name])).join(' | ')} |`).join('\n') +
      `\n\nUnique gzip payload bodies from HTTP response headers, in **one separate transfer pass per implementation/profile**, including worker requests. Initial means request started before the first click, including framework default prefetch.\n\n| Implementation | HTML bytes | Initial external JS | JS through scenario | Auxiliary assets | All assets |\n|---|---:|---:|---:|---:|---:|\n` +
      group.variants.map(row => `| ${row.id} | ${['html', 'initialJS', 'allJS', 'auxiliary', 'totalAssets'].map(key => row.transfers[0][key]).join(' | ')} |`).join('\n')).join('\n\n') +
    `\n\n## Method and limits\n\n- Same production UI/data/API. All HTML is pre-rendered and all assets cached by the common server before timing; SSR CPU is excluded.\n- The common API adds ${report.apiDelayMs} ms to readonly validation and to operation preparation. Project submission performs both.\n- Real clicks/input/submit use browser event timestamps and targeted MutationObservers; Playwright round trips are excluded. The 32-island burst uses synthetic clicks, separately labelled.\n- This measures DOM completion, not next paint or INP. FCP, Long Tasks, and thresholded native Event Timing are also retained in JSON.\n- Fresh Chromium context each trial, service workers blocked, ordinary HTTP/module caches retained within a trial. Implementation order rotates each round. No timing samples are trimmed. p95 uses nearest rank; ${samples} trials is a small tail sample.\n- Qwik keeps its default preload policy. Isle's emitted loading policy: ${JSON.stringify(report.configuration.isle.loading)}. Its small sibling entries share bounded chunks. Speculation Rules are disabled for all variants.\n- Form validation/scheduling use the same framework-independent headless FormSession; each framework renders its own form UI. This is not a comparison of form-library ecosystems.\n- Isle still lacks nested components, dynamic lists, cross-island shared state and routing. This fixed 64-row scenario does not establish general framework superiority. Native filtering does not update a reactive list.\n- Qwik 1 uses Vite 7/Rollup; Isle, Qwik 2 RC and Preact use Vite 8/Rolldown. Build-system differences are included. Qwik 2 is a release candidate.\n\nNode ${report.environment.node}; Chromium ${report.environment.chromium}; ${report.environment.platform}. See correctness.json, raw.json, and README.md.\n`;
}

async function main() {
  const server = await createDashboardServer(); let browser;
  try {
    browser = await chromium.launch();
    const manifest = JSON.parse(server.routes.get('/dashboard/isle/isle.manifest.json').body);
    const configuration = { isle: { loading: manifest.loading, entries: Object.fromEntries(Object.entries(manifest.references)
      .filter(([, ref]) => ref.kind === 'handler').map(([id, ref]) => [id, { chunk: ref.chunk, symbol: ref.ref[1], loading: ref.loading }])) } };
    let trials = [];
    const directory = new URL('../results/dashboard/', import.meta.url); await mkdir(directory, { recursive: true });
    const reused = process.argv.includes('--reuse-latencies');
    if (reused) {
      const prior = JSON.parse(await readFile(new URL('raw.json', directory), 'utf8'));
      assert.deepEqual(prior.configuration, configuration, 'Changed loading/chunk configuration: rerun latency measurements');
      assert.equal(prior.samples, samples); assert.equal(prior.warm, warm); trials = prior.trials;
      assert.equal(trials.length, profiles.length * variants.length * samples);
      for (const row of trials) for (const resource of row.resources.filter(resource => resource.name.endsWith('.js'))) {
        assert.ok(server.routes.has(new URL(resource.name).pathname), 'Changed chunk hashes: rerun latency measurements');
      }
    }
    if (!reused) for (const profile of profiles) for (let iteration = 0; iteration < samples; iteration++) {
      const order = variants.map((_, i) => variants[(i + iteration) % variants.length]);
      for (const id of order) {
        const row = await trial(browser, server, id, profile, iteration); trials.push(row);
        console.log(`${profile.id} ${iteration + 1}/${samples} ${id}: first ${row.operations[0].duration.toFixed(2)} ms`);
      }
      await writeFile(new URL('checkpoint.json', directory), JSON.stringify({ complete: false, samples, warm, trials }) + '\n');
    }
    const networkTrials = [];
    for (const profile of profiles) for (const id of variants) {
      networkTrials.push(await trial(browser, server, id, profile, 0, true));
      console.log(`Transfer pass ${profile.id} ${id}`);
    }
    assert.deepEqual(server.errors, []);
    const versions = Object.fromEntries(await Promise.all(variants.map(async id => {
      const file = new URL(id === 'isle' ? '../../package.json' : `../variants/${id}/package.json`, import.meta.url);
      const pkg = JSON.parse(await readFile(file, 'utf8')); return [id, { version: pkg.version ?? null, dependencies: pkg.dependencies ?? {}, vite: pkg.devDependencies.vite }];
    })));
    const report = { version: 1, generatedAt: new Date().toISOString(), samples, warm, apiDelayMs: server.delay, versions, configuration,
      reusedLatencySamples: reused, transferSamples: 1,
      environment: { node: process.version, chromium: browser.version(), platform: `${process.platform}/${process.arch}`, cpu: cpus()[0]?.model },
      summary: aggregate(trials, networkTrials) };
    await writeFile(new URL('raw.json', directory), JSON.stringify({ ...report, trials, networkTrials }, null, 2) + '\n');
    await writeFile(new URL('latest.json', directory), JSON.stringify(report, null, 2) + '\n');
    await writeFile(new URL('latest.md', directory), markdown(report));
    console.log('Saved benchmarks/results/dashboard/{latest.md,latest.json,raw.json}');
  } finally { await browser?.close(); await server.close(); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
