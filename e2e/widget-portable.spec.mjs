import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { renderWidgetEmbed } from '../lib/widget.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const provider = 'http://127.0.0.1:8793/portable/';
const mirror = 'http://127.0.0.1:8795/portable/';
const worker = process.env.WIDGET_MIXED_URL ?? 'http://127.0.0.1:8791/';
let publisher, publisherURL;
test.beforeAll(async () => {
  publisher = createServer((request, response) => {
    const mode = new URL(request.url, 'http://localhost').searchParams.get('mode');
    const descriptor = new URL(mode === 'static' ? 'static/components/static.json' : 'components/counter.json', provider).href;
    const loader = new URL(mode === 'static' ? 'static/sdk/static.js' : 'sdk/counter.js', provider).href;
    const second = mode === 'mixed' ? worker : mirror;
    const shared = mode === 'shared' || mode === 'mixed';
    const sharedBody = `<div id="first" style="width:320px;height:280px;overflow:auto"></div><div id="second" style="width:640px;max-width:100%;height:640px;overflow:auto"></div><script type="module">
      const firstSource = ${JSON.stringify(new URL('components/counter.json', provider).href)};
      const secondSource = ${JSON.stringify(new URL(mode === 'mixed' ? 'widget.json' : 'components/counter.json', second).href)};
      const firstRoot = document.querySelector('#first').attachShadow({mode:'open'});
      const secondRoot = document.querySelector('#second').attachShadow({mode:'open'});
      const firstSDK = ${JSON.stringify(new URL('sdk/counter.js?copy=first', provider).href)};
      const secondSDK = ${JSON.stringify(new URL(mode === 'mixed' ? 'widget.js?copy=second' : 'sdk/counter.js?copy=second', second).href)};
      if (${JSON.stringify(mode)} === 'mixed') {
        window.firstSDK = await import(firstSDK);
        window.firstController = await window.firstSDK.mountWidget(firstRoot, firstSource);
        window.secondSDK = await import(secondSDK);
        window.secondController = await window.secondSDK.mountWidget(secondRoot, secondSource);
      } else {
        [window.firstSDK, window.secondSDK] = await Promise.all([import(firstSDK), import(secondSDK)]);
        [window.firstController, window.secondController] = await Promise.all([
          window.firstSDK.mountWidget(firstRoot, firstSource), window.secondSDK.mountWidget(secondRoot, secondSource)]);
      }
      window.mountFirstFromSecond = () => window.secondSDK.mountWidget(firstRoot, firstSource);
      document.body.dataset.sharedReady = 'true';
      </script>`;
    const body = shared ? sharedBody : mode === 'imperative' ? `<div id="manual" style="width:320px;height:280px;overflow:auto"></div><script type="module">
      import { mountWidget } from ${JSON.stringify(loader)};
      const root = document.querySelector('#manual').attachShadow({mode:'open'});
      window.mountPortable = () => mountWidget(root, ${JSON.stringify(descriptor)});
      window.widgetController = await window.mountPortable();
      document.querySelector('#manual').dataset.ready = 'true';
      </script>` : renderWidgetEmbed({ descriptorURL: descriptor, loaderURL: loader, tagName: mode === 'static' ? 'static-counter' : 'demo-counter', href: provider,
      width: 320, height: 280, title: 'Counter widget', loading: 'eager' });
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Portable publisher</title></head><body><h1>Portable publisher</h1>${body}<p id="after">Following content</p></body></html>`);
  });
  await new Promise(resolve => publisher.listen(0, '127.0.0.1', resolve));
  publisherURL = `http://localhost:${publisher.address().port}/`;
});
test.afterAll(async () => { await new Promise(resolve => publisher.close(resolve)); });

test('another app and tag work under an arbitrary descriptor, loader and RPC subpath without Workers', async ({ page }) => {
  const errors = [], rpc = []; page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/actions/')) rpc.push(request); });
  await page.goto(publisherURL);
  const widget = page.locator('demo-counter'); await expect(widget).toHaveAttribute('data-widget-status', 'ready');
  await expect(widget.getByRole('heading', { name: 'Portable counter', exact: true })).toBeVisible();
  const counter = widget.getByRole('button', { name: '17 / 34', exact: true }); await counter.press('Enter');
  await expect(widget.getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
  await widget.getByRole('button', { name: 'Draft', exact: true }).click();
  await expect(widget.getByRole('button', { name: 'Draft!', exact: true })).toBeVisible();
  expect(rpc.length).toBeGreaterThan(0);
  for (const request of rpc) {
    expect(new URL(request.url()).pathname).toBe('/portable/api/actions/action/renameDocument');
    const headers = await request.allHeaders(); expect(headers.origin).toBe(new URL(publisherURL).origin); expect(headers.cookie).toBeUndefined();
  }
  await expect(page.locator('iframe')).toHaveCount(0); expect(errors).toEqual([]);
});

test('imperative mount uses the same descriptor and exposes deterministic disposal', async ({ page }) => {
  await page.goto(`${publisherURL}?mode=imperative`);
  const root = page.locator('#manual'); await expect(root).toHaveAttribute('data-ready', 'true');
  await root.getByRole('button', { name: '17 / 34', exact: true }).click();
  await expect(root.getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => { try { await window.mountPortable(); return 'accepted'; } catch (error) { return error.message; } })).toMatch(/already mounted/);
  await page.evaluate(() => window.widgetController.close());
  await root.getByRole('button', { name: '18 / 36', exact: true }).click();
  await page.evaluate(() => window.widgetController.settled());
  await expect(root.getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
  await page.evaluate(async () => { window.widgetController = await window.mountPortable(); });
  await expect(root.getByRole('button', { name: '17 / 34', exact: true })).toBeVisible();
  await expect(page.locator('demo-counter')).toHaveCount(0);
});

test('static descriptor renders without UI runtime, handlers or module preloads', async ({ page }) => {
  const scripts = []; page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto(`${publisherURL}?mode=static`);
  const widget = page.locator('static-counter'); await expect(widget).toHaveAttribute('data-widget-status', 'ready');
  await expect(widget.getByText('This widget has no UI runtime or handler chunks.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(scripts).toContain(new URL('static/sdk/static.js', provider).href);
  expect(scripts.some(url => /isle-widget-runtime-/.test(url))).toBe(true);
  expect(scripts.some(url => /isle-widget-engine-|isle-handler|isle-resume/.test(url))).toBe(false);
  await expect(widget.locator('[data-isle-root],[data-isle-snapshot]')).toHaveCount(0);
  await expect(page.locator('link[rel=modulepreload]')).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
});

async function instrumentRuntime(page) {
  const urls = { transport: new Set(), client: new Set() };
  await page.route(url => /\/isle-widget-(runtime|engine)-[^/]+\.js$/.test(url.pathname), async route => {
    const url = route.request().url(), kind = url.includes('isle-widget-runtime-') ? 'transport' : 'client';
    urls[kind].add(url);
    const response = await route.fetch();
    await route.fulfill({ response, body: `globalThis.runtimeEvaluations ??= {}; globalThis.runtimeEvaluations.${kind} = (globalThis.runtimeEvaluations.${kind} ?? 0) + 1;\n${await response.text()}` });
  });
  return urls;
}

test('SDKs from two origins race but initialize one runtime and share root ownership', async ({ page }) => {
  const urls = await instrumentRuntime(page), errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${publisherURL}?mode=shared`); await expect(page.locator('body')).toHaveAttribute('data-shared-ready', 'true');
  expect(await page.evaluate(() => window.firstSDK.mountWidget === window.secondSDK.mountWidget)).toBe(true);
  expect(await page.evaluate(() => window.runtimeEvaluations)).toEqual({ transport: 1, client: 1 });
  expect(urls.transport.size).toBe(1); expect(urls.client.size).toBe(1);
  const first = page.locator('#first'), second = page.locator('#second');
  await first.getByRole('button', { name: '17 / 34', exact: true }).click();
  await expect(first.getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
  await expect(second.getByRole('button', { name: '17 / 34', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => { try { await window.mountFirstFromSecond(); return 'accepted'; } catch (error) { return error.message; } })).toMatch(/already mounted/);
  await page.evaluate(async () => { window.firstController.close(); window.firstController = await window.mountFirstFromSecond(); });
  await expect(first.getByRole('button', { name: '17 / 34', exact: true })).toBeVisible();
  await second.getByRole('button', { name: 'Draft', exact: true }).click(); await expect(second.getByRole('button', { name: 'Draft!', exact: true })).toBeVisible();
  const directory = process.env.WIDGET_RESULTS ?? 'evals/results/widget-elements'; await mkdir(directory, { recursive: true });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({ path: `${directory}/shared-widgets-${width}.png`, fullPage: true });
  }
  await page.evaluate(async ({ provider, mirror }) => {
    const group = document.createElement('section'); group.id = 'batch'; document.body.append(group);
    window.batchControllers = await Promise.all(Array.from({ length: 12 }, (_, index) => {
      const host = document.createElement('div'); host.className = 'batch-widget'; host.style.cssText = 'width:320px;height:280px;overflow:auto'; group.append(host);
      const sdk = index % 2 ? window.secondSDK : window.firstSDK;
      return sdk.mountWidget(host.attachShadow({ mode: 'open' }), new URL('components/counter.json', index % 2 ? mirror : provider).href);
    }));
  }, { provider, mirror });
  const batch = page.locator('.batch-widget'); await expect(batch).toHaveCount(12);
  await batch.last().getByRole('button', { name: '17 / 34', exact: true }).click();
  await expect(batch.last().getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
  await expect(batch.first().getByRole('button', { name: '17 / 34', exact: true })).toBeVisible();
  await page.evaluate(() => window.batchControllers.forEach(controller => controller.close()));
  expect(await page.evaluate(() => window.runtimeEvaluations)).toEqual({ transport: 1, client: 1 });
  const info = await page.evaluate(() => window.firstSDK.sharedRuntimeInfo());
  expect(info).toHaveLength(2); expect(info.every(entry => entry.status === 'ready')).toBe(true); expect(errors).toEqual([]);
  await writeFile(`${directory}/shared-runtime.json`, JSON.stringify({ runtimes: info, evaluations: await page.evaluate(() => window.runtimeEvaluations), transportURLs: [...urls.transport], clientURLs: [...urls.client], roots: 14, independentRoots: true, crossSDKOwnership: true }, null, 2) + '\n');
});

test('a small widget initializes first, then a different build reuses its full engine for forms', async ({ page }) => {
  const urls = await instrumentRuntime(page), errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${publisherURL}?mode=mixed`); await expect(page.locator('body')).toHaveAttribute('data-shared-ready', 'true');
  expect([...urls.client]).toHaveLength(1); expect([...urls.client][0]).toMatch(/^http:\/\/127\.0\.0\.1:8793\/portable\//);
  expect(await page.evaluate(() => window.runtimeEvaluations)).toEqual({ transport: 1, client: 1 });
  const form = page.locator('#second').locator('[data-project-form]');
  await form.getByRole('button', { name: 'Create project', exact: true }).click(); await expect(form.getByRole('alert')).toBeVisible();
  await form.locator('[name=project]').fill('Shared runtime'); await form.locator('[name=email]').fill('owner@example.com');
  await form.locator('[name=confirmation]').fill('owner@example.com'); await form.locator('[name=accepted]').check();
  await form.getByRole('button', { name: 'Create project', exact: true }).click(); await expect(form.getByRole('status')).toHaveText('Saved.');
  await page.locator('#first').getByRole('button', { name: 'Draft', exact: true }).click();
  await expect(page.locator('#first').getByRole('button', { name: 'Draft!', exact: true })).toBeVisible();
  await page.evaluate(() => window.secondController.close());
  await page.locator('#first').getByRole('button', { name: '17 / 34', exact: true }).click();
  await expect(page.locator('#first').getByRole('button', { name: '18 / 36', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.runtimeEvaluations)).toEqual({ transport: 1, client: 1 }); expect(errors).toEqual([]);
  const directory = process.env.WIDGET_RESULTS ?? 'evals/results/widget-elements'; await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${worker.startsWith('https:') ? 'mixed-remote-runtime' : 'mixed-runtime'}.json`, JSON.stringify({ worker, runtimes: await page.evaluate(() => window.firstSDK.sharedRuntimeInfo()), evaluations: await page.evaluate(() => window.runtimeEvaluations), transportURLs: [...urls.transport], clientURLs: [...urls.client], formSaved: true, separateRPCOrigins: true }, null, 2) + '\n');
});
