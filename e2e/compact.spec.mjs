import { test, expect } from '@playwright/test';

test('minified attribute runtime uses native properties and keeps adjacent static text', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4175');
  const fields = page.locator('[data-isle-root="fields"]'), input = fields.locator('input');
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('37');
  await expect(fields).toHaveAttribute('title', '37');
  await fields.locator('button').click();
  await expect(fields).toHaveAttribute('title', '38');
  await expect(input).toHaveValue('38');
  await expect(input).toBeDisabled();
  const empty = page.locator('[data-isle-root="empty"]');
  await expect(empty).toHaveText(' suffix');
  await empty.click();
  await expect(empty).toHaveText('ready suffix');
  expect(errors).toEqual([]);
});

test('minified event queue preserves rapid writes and close removes delegated listeners', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174');
  await expect.poll(() => page.evaluate(() => Boolean(window.isleDemo))).toBe(true);
  const a = page.locator('[data-isle-root="counter-a"]');
  await a.evaluate(button => { button.click(); button.click(); });
  await expect(a).toHaveText('39 / 78');
  await page.evaluate(async () => { await window.isleDemo.settled(); window.isleDemo.close(); });
  await a.click();
  await expect(a).toHaveText('39 / 78');
  expect(await page.evaluate(() => window.isleDemo.metrics.completed)).toBe(2);
});

for (const invalid of ['version', 'schema', 'owner', 'type', 'extra-slot', 'prototype']) {
  test(`minified runtime rejects invalid snapshot: ${invalid}`, async ({ page }) => {
    await page.goto('http://127.0.0.1:4174');
    await expect.poll(() => page.evaluate(() => Boolean(window.isleDemo))).toBe(true);
    await page.evaluate(invalid => {
      const node = document.querySelector('[data-isle-snapshot="counter-a"]');
      const snapshot = JSON.parse(node.textContent);
      if (invalid === 'version') snapshot[0] = 1;
      if (invalid === 'schema') snapshot[1] = 'wrong-build';
      if (invalid === 'owner') snapshot[2] = 'counter-b';
      if (invalid === 'type') snapshot[3][0] = '37';
      if (invalid === 'extra-slot') snapshot[3].push(999);
      if (invalid === 'prototype') { snapshot[1] = 'toString'; snapshot[3] = []; }
      node.textContent = JSON.stringify(snapshot);
    }, invalid);
    const a = page.locator('[data-isle-root="counter-a"]');
    await a.click();
    await expect.poll(() => page.evaluate(() => window.isleDemo.metrics.errors)).toBe(1);
    await expect(a).toHaveText('37 / 74');
    expect(await page.evaluate(() => window.isleDemo.metrics.completed)).toBe(0);
  });
}
