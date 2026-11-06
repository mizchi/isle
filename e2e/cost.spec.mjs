import { test, expect } from '@playwright/test';

for (const port of [4173, 4174]) {
  test(`debug cost JSON stays inert and maps the resumed entry on ${port}`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}`);
    await expect.poll(() => page.evaluate(() => Boolean(window.isleDemo))).toBe(true);
    const embedded = await page.locator('script[type="application/json"][data-isle-cost="1"]').textContent();
    const report = JSON.parse(embedded), entry = report.entries.find(entry => entry.id === 'Counter.h0');
    expect(entry.work.textPatchCalls).toEqual({ kind: 'upper-bound', value: 2 });
    expect(entry.instances).toBe(2);
    expect(entry.restore.childOwners).toBe(0);
    expect(await page.evaluate(() => window.isleDemo.metrics.loads)).toBe(0);
    expect(await page.evaluate(() => performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('isle:')).length)).toBe(0);
    if (port === 4174) {
      const sidecar = await (await page.request.get(`http://127.0.0.1:${port}/isle.cost.json`)).json();
      expect(sidecar).toEqual(report);
      expect(entry.code.gzipBytes).toBeGreaterThan(0);
    } else expect(entry.code).toBeUndefined();
    const counter = page.locator('[data-isle-root="counter-a"]');
    await counter.click();
    await expect(counter).toHaveText('38 / 76');
    expect(await page.evaluate(() => window.isleDemo.metrics.restores)).toBe(1);
  });
}
