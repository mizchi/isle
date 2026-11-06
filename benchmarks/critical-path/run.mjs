import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { createTodoServer, files } from '../todomvc/serve.mjs';
import { layoutMetrics } from './metrics.mjs';
import { observeCriticalPath } from './observe.mjs';

const seed = (count, long = false) => Array.from({ length: count }, (_, i) => ({ id: i + 1, title: long ? 'A long title that must wrap safely across several lines. '.repeat(3) : `Saved todo ${i + 1}`, completed: i % 2 === 1 }));
const patterns = [
  { id: 'static', fixture: true }, { id: 'ssr-only', fixture: true },
  { id: 'scalar', fixture: true, action: 'scalar' }, { id: 'branch', fixture: true, action: 'branch' },
  { id: 'keyed', fixture: true, action: 'keyed' }, { id: 'multi-owner', fixture: true, action: 'multi-owner' },
  { id: 'empty', count: 0, action: 'add' }, { id: 'return-one', count: 1 },
  { id: 'return-many', count: 20, action: 'filter' }, { id: 'return-heavy', count: 500, action: 'typing' },
  { id: 'route-active', count: 20, hash: '#/active' }, { id: 'route-completed', count: 20, hash: '#/completed' },
  { id: 'route-split', target: 'todomvc-split', count: 20, hash: '#/active', delayRoute: true },
  { id: 'long-title', count: 6, long: true }, { id: 'invalid-storage', saved: '{invalid', count: 0, action: 'add' },
  { id: 'blocked-storage', blockedStorage: true, count: 0, action: 'add' },
  { id: 'slow-css', count: 20, externalCSS: true },
];
// A real pre-fix layout is a negative control: the observer must detect its movement.
const baselineCSS = await readFile(new URL('../../evals/scenarios/critical-path/unreserved.css', import.meta.url), 'utf8');
const arguments_ = process.argv.slice(2);
const selected = arguments_.find(arg => arg.startsWith('--pattern='))?.slice(10);
const widths = arguments_.includes('--smoke') ? [375] : [375, 768, 1280];
// Focused repros must not overwrite the complete result matrix. Screenshots
// live outside Playwright's output directory, which E2E cleans on startup.
const output = fileURLToPath(new URL(selected || arguments_.includes('--smoke') ? '../../.critical-path/' : '../results/critical-path/', import.meta.url));
async function main() {
  const server = await createTodoServer();
  let browser;
  const results = [];
  try {
    for (const id of ['static', 'ssr-only', 'scalar', 'branch', 'keyed', 'multi-owner']) {
      const base = fileURLToPath(new URL(`../dist/critical-path/${id}/`, import.meta.url));
      for (const file of await files(base)) {
        const body = await readFile(file), path = `/critical/${id}/${file.slice(base.length)}`;
        server.routes.set(path, { body, gzip: gzipSync(body), type: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html' });
        if (file === base + 'index.html') server.routes.set(`/critical/${id}/`, server.routes.get(path));
      }
    }
    const splitBase = fileURLToPath(new URL('../dist/todomvc-split/isle/client/', import.meta.url));
    for (const file of await files(splitBase)) {
      const body = await readFile(file), path = `/todomvc-split/isle/${file.slice(splitBase.length)}`;
      server.routes.set(path, { body, gzip: gzipSync(body, { level: 6 }), type: file.endsWith('.js') ? 'text/javascript' : 'application/json' });
      if (file === splitBase + 'todomvc.html') server.routes.set('/todomvc-split/isle/', { ...server.routes.get(path), type: 'text/html' });
    }
    browser = await chromium.launch();
    const available = [...patterns, { id: 'unreserved-control', count: 1, negative: true }];
    const cases = selected ? available.filter(pattern => selected.split(',').includes(pattern.id)) : available;
    assert.ok(cases.length, 'Unknown critical-path pattern');
    for (const width of widths) for (const pattern of cases) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      let release = () => {};
      try {
        await context.addInitScript(observeCriticalPath, { saved: pattern.saved ?? (pattern.count ? JSON.stringify(seed(pattern.count, pattern.long)) : undefined), blockedStorage: pattern.blockedStorage });
        const page = await context.newPage(), errors = [], scripts = new Set();
        const gate = new Promise(resolve => { release = resolve; });
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (new URL(response.url()).pathname.endsWith('.js')) scripts.add(new URL(response.url()).pathname); });
        // Hold scripts until after FCP, then add 650ms per fetch: hydration/resume
        // must not depend on finishing before paint or the 500ms input exclusion.
        await page.route('**/*.js', async route => { await gate; await new Promise(resolve => setTimeout(resolve, pattern.delayRoute && route.request().url().includes('TodoMVC.route-') ? 1900 : 650)); await route.continue(); });
        if (pattern.externalCSS || pattern.negative) await page.route('**/todomvc/isle/', async route => {
          let html = server.routes.get('/todomvc/isle/').body.toString();
          if (pattern.negative) html = html.replace(/<style>[\s\S]*?<\/style>/, `<style>${baselineCSS}</style>`);
          if (pattern.externalCSS) html = html.replace(/<style>([\s\S]*?)<\/style>/, '<link rel="stylesheet" href="/critical.css">');
          await route.fulfill({ body: html, contentType: 'text/html' });
        });
        if (pattern.externalCSS) await page.route('**/critical.css', async route => {
          await new Promise(resolve => setTimeout(resolve, 400));
          const css = server.routes.get('/todomvc/isle/').body.toString().match(/<style>([\s\S]*?)<\/style>/)[1];
          await route.fulfill({ body: css, contentType: 'text/css' });
        });
        const path = pattern.fixture ? `/critical/${pattern.id}/` : `/${pattern.target ?? 'todomvc'}/isle/`;
        await page.goto(`${server.url}${path}${pattern.hash ?? ''}`, { waitUntil: 'commit' });
        await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0);
        await page.evaluate(() => { window.__firstOwner = document.querySelector('[data-isle-root]'); });
        const anchor = page.locator('.info'), before = await anchor.boundingBox();
        await page.screenshot({ path: `.critical-path/screenshots/${pattern.id}-${width}-first.png`, fullPage: true });
        release();
        if (!pattern.fixture) {
          const expected = pattern.hash ? pattern.count / 2 : pattern.count;
          await expect(page.locator('.todo-list li')).toHaveCount(expected);
          if (pattern.hash) await expect(page.locator('.todoapp')).toHaveAttribute('data-filter', pattern.hash.slice(2));
        }
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const readyTime = await page.evaluate(() => performance.now());
        const initial = await page.evaluate(() => window.__criticalPath.read());
        const after = await anchor.boundingBox(), initialMetrics = layoutMetrics(initial.entries);
        const initialScripts = [...scripts];
        if (pattern.action === 'add') {
          const input = page.getByRole('textbox', { name: 'New todo', exact: true });
          await input.fill('Delayed first action'); await input.press('Enter');
          await expect(page.locator('.todo-title')).toHaveText('Delayed first action');
        } else if (pattern.action === 'typing') {
          const input = page.getByRole('textbox', { name: 'New todo', exact: true });
          await input.pressSequentially('64 characters exercise keydown and input without list changes.....');
          await input.press('Enter'); await expect(page.locator('.todo-list li')).toHaveCount(501);
        } else if (pattern.action === 'filter') {
          await page.getByRole('link', { name: 'Completed', exact: true }).click(); await expect(page.locator('.todo-list li')).toHaveCount(10);
          await page.getByRole('link', { name: 'All', exact: true }).click(); await expect(page.locator('.todo-list li')).toHaveCount(20);
        } else if (pattern.action === 'scalar' || pattern.action === 'multi-owner') {
          await page.getByRole('button', { name: 'Increment' }).first().click(); await expect(page.locator('[data-count]').first()).toHaveText('1');
          if (pattern.action === 'multi-owner') {
            await expect(page.locator('[data-count]').last()).toHaveText('0');
            const loaded = [...scripts];
            await page.getByRole('button', { name: 'Increment' }).last().click(); await expect(page.locator('[data-count]').last()).toHaveText('1');
            assert.deepEqual([...scripts], loaded, 'A second owner must reuse the already loaded runtime and code');
          }
        } else if (pattern.action === 'branch') {
          await page.getByRole('button', { name: 'Toggle details' }).click(); await expect(page.locator('.reserved')).toContainText('Details occupy');
        } else if (pattern.action === 'keyed') {
          await page.getByRole('button', { name: 'Clear rows' }).click(); await expect(page.locator('li')).toHaveText(['No rows.']);
        }
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(150); // deliver the Layout Instability observer's next frame
        const final = await page.evaluate(() => window.__criticalPath.read());
        const finalMetrics = layoutMetrics(final.entries), finalAnchor = await anchor.boundingBox();
        const identity = await page.evaluate(() => window.__firstOwner === document.querySelector('[data-isle-root]'));
        await page.screenshot({ path: `.critical-path/screenshots/${pattern.id}-${width}-ready.png`, fullPage: true });
        const bytes = paths => paths.reduce((sum, path) => sum + (server.routes.get(path)?.gzip.length ?? 0), 0);
        const row = { pattern: pattern.id, width, negative: !!pattern.negative, readyTime, fcp: initial.paints.find(entry => entry.name === 'first-contentful-paint')?.startTime,
          paints: final.paints, lcp: final.largest,
          initial: initialMetrics, final: finalMetrics, anchor: { before, after, final: finalAnchor }, identity,
          initialJS: bytes(initialScripts), totalJS: bytes([...scripts]), scripts: [...scripts], errors };
        results.push(row);
        assert.deepEqual(errors, []);
        assert.ok(identity, 'SSR owner identity must survive resume');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page must not overflow horizontally');
        if (pattern.negative) assert.ok(initialMetrics.cls > 0, 'Unreserved negative control must produce measurable CLS');
        else {
          row.pass = initialMetrics.rawShift === 0 && finalMetrics.cls === 0 && before.y === after.y && after.y === finalAnchor.y;
          if (['static', 'ssr-only'].includes(pattern.id)) assert.equal(scripts.size, 0, 'Static/SSR-only routes must fetch no JS');
        }
        console.log(`${pattern.id} @ ${width}: initial CLS=${initialMetrics.cls.toFixed(6)}, raw=${initialMetrics.rawShift.toFixed(6)}, final CLS=${finalMetrics.cls.toFixed(6)}${pattern.negative ? ' (negative control)' : row.pass ? ' PASS' : ' FAIL'}`);
      } finally { release(); await context.close(); }
    }
    assert.deepEqual(server.errors, []);
  } finally {
    await browser?.close(); await server.close();
    await mkdir(output, { recursive: true });
    await writeFile(output + 'latest.json', JSON.stringify({ measuredAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), workingTree: true,
      browser: `Chromium ${browser?.version() ?? 'unavailable'}`, node: process.version, platform: `${process.platform}/${process.arch}`, scriptDelay: 650, results }, null, 2) + '\n');
  }
  assert.ok(results.filter(row => !row.negative).every(row => row.pass), 'Critical path must have zero raw shifts and retain surrounding geometry; inspect latest.json');
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
