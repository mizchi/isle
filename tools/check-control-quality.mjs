import { build, preview } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
const configFile = resolve('e2e/fixtures/control-flow/vite.config.mjs');
const directory = resolve('evals/results/control-flow/quality');
const gates = [
  ['integrity', ['check', 'integrity']],
  ['copy', ['check', 'copy'], ['--manifest', 'evals/scenarios/control-flow/copy.txt']],
  ['scroll', ['scan', 'scroll']],
  ['handlers', ['scan', 'handlers']],
  ['interactions', ['check', 'interactions']],
];
await build({ configFile, logLevel: 'silent' });
const server = await preview({ configFile, logLevel: 'silent', preview: { port: 0, strictPort: false } });
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
let browser;
try {
  await mkdir(directory, { recursive: true });
  const results = [];
  for (const [name, args, extra = []] of gates) {
    const child = spawn('pnpm', ['exec', 'vlmkit', ...args, url, ...extra, '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    await writeFile(resolve(directory, `${name}.json`), stdout);
    if (status !== 0) throw new Error(`vlmkit ${name} failed (${status}): ${stderr}\n${stdout}`);
    const report = JSON.parse(stdout); results.push({ name, verdict: report.verdict, counts: report.counts });
    console.log(`${name}: ${report.verdict}`);
  }
  browser = await chromium.launch();
  for (const width of [1280, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(url);
    await page.screenshot({ path: resolve(directory, `${width}-initial.png`), fullPage: true });
    await page.locator('[data-test="reverse"]').click(); await page.evaluate(() => window.controls.settled());
    await page.screenshot({ path: resolve(directory, `${width}-reordered.png`), fullPage: true });
    await page.locator('[data-test="hide"]').click(); await page.locator('[data-test="empty"]').click();
    await page.evaluate(() => window.controls.settled());
    await page.screenshot({ path: resolve(directory, `${width}-empty-hidden-catch.png`), fullPage: true });
    await page.close();
  }
  await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ pass: true, tool: 'vlmkit/0.24.0', gates: results }, null, 2) + '\n');
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
