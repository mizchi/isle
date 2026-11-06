import { test, expect } from '@playwright/test';

for (const port of [4173, 4174]) {
  test(`SSR resumes with lazy chunks and existing DOM on ${port}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`);
    const a = page.locator('[data-isle-root="counter-a"]');
    const b = page.locator('[data-isle-root="counter-b"]');
    await expect(a).toHaveText('37 / 74');
    await expect(b).toHaveText('5 / 10');
    await expect.poll(() => page.evaluate(() => window.isleDemo?.metrics.loads)).toBe(0);
    await page.evaluate(() => { window.originalCounter = document.querySelector('[data-isle-root="counter-a"]'); });
    await a.click();
    await expect(a).toHaveText('38 / 76');
    await expect(b).toHaveText('5 / 10');
    expect(await page.evaluate(() => window.originalCounter === document.querySelector('[data-isle-root="counter-a"]'))).toBe(true);
    expect(await page.evaluate(() => window.isleDemo.metrics.restores)).toBe(1);
    await page.evaluate(() => { window.reconnectIsle(); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await a.click(); await expect(a).toHaveText('39 / 78');
    expect(await page.evaluate(() => window.isleDemo.metrics.loads)).toBe(1);
    await b.click();
    await expect(b).toHaveText('6 / 12');
    await expect(a).toHaveText('39 / 78');
    expect(await page.evaluate(() => window.isleDemo.metrics.loads)).toBe(1);
    expect(errors).toEqual([]);
  });
}

test('native button keyboard activation updates text even when ARIA and layout stay unchanged', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await expect.poll(() => page.evaluate(() => Boolean(window.isleDemo))).toBe(true);
  const a = page.locator('[data-isle-root="counter-a"]');
  await a.focus(); await a.press('Enter');
  await expect(a).toHaveText('38 / 76');
});

test('SSR works before any browser JavaScript runs', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4174');
  await expect(page.locator('[data-isle-root="counter-a"]')).toHaveText('37 / 74');
  await context.close();
});

test('explicit remote action runs with server-side context', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  const editor = page.locator('[data-isle-root="editor"]');
  await editor.click();
  await expect(editor).toHaveText('Draft!');
});

test('dispose while an import is pending drops the old event', async ({ page }) => {
  let release;
  await page.route(/\/@isle\/handler\/Counter\.h0\.js/, async route => { await new Promise(resolve => { release = resolve; }); await route.continue(); });
  await page.goto('http://127.0.0.1:4173');
  const a = page.locator('[data-isle-root="counter-a"]');
  await expect.poll(() => page.evaluate(() => window.isleDemo?.metrics.loads)).toBe(0);
  await a.click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.evaluate(() => window.isleDemo.dispose('counter-a'));
  release();
  await expect.poll(() => page.evaluate(() => window.isleDemo.metrics.cancelled)).toBe(1);
  await expect(a).toHaveText('37 / 74');
});
