import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createDashboardServer, variants } from './serve.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const directory = 'benchmarks/results/dashboard/visual';
async function command(args, output) {
  const child = spawn('pnpm', ['exec', 'vlmkit', ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  if (output) await writeFile(`${root}/${output}`, stdout);
  if (code !== 0) throw new Error(`vlmkit ${args.join(' ')} (${code})\n${stderr}\n${stdout}`);
  return stdout;
}

async function main() {
  await mkdir(`${root}/${directory}`, { recursive: true });
  const server = await createDashboardServer(); let browser;
  try {
    const gates = [], comparisons = [], url = `${server.url}/dashboard/isle/`;
    for (const [name, args] of [
      ['integrity', ['check', 'integrity', url]], ['copy', ['check', 'copy', url, '--manifest', 'benchmarks/dashboard/copy.txt']],
      ['scroll', ['scan', 'scroll', url]], ['handlers', ['scan', 'handlers', url]], ['interactions', ['check', 'interactions', url]],
    ]) {
      const result = JSON.parse(await command([...args, '--json'], `${directory}/${name}.json`));
      gates.push({ name, verdict: result.verdict, counts: result.counts }); console.log(`${name}: ${result.verdict}`);
    }
    for (const id of variants.filter(id => id !== 'isle')) {
      const output = `${directory}/${id}`;
      await command(['diff', 'html', '--url', url, '--current-url', `${server.url}/dashboard/${id}/`, '--output-dir', output, '--no-paint-tree', '--no-discover']);
      const report = JSON.parse(await readFile(`${root}/${output}/diff-report.json`, 'utf8'));
      // Identical text/layout can rasterize slightly differently across inline text-node boundaries.
      assert.ok(report.results.every(result => result.rawDiffRatio <= 0.0001), `${id}: visual differences, see ${output}/diff-report.json`);
      assert.ok(report.computedStyleDiff.every(item => item.result.totalDiffs === 0), `${id}: computed style differences`);
      comparisons.push({ id, results: report.results.map(result => ({ viewport: result.viewport, rawDiffRatio: result.rawDiffRatio })) });
      console.log(`${id}: matched styles; raw pixel ratios ${report.results.map(result => result.rawDiffRatio).join(', ')}`);
    }
    browser = await chromium.launch(); const page = await browser.newPage();
    for (const [name, width] of [['desktop', 1280], ['mobile', 375]]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(url); await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${root}/${directory}/${name}.png` });
      const card = page.locator('.card').filter({ has: page.locator('[data-task="task-00"]') });
      await card.scrollIntoViewIfNeeded(); await card.locator('[data-action=increment]').click();
      await expect(card.locator('[data-value=hours]')).toHaveText('3'); await card.locator('summary').click();
      await page.screenshot({ path: `${root}/${directory}/${name}-task.png` });
      const form = page.locator('[data-project-form]'); await form.scrollIntoViewIfNeeded();
      await form.getByRole('button', { name: 'Create project', exact: true }).click(); await expect(form.getByRole('alert')).toBeVisible();
      await page.screenshot({ path: `${root}/${directory}/${name}-invalid.png` });
      await form.locator('[name=project]').fill('Delivery roadmap'); await form.locator('[name=email]').fill('owner@example.com');
      await form.locator('[name=confirmation]').fill('owner@example.com'); await form.locator('[name=accepted]').check();
      await form.getByRole('button', { name: 'Create project', exact: true }).click(); await expect(form.getByRole('status')).toHaveText('Saved.');
      await page.screenshot({ path: `${root}/${directory}/${name}-saved.png` });
    }
    await writeFile(`${root}/${directory}/summary.json`, JSON.stringify({ pass: true, gates, comparisons }, null, 2) + '\n');
  } finally { await browser?.close(); await server.close(); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
