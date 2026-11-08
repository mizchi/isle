import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(import.meta.dirname, 'dist');
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    const content = await readFile(join(root, path === '/' ? 'index.html' : path));
    response.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' })[extname(path)] ?? (path === '/' ? 'text/html' : 'application/octet-stream'));
    response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 640 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const ids = () => page.locator('[data-review]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-review')));
  const counts = async (total, open) => {
    assert.equal(await page.getByLabel('Total reviews', { exact: true }).textContent(), String(total));
    assert.equal(await page.getByLabel('Open reviews', { exact: true }).textContent(), String(open));
  };
  const expectIds = async expected => {
    await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-review]')].map(node => node.getAttribute('data-review'))) === JSON.stringify(expected), expected);
    assert.deepEqual(await ids(), expected);
  };
  await page.goto(origin);
  await expectIds(['a', 'b', 'c']); await counts(3, 2);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expectIds(['a', 'c']); await counts(3, 2);
  await page.locator('[data-review="a"]').getByRole('button', { name: 'Toggle' }).click();
  await expectIds(['c']); await counts(3, 1);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expectIds(['a', 'b']); await counts(3, 1);
  await page.getByRole('button', { name: 'Add review', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Total reviews"]').textContent === '4');
  await expectIds(['a', 'b']); await counts(4, 2);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expectIds(['a', 'b', 'c', 'd']); await counts(4, 2);
  await page.getByRole('button', { name: 'Add review', exact: true }).click();
  await expectIds(['a', 'b', 'c', 'd']); await counts(4, 2);
  await page.locator('[data-review="d"]').evaluate(node => { window.savedCard = node; });
  await page.locator('[data-review="d"]').getByRole('button', { name: 'Toggle' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Open reviews"]').textContent === '1');
  await counts(4, 1);
  assert.equal(await page.evaluate(() => window.savedCard === document.querySelector('[data-review="d"]')), true);
  const geometry = [];
  for (const width of [320, 599, 600, 960]) {
    await page.setViewportSize({ width, height: 640 });
    const rectangles = await page.locator('[data-review]').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    assert.equal(new Set(rectangles.map(rect => rect.x)).size, width < 600 ? 1 : 2);
    assert.ok(rectangles.every(rect => rect.width >= 160 && rect.height >= 96 && rect.x >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= 640));
    geometry.push({ width, rectangles });
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.screenshot({ path: join(import.meta.dirname, 'outputs/mobile.png') });
  await page.locator('[data-review="a"]').getByRole('heading', { name: 'Read proposal' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Open reviews"]').textContent === '2');
  await counts(4, 2);
  assert.deepEqual(errors, []);
  const ssrFiles = await readdir(join(import.meta.dirname, 'dist-ssr'), { recursive: true });
  assert.deepEqual(ssrFiles.filter(file => /\.(js|mjs|wasm)$/.test(file)), []);
  const assets = await readdir(join(root, 'assets'));
  assert.ok(assets.every(file => !file.includes('z3') && !file.endsWith('.wasm')));
  console.log(JSON.stringify({ ok: true, interactionSteps: 7, preserveRoot: true, geometry, ssrJavaScriptChunks: 0, usabilityConcern: { titleClickAlsoToggles: true } }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
