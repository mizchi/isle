import { build, preview } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const shared = process.argv.includes('--schema');
const example = shared ? 'schema-form' : 'form';
const configFile = fileURLToPath(new URL(`../examples/${example}/vite.config.mjs`, import.meta.url));
const directory = new URL(`../evals/results/forms/${shared ? 'schema/' : ''}`, import.meta.url);
const gates = [
  ['integrity', ['check', 'integrity']],
  ['copy', ['check', 'copy'], ['--manifest', `examples/${example}/copy.txt`]],
  ['scroll', ['scan', 'scroll']],
  ['handlers', ['scan', 'handlers']],
  ['interactions', ['check', 'interactions']],
  ['contrast', ['check', 'a11y', 'contrast']],
  ['touch', ['check', 'a11y', 'touch']],
  ['focus', ['check', 'a11y', 'focus']],
];

async function gate(name, args, url, extra = []) {
  const child = spawn('pnpm', ['exec', 'vlmkit', ...args, url, ...extra, '--json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  await writeFile(new URL(`${name}.json`, directory), stdout);
  if (status !== 0) throw new Error(`vlmkit ${name} failed (${status}): ${stderr}\n${stdout}`);
  const report = JSON.parse(stdout);
  console.log(`Form a11y: ${name} ${report.verdict}`);
  return { name, verdict: report.verdict, counts: report.counts };
}

let server, browser;
try {
  await mkdir(directory, { recursive: true });
  await build({ configFile, logLevel: 'silent' });
  server = await preview({ configFile, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  const url = server.resolvedUrls.local[0];
  const reports = [];
  for (const [name, args, extra] of gates) reports.push(await gate(name, args, url, extra));
  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const [name, width] of [['desktop', 1280], ['mobile', 375]]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(url); await page.waitForLoadState('networkidle');
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, directory)), fullPage: true });
    await page.getByRole('button', { name: shared ? 'Create account' : 'Save', exact: true }).click();
    if (shared) await page.getByRole('alert').waitFor();
    else await page.locator('p[aria-live]').filter({ hasText: /.+/ }).waitFor();
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-invalid.png`, directory)), fullPage: true });
    if (shared) {
      const email = `sample-${name}@example.com`;
      await page.locator('[name=email]').fill(email); await page.locator('[name=confirmation]').fill(email);
      await page.locator('[name=accepted]').check();
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
      await page.screenshot({ path: fileURLToPath(new URL(`${name}-saved.png`, directory)), fullPage: true });
    }
  }
  await context.close();
  await writeFile(new URL('summary.json', directory), JSON.stringify({ version: 1, pass: true, gates: reports }, null, 2) + '\n');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
