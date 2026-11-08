import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
let server;
let origin;
test.beforeAll(async () => {
  const dist = new URL('../dist/', import.meta.url);
  server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      const file = fileURLToPath(new URL(path === '/' ? 'index.html' : '.' + path, dist));
      const data = await readFile(file);
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => new Promise(resolve => server.close(resolve)));
test('parent owns filtering, row operations and stable keyed nodes', async ({ page }) => {
  await page.goto(origin);
  const ids = async () => page.locator('[data-review]').evaluateAll(nodes => nodes.map(node => node.dataset.review));
  const counts = async (total, open) => {
    await expect(page.getByLabel('Total reviews', { exact: true })).toHaveText(String(total));
    await expect(page.getByLabel('Open reviews', { exact: true })).toHaveText(String(open));
  };
  expect(await ids()).toEqual(['a', 'b', 'c']);
  await counts(3, 2);
  await page.getByRole('heading', { name: 'Read proposal' }).click();
  await page.locator('[data-review="a"]').click({ position: { x: 3, y: 3 } });
  await counts(3, 2);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('[data-review]')).toHaveCount(2);
  expect(await ids()).toEqual(['a', 'c']);
  await page.locator('[data-review="a"]').getByRole('button', { name: 'Toggle' }).click();
  await expect(page.locator('[data-review]')).toHaveCount(1);
  expect(await ids()).toEqual(['c']);
  await counts(3, 1);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-review]')).toHaveCount(2);
  expect(await ids()).toEqual(['a', 'b']);
  await page.getByRole('button', { name: 'Add review' }).click();
  await counts(4, 2);
  expect(await ids()).toEqual(['a', 'b']);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('[data-review]')).toHaveCount(4);
  expect(await ids()).toEqual(['a', 'b', 'c', 'd']);
  await page.getByRole('button', { name: 'Add review' }).click();
  await counts(4, 2);
  const root = await page.locator('[data-review="d"]').elementHandle();
  await page.locator('[data-review="d"]').getByRole('button', { name: 'Toggle' }).click();
  await counts(4, 1);
  expect(await root.evaluate(node => node === document.querySelector('[data-review="d"]'))).toBe(true);
});
