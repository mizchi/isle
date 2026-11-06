import { test, expect } from '@playwright/test';
import { build, preview } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isle } from '../lib/vite.mjs';

let server, directory, url;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL('./fixtures/profile/', import.meta.url));
  directory = await mkdtemp(join(tmpdir(), 'isle-profile-e2e-'));
  await build({ configFile: false, root, base: './', logLevel: 'silent',
    plugins: [isle({ entry: join(root, 'app.isle'), clientEntry: join(root, 'main.mjs'), profile: true, diagnostics: false,
      mounts: [
        { component: 'Counter', props: { initial: 37 }, label: 'Counter', scopeId: 'counter' },
        { component: 'Overflow', props: { initial: Number.MAX_VALUE }, label: 'Overflow', scopeId: 'overflow' },
        { component: 'Slow', props: { initial: 5 }, label: 'Slow', scopeId: 'slow' },
      ] })], build: { outDir: directory, emptyOutDir: true } });
  server = await preview({ configFile: false, root, logLevel: 'silent', build: { outDir: directory },
    preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  url = server.resolvedUrls.local[0];
});
test.afterAll(async () => {
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  if (directory) await rm(directory, { recursive: true, force: true });
});
const entries = page => page.evaluate(() => performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('isle:')).map(entry => ({
  name: entry.name, start: entry.startTime, duration: entry.duration, detail: entry.detail,
})));

test('profiling names each boundary and separates cold restoration from warm execution', async ({ page }) => {
  await page.goto(url); await page.waitForLoadState('networkidle');
  expect(await entries(page)).toEqual([]);
  const button = page.locator('[data-isle-root="counter"]');
  await button.click(); await expect(button).toHaveText('38');
  await page.evaluate(() => window.isleDemo.settled());
  const cold = await entries(page);
  expect(new Set(cold.map(entry => entry.detail.phase))).toEqual(new Set(['loader-queue', 'runtime', 'queue', 'code', 'restore', 'run', 'interaction']));
  const interaction = cold.find(entry => entry.detail.phase === 'interaction');
  for (const entry of cold) {
    expect(entry.start).toBeGreaterThanOrEqual(interaction.start);
    expect(entry.start + entry.duration).toBeLessThanOrEqual(interaction.start + interaction.duration + 0.001);
  }
  expect(new Set(cold.map(entry => entry.detail.invocation)).size).toBe(1);
  for (const entry of cold) {
    expect(entry.name).toBe(`isle:Counter.increment:${entry.detail.phase}`);
    expect(entry.detail.handlerId).toBe('Counter.increment');
    expect(entry.detail.scopeId).toBe('counter');
    expect(entry.detail.status).toBe('ok');
    expect(entry.duration).toBeGreaterThanOrEqual(0);
  }
  expect(cold.find(entry => entry.detail.phase === 'code').detail.cached).toBe(false);
  const manifest = await (await page.request.get(new URL('isle.manifest.json', url).href)).json();
  expect(cold.find(entry => entry.detail.phase === 'code').detail.url).toBe(new URL(manifest.references['Counter.increment'].ref[0], url).href);
  await button.click(); await expect(button).toHaveText('39');
  await page.evaluate(() => window.isleDemo.settled());
  const warm = (await entries(page)).slice(cold.length);
  expect(warm.some(entry => entry.detail.phase === 'restore')).toBe(false);
  expect(warm.find(entry => entry.detail.phase === 'code').detail.cached).toBe(true);
  expect(warm.find(entry => entry.detail.phase === 'runtime').detail.cached).toBe(true);
  expect(warm[0].detail.invocation).not.toBe(cold[0].detail.invocation);
  expect(await page.evaluate(() => window.isleDemo.metrics)).toBeUndefined();
});

test('failed execution is recorded and rolls back state', async ({ page }) => {
  await page.goto(url); await page.waitForLoadState('networkidle');
  const button = page.locator('[data-isle-root="overflow"]'), initial = await button.textContent();
  await button.click();
  await page.evaluate(() => window.isleDemo.settled());
  await expect(button).toHaveText(initial);
  const measures = await entries(page);
  expect(measures.find(entry => entry.detail.phase === 'run').detail.status).toBe('error');
  expect(measures.find(entry => entry.detail.phase === 'interaction').detail.status).toBe('error');
  expect(await page.evaluate(() => window.profileErrors)).toHaveLength(1);
});

test('disposal during a code import finishes the interaction as cancelled without restoring', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const pattern = /\/assets\/Slow\.increment-[^/]+\.js$/;
  await page.route(pattern, async route => { await gate; await route.continue(); });
  try {
    await page.goto(url); await page.waitForLoadState('networkidle');
    const requested = page.waitForRequest(pattern);
    const button = page.locator('[data-isle-root="slow"]');
    await button.click(); await requested;
    await page.evaluate(() => window.isleDemo.dispose('slow'));
    release(); await page.evaluate(() => window.isleDemo.settled());
    await expect(button).toHaveText('5');
    const measures = await entries(page);
    expect(measures.find(entry => entry.detail.phase === 'interaction').detail.status).toBe('cancelled');
    expect(measures.some(entry => ['restore', 'run'].includes(entry.detail.phase))).toBe(false);
  } finally { release(); }
});
