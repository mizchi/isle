import { test, expect } from '@playwright/test';

test('resume patches only live regions; keyed rows retain identity and closures across moves', async ({ page }) => {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  expect(requests.some(url => url.includes('isle-handler') || url.includes('isle-regions'))).toBe(false);
  await page.locator('[data-key="a"]').evaluate(node => { window.originalA = node; });
  await page.locator('[data-test="add"]').click();
  await expect(page.locator('[data-test="visible"] output')).toHaveText('1');
  await expect(page.locator('[data-key="a"] output')).toHaveText('10');
  await expect(page.locator('[data-price="a"]')).toHaveText('11');
  await expect(page.locator('[data-price="b"]')).toHaveText('21');
  await page.locator('[data-test="reverse"]').click();
  await expect(page.locator('[data-key]').first()).toHaveAttribute('data-key', 'b');
  expect(await page.locator('[data-key="a"]').evaluate(node => node === window.originalA)).toBe(true);
  await expect(page.locator('[data-key="a"] span')).toHaveText('1');
  await page.locator('[data-item="a"]').click();
  await expect(page.locator('[data-test="visible"] output')).toHaveText('10');
  await page.locator('[data-test="hide"]').click();
  await expect(page.locator('[data-test="hidden"]')).toBeVisible();
  await page.locator('[data-test="add"]').click();
  await page.locator('[data-test="show"]').click();
  await expect(page.locator('[data-test="visible"] output')).toHaveText('11');
  await page.locator('[data-test="summary"]').click();
  await expect(page.locator('[data-test="mode"]')).toHaveText('Summary');
  await page.locator('[data-test="duplicate"]').click();
  await expect(page.locator('#errors')).toHaveText('Duplicate row key');
  expect(await page.evaluate(() => window.controlErrors)).toEqual(['Duplicate row key']);
  expect(errors).toEqual([]);
  await expect(page.locator('[data-key]')).toHaveCount(2);
  await expect(page.locator('[data-key]').first()).toHaveAttribute('data-key', 'b');
  await page.locator('[data-test="empty"]').click();
  await expect(page.locator('[data-test="empty-message"]')).toBeVisible();
  await expect(page.locator('[data-test="error"]')).toHaveText('Render failed');
  await page.locator('[data-test="restore"]').click();
  await expect(page.locator('[data-key]')).toHaveCount(2);
  expect(await page.locator('[data-key="a"]').evaluate(node => node === window.originalA)).toBe(false);
  await expect(page.locator('[data-test="first"]')).toHaveText('10');
  await page.locator('[data-item="b"]').click();
  await expect(page.locator('[data-test="visible"] output')).toHaveText('20');
});


test('nested loops capture both row scopes; removed subtrees get fresh lifetimes; fallback errors reach the outer boundary', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-test="outer-error"]')).toHaveText('Render failed');
  await page.locator('button[data-group="y"][data-number="2"]').click();
  await expect(page.locator('[data-test="nested-result"]')).toHaveText('y2');
  await page.locator('[data-test="nested-hide"]').click();
  await expect(page.locator('button[data-number]')).toHaveCount(0);
  await page.locator('[data-test="nested-show"]').click();
  await expect(page.locator('button[data-number]')).toHaveCount(4);
  await page.locator('button[data-group="x"][data-number="1"]').click();
  await expect(page.locator('[data-test="nested-result"]')).toHaveText('x1');
  expect(errors).toEqual([]);
});

test('a pending code load cannot deliver an event to a replacement element with the same key', async ({ page }) => {
  let release; const barrier = new Promise(resolve => { release = resolve; });
  await page.route('**/Controls.select-*.js', async route => { await barrier; await route.continue(); });
  await page.goto('/');
  await page.locator('[data-item="a"]').click();
  await page.locator('[data-item="a"]').evaluate(node => node.replaceWith(node.cloneNode(true)));
  release();
  // Drain the lazy dispatch using the loader controller's settled contract.
  await page.evaluate(() => window.controls.settled());
  await expect(page.locator('[data-test="visible"] output')).toHaveText('0');
  await page.locator('[data-item="b"]').click();
  await expect(page.locator('[data-test="visible"] output')).toHaveText('20');
});

test('two ShadowRoot mounts share code and keep region state and disposal independent', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const markup = [...document.querySelectorAll('body > .card')].map(node => node.outerHTML).join('');
    window.shadowControls = [];
    for (const id of ['shadow-a', 'shadow-b']) {
      const host = document.createElement('div'); host.id = id; document.body.append(host);
      const root = host.attachShadow({ mode: 'open' }); root.innerHTML = markup;
      window.shadowControls.push(window.mountControls(root));
    }
  });
  const first = page.locator('#shadow-a'), second = page.locator('#shadow-b');
  await first.locator('[data-test="add"]').click();
  await expect(first.locator('[data-test="visible"] output')).toHaveText('1');
  await expect(second.locator('[data-test="visible"] output')).toHaveText('0');
  await second.locator('[data-test="hide"]').click();
  await second.locator('[data-test="show"]').click();
  await expect(second.locator('[data-test="visible"] output')).toHaveText('0');
  await page.evaluate(() => window.shadowControls[0].dispose('c'));
  await first.locator('[data-test="add"]').click();
  await page.evaluate(() => window.shadowControls[0].settled());
  await expect(first.locator('[data-test="visible"] output')).toHaveText('1');
});
