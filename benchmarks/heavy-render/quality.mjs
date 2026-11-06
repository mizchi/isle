import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { projectRoot, readBuilds, resultsDirectory } from './build.mjs';
import { createHeavyServer } from './serve.mjs';

// Fixed gates on the shared 128-row UI; large-case native DOM correctness is checked separately.
const gates = [
  ['integrity', ['check', 'integrity']],
  ['copy', ['check', 'copy'], ['--manifest', 'benchmarks/heavy-render/copy.txt']],
  ['scroll', ['scan', 'scroll']],
  ['handlers', ['scan', 'handlers']],
  ['interactions', ['check', 'interactions']],
];

async function main() {
  const cases = (await readBuilds()).filter(entry => !entry.profile), server = await createHeavyServer(cases);
  const directory = resolve(resultsDirectory, 'quality');
  let browser;
  try {
    await mkdir(directory, { recursive: true });
    const results = [], representative = `${server.url}/heavy-render/128/`;
    for (const [name, args, extra = []] of gates) {
      const child = spawn('pnpm', ['exec', 'vlmkit', ...args, representative, ...extra, '--json'], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
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
      for (const rows of [128, 4096]) {
        await page.goto(`${server.url}/heavy-render/${rows}/`);
        await page.waitForFunction(() => Boolean(window.heavyDemo));
        await page.screenshot({ path: resolve(directory, `${rows}-${width}-initial.png`) });
        if (rows === 128) await page.screenshot({ path: resolve(directory, `${rows}-${width}-full.png`), fullPage: true });
        await page.locator('[data-action="add-all"]').click();
        await page.evaluate(() => window.heavyDemo.settled());
        await page.screenshot({ path: resolve(directory, `${rows}-${width}-updated.png`) });
        await page.locator('[data-product]').last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(directory, `${rows}-${width}-last.png`) });
      }
      await page.close();
    }
    await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ version: 1, pass: true, tool: 'vlmkit/0.24.0',
      scope: 'Five fixed gates on the shared 128-row UI; initial/updated/last viewport captures also include 4096 rows.', gates: results }, null, 2) + '\n');
  } finally { await browser?.close(); await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
