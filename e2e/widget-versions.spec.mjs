import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { runtimeIdentity } from '../runtime/runtime-identity.mjs';

const provider = 'http://127.0.0.1:8793/portable/';
let publisher, publisherURL;
test.beforeAll(async () => {
  publisher = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Runtime distributions</title></head><body><h1>Runtime distributions</h1><div id="first" style="width:320px;height:280px;overflow:auto"></div><div id="second" style="width:320px;height:280px;overflow:auto"></div><p>Following content</p></body></html>');
  });
  await new Promise(resolve => publisher.listen(0, '127.0.0.1', resolve));
  publisherURL = `http://localhost:${publisher.address().port}/`;
});
test.afterAll(async () => { await new Promise(resolve => publisher.close(resolve)); });

const urls = distribution => {
  const base = new URL(distribution ? `${distribution}/` : './', provider);
  return { sdk: new URL('sdk/counter.js', base).href, descriptor: new URL('components/counter.json', base).href };
};
async function mount(page, distribution, id = 'first') {
  return page.evaluate(async ({ sdkURL, descriptor, id }) => {
    const sdk = await import(sdkURL), host = document.getElementById(id), root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    const controller = await sdk.mountWidget(root, descriptor);
    window.mounted ??= {}; window.mounted[id] = { sdk, root, controller };
    host.dataset.ready = 'true'; return sdk.runtimeIdentity;
  }, { sdkURL: urls(distribution).sdk, descriptor: urls(distribution).descriptor, id });
}
async function importError(page, distribution) {
  return page.evaluate(async url => { try { await import(url); return 'accepted'; } catch (error) { return error.message; } }, urls(distribution).sdk);
}

for (const first of ['', 'other']) test(`shared rejects a different exact version after ${first || 'current'} without starting its vendor`, async ({ page }) => {
  const second = first ? '' : 'other', secondPrefix = new URL(second ? `${second}/assets/` : 'assets/', provider).href;
  const vendors = []; page.on('request', request => { if (request.url().startsWith(secondPrefix) && /isle-widget-(?:runtime|engine)-/.test(request.url())) vendors.push(request.url()); });
  await page.goto(publisherURL); const identity = await mount(page, first);
  expect(await importError(page, second)).toMatch(/version mismatch/); expect(vendors).toEqual([]);
  await page.locator('#first').getByRole('button', { name: '17 / 34', exact: true }).click();
  await expect(page.locator('#first').getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
  const info = await page.evaluate(() => window.mounted.first.sdk.sharedRuntimeInfo());
  expect(info.every(entry => entry.version === identity.version)).toBe(true); expect(info).toHaveLength(2);
});

test('standalone of another version coexists with shared and keeps state and ownership separate', async ({ page }) => {
  await page.goto(publisherURL); const shared = await mount(page, ''); const standalone = await mount(page, 'standalone-other', 'second');
  expect(standalone.mode).toBe('standalone'); expect(standalone.version).not.toBe(shared.version);
  expect(await page.evaluate(() => window.mounted.second.sdk.sharedRuntimeInfo())).toEqual([]);
  const first = page.locator('#first'), second = page.locator('#second');
  await second.getByRole('button', { name: '17 / 34', exact: true }).click(); await expect(second.getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
  await expect(first.getByRole('button', { name: '17 / 34', exact: true })).toBeVisible();
  expect(await page.evaluate(async descriptor => { try { await window.mounted.second.sdk.mountWidget(window.mounted.first.root, descriptor); return 'accepted'; } catch (error) { return error.message; } }, urls('standalone-other').descriptor)).toMatch(/already mounted/);
  const info = await page.evaluate(() => window.mounted.first.sdk.sharedRuntimeInfo());
  expect(info).toHaveLength(2); expect(info.every(entry => entry.version === shared.version)).toBe(true);
  await page.evaluate(() => window.mounted.second.controller.close());
  await first.getByRole('button', { name: '17 / 34', exact: true }).click(); await expect(first.getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
  const directory = process.env.WIDGET_RESULTS ?? 'evals/results/widget-elements'; await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/runtime-distributions.json`, JSON.stringify({ shared, standalone, sharedPool: info, crossModeOwnership: true, independentState: true }, null, 2) + '\n');
});

test('standalone operates without creating a page runtime pool and rejects a conflicting tag version', async ({ page }) => {
  await page.goto(publisherURL); await mount(page, 'standalone');
  expect(await page.evaluate(() => Object.hasOwn(globalThis, Symbol.for('isle.runtime.registry/1')))).toBe(false);
  expect(await importError(page, 'standalone-collision')).toMatch(/version mismatch/);
  await page.locator('#first').getByRole('button', { name: '17 / 34', exact: true }).click();
  await expect(page.locator('#first').getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
});

test('descriptor and module mismatches never attach handlers, and a failed mount releases its root', async ({ page, request }) => {
  const base = await (await request.get(urls('').descriptor)).json();
  await page.route(urls('').descriptor, route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ...base, runtime: { ...base.runtime, version: `${base.runtime.version}-wrong` } }) }));
  await page.goto(publisherURL);
  const error = await page.evaluate(async ({ sdkURL, descriptor }) => {
    const sdk = await import(sdkURL), root = document.querySelector('#first').attachShadow({ mode: 'open' }); root.innerHTML = '<p>Unchanged</p>';
    window.testRoot = root; window.testSDK = sdk;
    try { await sdk.mountWidget(root, descriptor); return 'accepted'; } catch (error) { return error.message; }
  }, { sdkURL: urls('').sdk, descriptor: urls('').descriptor });
  expect(error).toMatch(/version mismatch/); await expect(page.locator('#first').getByText('Unchanged')).toBeVisible();
  const alternate = await (await request.get(urls('standalone-other').descriptor)).json();
  await page.unroute(urls('').descriptor);
  await page.route(urls('').descriptor, route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ...base, preload: [], module: new URL(alternate.module, urls('standalone-other').descriptor).href }) }));
  const moduleError = await page.evaluate(async descriptor => { try { await window.testSDK.mountWidget(window.testRoot, descriptor); return 'accepted'; } catch (error) { return error.message; } }, urls('').descriptor);
  expect(moduleError).toMatch(/version mismatch/);
  await page.locator('#first').getByRole('button', { name: '17 / 34', exact: true }).click();
  await expect(page.locator('#first').getByRole('button', { name: '17 / 34', exact: true })).toBeVisible();
  await page.unroute(urls('').descriptor); await mount(page, '');
  await page.locator('#first').getByRole('button', { name: '17 / 34', exact: true }).click();
  await expect(page.locator('#first').getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
});

test('mode mismatch is rejected before markup changes', async ({ page }) => {
  await page.goto(publisherURL);
  const error = await page.evaluate(async ({ sdkURL, descriptor }) => {
    const sdk = await import(sdkURL), root = document.querySelector('#first').attachShadow({ mode: 'open' }); root.innerHTML = '<p>Unchanged</p>';
    try { await sdk.mountWidget(root, descriptor); return 'accepted'; } catch (error) { return error.message; }
  }, { sdkURL: urls('').sdk, descriptor: urls('standalone').descriptor });
  expect(error).toMatch(/mode mismatch/); await expect(page.locator('#first').getByText('Unchanged')).toBeVisible();
  expect(runtimeIdentity.mode).toBe('shared');
});
