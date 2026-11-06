import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { renderHostPage } from '../examples/worker-widget/host-page.mjs';

const widgetURL = new URL(process.argv[2] ?? 'http://127.0.0.1:8787/').href;
const runtime = process.argv[3] ?? 'shared';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = new URL(`${process.env.WIDGET_RESULTS ?? 'evals/results/widget-elements'}/quality/`, new URL('../', import.meta.url));
const gates = [
  ['integrity', ['check', 'integrity']],
  ['copy', ['check', 'copy']],
  ['scroll', ['scan', 'scroll']],
  ['handlers', ['scan', 'handlers']],
  ['interactions', ['check', 'interactions']],
  ['breakpoints', ['check', 'breakpoints']],
  ['responsive', ['check', 'responsive']],
];
const publisher = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(renderHostPage(widgetURL, { runtime }));
});
let browser;
try {
  // An unavailable Worker must fail before the gates can mistake an error page for a demo.
  const response = await fetch(widgetURL, { signal: AbortSignal.timeout(10000) });
  if (!response.ok || !(await response.text()).includes('Work planner widget')) throw new Error('Start just widget-dev, or supply the deployed widget URL');
  await mkdir(directory, { recursive: true });
  await new Promise(resolve => publisher.listen(0, '127.0.0.1', resolve));
  const publisherURL = `http://localhost:${publisher.address().port}/`;
  const reports = [];
  for (const [surface, url] of [['publisher', publisherURL], ['widget', widgetURL]]) {
    for (const [name, args] of gates) {
      const extra = name === 'copy' ? ['--manifest', `examples/worker-widget/${surface}-copy.txt`] : name === 'breakpoints' ? ['--sweep'] : [];
      const child = spawn('pnpm', ['exec', 'vlmkit', ...args, url, ...extra, '--json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
      const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
      await writeFile(new URL(`${surface}-${name}.json`, directory), stdout);
      if (status !== 0) throw new Error(`Widget ${surface}/${name} failed (${status}): ${stderr}\n${stdout}`);
      const report = JSON.parse(stdout);
      if (report.verdict !== 'pass' && report.verdict !== 'warn') throw new Error(`Widget ${surface}/${name}: ${report.verdict}`);
      console.log(`Widget quality: ${surface}/${name} ${report.verdict}`);
      reports.push({ surface, name, verdict: report.verdict, counts: report.counts });
    }
  }
  browser = await chromium.launch();
  for (const width of [1280, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(publisherURL); await page.waitForLoadState('networkidle');
    await page.screenshot({ path: fileURLToPath(new URL(`initial-${width}.png`, directory)), fullPage: true });
    await page.close();
  }
  await writeFile(new URL('summary.json', directory), JSON.stringify({ widgetURL, runtime, gates: reports }, null, 2) + '\n');
} finally {
  await browser?.close();
  if (publisher.listening) await new Promise(resolve => publisher.close(resolve));
}
