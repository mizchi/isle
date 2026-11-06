import { test, expect } from '@playwright/test';

test('cold page loads only the loader and expands only the activated island', async ({ page }) => {
  const scripts = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.addInitScript(() => {
    window.parsedScopes = []; window.walkedScopes = [];
    const parse = JSON.parse, walk = document.createTreeWalker.bind(document);
    JSON.parse = function (...args) {
      const value = Reflect.apply(parse, JSON, args);
      if (Array.isArray(value) && value[0] === 2 && value.length === 4) window.parsedScopes.push(value[2]);
      return value;
    };
    document.createTreeWalker = function (root, filter, ...args) {
      if (filter === 128 && root.hasAttribute?.('data-isle-root')) window.walkedScopes.push(root.getAttribute('data-isle-root'));
      return walk(root, filter, ...args);
    };
  });
  await page.goto('http://127.0.0.1:4174');
  await page.waitForLoadState('networkidle');
  expect(scripts).toHaveLength(1);
  expect(await page.evaluate(() => [window.parsedScopes, window.walkedScopes])).toEqual([[], []]);
  const a = page.locator('[data-isle-root="counter-a"]');
  await a.click(); await expect(a).toHaveText('38 / 76');
  expect(scripts).toHaveLength(3);
  expect(await page.evaluate(() => [window.parsedScopes, window.walkedScopes])).toEqual([['counter-a'], ['counter-a']]);
  await expect(page.locator('[data-isle-root="counter-b"]')).toHaveText('5 / 10');
  await expect(page.locator('[data-isle-root="editor"]')).toHaveText('Draft');
});

test('SSR-only page has no resume metadata and requests no JavaScript with JS enabled', async ({ page }) => {
  const dynamic = [], errors = [];
  page.on('request', request => { if (['script', 'fetch', 'xhr'].includes(request.resourceType())) dynamic.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('http://127.0.0.1:4176');
  const html = await response.text();
  expect(html).not.toMatch(/data-isle-|<!--i:|<script|modulepreload/);
  await expect(page.getByRole('heading', { name: 'SSR only', exact: true })).toBeVisible();
  const counter = page.getByRole('button');
  await expect(counter).toHaveText('37 / 74');
  await counter.click();
  await page.waitForLoadState('networkidle');
  await expect(counter).toHaveText('37 / 74');
  expect(await page.evaluate(() => 'ssrClientRan' in window)).toBe(false);
  expect(dynamic).toEqual([]); expect(errors).toEqual([]);
});

test('static mounts in a mixed page do not trigger runtime imports', async ({ page }) => {
  const scripts = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto('http://127.0.0.1:4177');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-isle-root]')).toHaveCount(1);
  await expect(page.locator('[data-isle-snapshot]')).toHaveCount(1);
  expect(scripts).toHaveLength(1);
  const frozen = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Static counter', exact: true }) }).getByRole('button');
  await frozen.click(); await expect(frozen).toHaveText('37 / 74');
  await page.getByText('No handler stays static', { exact: true }).click();
  expect(scripts).toHaveLength(1);
  const active = page.locator('[data-isle-root="active"]');
  await active.click(); await expect(active).toHaveText('6 / 12');
  expect(scripts).toHaveLength(3);
});

for (const action of ['dispose', 'close']) {
  test(`${action} while runtime import is pending cannot expand an island`, async ({ page }) => {
    let release;
    await page.route(/isle-resume-[^/]+\.js/, async route => {
      await new Promise(resolve => { release = resolve; }); await route.continue();
    });
    await page.goto('http://127.0.0.1:4174');
    await expect.poll(() => page.evaluate(() => Boolean(window.isleDemo))).toBe(true);
    const a = page.locator('[data-isle-root="counter-a"]');
    await a.click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.evaluate(action => action === 'dispose' ? window.isleDemo.dispose('counter-a') : window.isleDemo.close(), action);
    release();
    await expect.poll(() => page.evaluate(() => window.isleDemo.metrics.cancelled)).toBe(1);
    await expect(a).toHaveText('37 / 74');
    expect(await page.evaluate(() => [window.isleDemo.metrics.restores, window.isleDemo.metrics.loads])).toEqual([0, 0]);
    if (action === 'close') await page.evaluate(() => window.reconnectIsle());
    const b = page.locator('[data-isle-root="counter-b"]');
    await b.click(); await expect(b).toHaveText('6 / 12');
  });
}

test('loader captures input values before an asynchronous import resolves', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175');
  await expect.poll(() => page.evaluate(() => Boolean(window.createTestLoader))).toBe(true);
  const values = await page.evaluate(async () => {
    window.isleDemo.close();
    const received = [];
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const controller = window.createTestLoader(document, () => pending, ['input']);
    const input = document.querySelector('input');
    input.setAttribute('data-isle-on-input', 'fields|test');
    input.value = 'first'; input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = 'second'; input.dispatchEvent(new Event('input', { bubbles: true }));
    release({ registry: [], resume: () => ({
      dispatch(root, element, id, handler, payload) { received.push(payload.value); },
      dispose() {}, close() {}, async settled() {},
    }) });
    await controller.settled(); controller.close();
    return received;
  });
  expect(values).toEqual(['first', 'second']);
});
