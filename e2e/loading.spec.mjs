import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { planCodeLoad } from '../runtime/manifest.mjs';

for (const [loading, port] of [['eager', 4181], ['preload', 4182]]) {
  test(`${loading} uses manifest URLs and leaves all island state suspended`, async ({ page }) => {
    const scripts = [], errors = [];
    page.on('request', request => { if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname); });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.parsedScopes = [];
      const parse = JSON.parse;
      JSON.parse = function (...args) {
        const value = Reflect.apply(parse, JSON, args);
        if (Array.isArray(value) && value[0] === 2 && value.length === 4) window.parsedScopes.push(value[2]);
        return value;
      };
    });
    await page.goto(`http://127.0.0.1:${port}`);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => window.parsedScopes)).toEqual([]);
    expect(await page.evaluate(() => window.isleDemo.metrics.completed)).toBe(0);
    const manifest = await (await page.request.get(`http://127.0.0.1:${port}/isle.manifest.json`)).json();
    expect(manifest.loading[loading]).toEqual(['Counter.h0']);
    for (const id of ['isle:resume', 'Counter.h0']) {
      const pathname = new URL(manifest.references[id].ref[0], page.url()).pathname;
      expect(scripts).toContain(pathname);
    }
    expect(scripts.some(url => url.includes('Editor.h1'))).toBe(false);
    await expect(page.locator('[data-isle-eager]')).toHaveCount(loading === 'eager' ? 2 : 0);
    const plan = planCodeLoad(manifest, manifest.loading[loading]);
    const eagerURLs = new Set(loading === 'eager' ? plan.references.map(id => manifest.references[id].ref[0]) : []);
    await expect(page.locator('[data-isle-preload]')).toHaveCount(plan.modules.filter(url => !eagerURLs.has(url)).length);
    const before = [...scripts];
    const counter = page.locator('[data-isle-root="counter"]');
    await counter.click(); await expect(counter).toHaveText('38 / 76');
    expect(scripts).toEqual(before);
    expect(await page.evaluate(() => window.parsedScopes)).toEqual(['counter']);
    await expect(page.locator('[data-isle-root="editor"]')).toHaveText('Draft');
    expect(errors).toEqual([]);
  });
}

test('development eager loading uses the same public module URLs as lazy resolution', async ({ page }) => {
  const server = await createServer({ configFile: fileURLToPath(new URL('./fixtures/loading/vite.eager.config.mjs', import.meta.url)),
    logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: false } });
  try {
    await server.listen();
    const modules = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/@isle/')) modules.push(path);
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForLoadState('networkidle');
    expect(modules).toContain('/@isle/resume.js');
    expect(modules).toContain('/@isle/handler/Counter.h0.js');
    const before = [...modules];
    const counter = page.locator('[data-isle-root="counter"]');
    await counter.click(); await expect(counter).toHaveText('38 / 76');
    expect(modules).toEqual(before);
    await expect(page.locator('[data-isle-root="editor"]')).toHaveText('Draft');
  } finally { await server.close(); }
});

test('malformed prepared exports fail before snapshot restoration', async ({ page }) => {
  const url = 'http://127.0.0.1:4181/';
  await page.goto(url); await page.waitForLoadState('networkidle');
  const manifest = await (await page.request.get(new URL('isle.manifest.json', url).href)).json();
  await page.evaluate(async url => { const { registry } = await import(url); registry[5]['Counter.h0'] = 7; }, new URL(manifest.references['isle:resume'].ref[0], url).href);
  await page.locator('[data-isle-root="counter"]').click();
  await expect.poll(() => page.evaluate(() => window.isleDemo.metrics.errors)).toBe(1);
  await expect(page.locator('[data-isle-root="counter"]')).toHaveText('37 / 74');
  expect(await page.evaluate(() => window.isleDemo.metrics.restores)).toBe(0);
});

test('an eager preparation failure is handled until an event reports it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\/assets\/isle-resume-[^/]+\.js$/, route => route.abort());
  await page.goto('http://127.0.0.1:4181/'); await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.isleDemo.metrics.restores)).toBe(0);
  expect(errors).toEqual([]);
  await page.locator('[data-isle-root="counter"]').click();
  await expect.poll(() => page.evaluate(() => window.isleDemo.metrics.errors)).toBe(1);
  expect(await page.evaluate(() => window.isleDemo.metrics.restores)).toBe(0);
  expect(errors).toEqual([]);
});
