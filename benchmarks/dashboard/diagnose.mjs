import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { createDashboardServer } from './serve.mjs';
import { installProbe } from './probe.mjs';

// Diagnostic only: mark module-body evaluation without changing production files.
// Results are separate from the uninstrumented benchmark and are never merged into it.
const directory = new URL('../results/dashboard/diagnostics/', import.meta.url);
await mkdir(directory, { recursive: true });
const server = await createDashboardServer(); let browser;
try {
  const eager = process.argv.includes('--eager');
  if (eager) {
    const html = server.routes.get('/dashboard/isle/');
    html.body = Buffer.from(html.body.toString().replace(/<link rel="modulepreload" href="([^"]+)" crossorigin="anonymous" data-isle-preload="">/g,
      '<script type="module" src="$1" crossorigin="anonymous"></script>'));
    html.gzip = gzipSync(html.body, { level: 6 });
  }
  for (const [path, asset] of server.routes) if (path.startsWith('/dashboard/isle/') && path.endsWith('.js')) {
    asset.body = Buffer.from(`performance.mark(${JSON.stringify(`eval:${path}`)});\n${asset.body}`);
    asset.gzip = gzipSync(asset.body, { level: 6 });
  }
  browser = await chromium.launch();
  const trials = [];
  for (const input of ['trusted', 'synthetic']) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page), trace = [];
      cdp.on('Tracing.dataCollected', ({ value }) => trace.push(...value));
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing', transferMode: 'ReportEvents' });
      await page.addInitScript(installProbe);
      await page.goto(`${server.url}/dashboard/isle/`, { waitUntil: 'domcontentloaded' });
      const trigger = '[data-task="task-00"] [data-action="increment"]';
      await page.locator(trigger).scrollIntoViewIfNeeded();
      const ticket = await page.evaluate(trigger => window.__dashboard.arm({ name: 'cold-increment', event: 'click', trigger,
        expected: [{ selector: '[data-task="task-00"] [data-value="hours"]', text: '3' }, { selector: '[data-task="task-00"] [data-value="cost"]', text: '240' }] }), trigger);
      if (input === 'trusted') await page.locator(trigger).click();
      else await page.evaluate(trigger => document.querySelector(trigger).click(), trigger);
      const operation = await page.evaluate(ticket => window.__dashboard.wait(ticket), ticket);
      assert.ok(!operation.error, operation.error);
      await page.waitForLoadState('networkidle');
      const report = await page.evaluate(() => ({ ...window.__dashboard.report(), marks: performance.getEntriesByType('mark').map(mark => mark.toJSON()) }));
      const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end'); await completed;
      await writeFile(new URL(`${eager ? 'eager.' : ''}${input}.trace.json.gz`, directory), gzipSync(JSON.stringify({ traceEvents: trace })));
      trials.push({ input, operation, ...report });
      console.log(JSON.stringify({ input, duration: operation.duration, marks: report.marks.map(mark => ({ name: mark.name.split('/').at(-1), afterEvent: mark.startTime - operation.start })) }));
    } finally { await context.close(); }
  }
  const manifest = JSON.parse(server.routes.get('/dashboard/isle/isle.manifest.json').body);
  await writeFile(new URL(eager ? 'eager.modules.json' : 'modules.json', directory), JSON.stringify({ generatedAt: new Date().toISOString(), diagnosticOnly: true, instrumented: true,
    override: eager ? 'eager scripts replace initial modulepreload links' : null, loading: manifest.loading, trials }, null, 2) + '\n');
} finally { await browser?.close(); await server.close(); }
process.exit(0);
