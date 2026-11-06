import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { renderHostPage } from '../examples/worker-widget/host-page.mjs';
import { runtimeIdentity } from '../runtime/runtime-identity.mjs';

const widgetURL = new URL(process.env.WIDGET_URL ?? 'http://127.0.0.1:8791/').href;
const descriptorURL = new URL('widget.json', widgetURL).href;
const results = process.env.WIDGET_RESULTS ?? 'evals/results/widget-elements';
const directory = process.env.WIDGET_URL ? `${results}/remote` : results;
let publisher, publisherURL;
test.beforeAll(async () => {
  publisher = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const standalone = url.searchParams.has('standalone');
    let html = renderHostPage(standalone ? new URL('standalone/', widgetURL).href : widgetURL, { runtime: standalone ? 'standalone' : 'shared', count: url.searchParams.has('two') ? 2 : 1, loading: url.searchParams.has('lazy') ? 'lazy' : 'eager' });
    if (url.searchParams.has('lazy')) html = html.replace('<isle-widget', '<div style="height:3000px"></div><isle-widget');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(html);
  });
  await new Promise(resolve => publisher.listen(0, '127.0.0.1', resolve));
  publisherURL = `http://localhost:${publisher.address().port}/`;
});
test.afterAll(async () => { await new Promise(resolve => publisher.close(resolve)); });
function observe() {
  window.widgetShifts = []; window.widgetRestores = []; window.widgetErrors = []; window.widgetSubmits = [];
  document.addEventListener('isle:error', event => window.widgetErrors.push(event.detail));
  document.addEventListener('isle:submit', event => window.widgetSubmits.push(event.detail));
  new PerformanceObserver(list => { for (const entry of list.getEntries()) window.widgetShifts.push({ value: entry.value, recent: entry.hadRecentInput }); }).observe({ type: 'layout-shift', buffered: true });
  const parse = JSON.parse;
  JSON.parse = function (...args) { const value = Reflect.apply(parse, JSON, args);
    if (Array.isArray(value) && value[0] === 2 && value.length === 4) window.widgetRestores.push(value[2]); return value; };
}
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const geometry = page => page.evaluate(() => {
  const widget = document.querySelector('isle-widget, isle-widget-standalone').getBoundingClientRect(), after = document.querySelector('#after').getBoundingClientRect();
  return { width: widget.width, height: widget.height, widgetTop: widget.top + scrollY, afterTop: after.top + scrollY };
});
const ready = widget => expect(widget).toHaveAttribute('data-widget-status', 'ready');

for (const width of [1280, 375]) test(`custom element reserves its slot before definition, markup and code at ${width}px`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  let definition, markup, code;
  const definitions = new Promise(resolve => { definition = resolve; }), markups = new Promise(resolve => { markup = resolve; }), codes = new Promise(resolve => { code = resolve; });
  try {
    await context.addInitScript(observe);
    const page = await context.newPage(), errors = [], scripts = [], rpc = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); if (request.url().includes('/__isle/')) rpc.push(request); });
    const cdp = await context.newCDPSession(page); await cdp.send('Network.enable');
    await cdp.send('Network.setCookieControls', { enableThirdPartyCookieRestriction: true, disableThirdPartyCookieMetadata: true, disableThirdPartyCookieHeuristics: true });
    const manifest = await (await page.request.get(new URL('isle.manifest.json', widgetURL).href)).json();
    const definitionPaths = new Set();
    function definitionClosure(file) {
      const entry = manifest.chunks[file], path = new URL(entry.url, widgetURL).pathname;
      if (definitionPaths.has(path)) return;
      definitionPaths.add(path);
      for (const dependency of entry.imports) definitionClosure(dependency);
    }
    definitionClosure('widget.js');
    for (const dependency of manifest.chunks['widget.js'].dynamicImports) definitionClosure(dependency);
    await page.route(url => url.origin === new URL(widgetURL).origin && url.pathname.endsWith('.js'), async route => {
      const path = new URL(route.request().url()).pathname;
      await (definitionPaths.has(path) ? definitions : codes); await route.continue();
    });
    await page.route(descriptorURL, async route => { await markups; await route.continue(); });
    await page.goto(publisherURL, { waitUntil: 'commit' }); await page.locator('#after').waitFor(); await paint(page);
    const widget = page.locator('isle-widget'), reserved = await geometry(page);
    expect(reserved.width).toBe(Math.min(640, width - 32)); expect(reserved.height).toBe(640);
    expect(await widget.evaluate(element => element.shadowRoot)).toBeNull();
    definition(); await expect(widget).toHaveAttribute('data-widget-status', 'loading');
    expect(await geometry(page)).toEqual(reserved);
    markup(); await expect(widget.getByRole('heading', { name: 'Work planner widget', exact: true })).toBeVisible();
    await expect(widget.locator('[data-task]')).toHaveCount(64); expect(await geometry(page)).toEqual(reserved);
    expect(await page.evaluate(() => window.widgetRestores)).toEqual([]);
    code(); await ready(widget); await page.waitForLoadState('networkidle'); await paint(page);
    expect(await geometry(page)).toEqual(reserved); expect(await page.evaluate(() => window.widgetRestores)).toEqual([]);
    expect(await page.evaluate(() => window.widgetShifts.filter(entry => !entry.recent))).toEqual([]);
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: `${directory}/initial-${width}.png`, fullPage: true });
    const item = widget.locator('[data-task="task-00"]');
    await item.locator('[data-action=increment]').click(); await expect(item.locator('[data-value=hours]')).toHaveText('3');
    await item.locator('[data-action=save]').click(); await expect(item.locator('[data-value=saved]')).toHaveText('3');
    const form = widget.locator('[data-project-form]');
    await form.getByRole('button', { name: 'Create project', exact: true }).click(); await expect(form.getByRole('alert')).toBeVisible();
    await form.locator('[name=project]').fill('Widget project'); await form.locator('[name=email]').fill('owner@example.com');
    await form.locator('[name=confirmation]').fill('owner@example.com'); await form.locator('[name=accepted]').check();
    await form.getByRole('button', { name: 'Create project', exact: true }).click(); await expect(form.getByRole('status')).toHaveText('Saved.');
    expect(await page.evaluate(() => window.widgetSubmits)).toEqual([{ project: 'Widget project' }]);
    await paint(page); expect(await geometry(page)).toEqual(reserved);
    expect(await page.evaluate(() => [...new Set(window.widgetRestores)].sort())).toEqual(['project', 'task-00']);
    expect(page.frames()).toHaveLength(1); await expect(page.locator('iframe')).toHaveCount(0);
    expect(scripts.every(url => url.startsWith(widgetURL))).toBe(true); expect(rpc.length).toBeGreaterThan(0);
    for (const request of rpc) {
      const headers = await request.allHeaders(); expect(headers.origin).toBe(new URL(publisherURL).origin); expect(headers.cookie).toBeUndefined();
    }
    expect(await page.evaluate(() => window.widgetShifts.filter(entry => !entry.recent))).toEqual([]);
    expect(await page.evaluate(() => window.widgetErrors)).toEqual([]); expect(errors).toEqual([]);
    await page.screenshot({ path: `${directory}/saved-${width}.png`, fullPage: true });
    await writeFile(`${directory}/layout-${width}.json`, JSON.stringify({ widgetURL, viewport: { width, height: 1000 }, reserved, final: await geometry(page), CLS: 0, cookieRestriction: true, iframeCount: 0 }, null, 2) + '\n');
  } finally { definition(); markup(); code(); await context.close(); }
});

test('two ShadowRoots isolate state, labels, filters and publisher CSS', async ({ page }) => {
  await page.goto(`${publisherURL}?two`);
  const first = page.locator('isle-widget').nth(0), second = page.locator('isle-widget').nth(1); await ready(first); await ready(second);
  const a = first.locator('[data-task="task-00"]'), b = second.locator('[data-task="task-00"]');
  await a.locator('[data-action=increment]').click(); await expect(a.locator('[data-value=hours]')).toHaveText('3'); await expect(b.locator('[data-value=hours]')).toHaveText('2');
  await first.getByLabel('Design', { exact: true }).check(); await expect(a).not.toBeVisible(); await expect(b).toBeVisible();
  await first.getByLabel('All teams', { exact: true }).check();
  const before = await a.locator('button').first().evaluate(button => getComputedStyle(button).backgroundColor);
  await page.addStyleTag({ content: 'button { background:red!important; font-size:99px!important } input { font-size:99px!important }' });
  expect(await a.locator('button').first().evaluate(button => getComputedStyle(button).backgroundColor)).toBe(before);
  await first.getByLabel('Project name (required)', { exact: true }).fill('First');
  await expect(second.getByLabel('Project name (required)', { exact: true })).toHaveValue('');
});

test('keyboard submit, reset and validation links work inside a ShadowRoot', async ({ page }) => {
  await page.goto(publisherURL); const widget = page.locator('isle-widget'); await ready(widget);
  const item = widget.locator('[data-task="task-00"]');
  await item.locator('[data-action=increment]').press('Enter'); await expect(item.locator('[data-value=hours]')).toHaveText('3');
  await item.locator('[data-action=reset]').press('Enter'); await expect(item.locator('[data-value=hours]')).toHaveText('2');
  await item.locator('[data-action=increment]').press('Enter'); await item.locator('[data-action=save]').press('Enter'); await expect(item.locator('[data-value=saved]')).toHaveText('3');
  const form = widget.locator('[data-project-form]');
  await form.getByRole('button', { name: 'Create project', exact: true }).press('Enter');
  const link = form.getByRole('alert').getByRole('link').first(); await link.press('Enter');
  await expect(form.locator('[name=project]')).toBeFocused();
  await form.locator('[name=project]').fill('Changed'); await form.locator('[name=accepted]').check();
  await form.getByRole('button', { name: 'Reset form', exact: true }).press('Enter');
  await expect(form.locator('[name=project]')).toHaveValue(''); await expect(form.locator('[name=accepted]')).not.toBeChecked();
});

test('native fallback retains dimensions without JavaScript; provider still serves SSR', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 1000 } });
  try {
    const page = await context.newPage(); await page.goto(publisherURL);
    await expect(page.getByRole('link', { name: 'Open Work planner 1' })).toBeVisible();
    expect((await geometry(page)).height).toBe(640); expect((await geometry(page)).width).toBe(343);
    await page.goto(widgetURL); await expect(page.locator('[data-task]')).toHaveCount(64);
  } finally { await context.close(); }
});

test('unavailable descriptor keeps the reserved slot and gives an accessible error', async ({ page }) => {
  await page.addInitScript(observe);
  await page.route(descriptorURL, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto(publisherURL); const widget = page.locator('isle-widget');
  await expect(widget).toHaveAttribute('data-widget-status', 'error'); await expect(widget.getByRole('alert')).toBeVisible();
  expect((await geometry(page)).height).toBe(640); expect(await page.evaluate(() => window.widgetShifts)).toEqual([]);
});

test('lazy custom element requests no descriptor until it approaches the viewport', async ({ page }) => {
  const requests = []; page.on('request', request => { if (request.url() === descriptorURL) requests.push(request); });
  await page.goto(`${publisherURL}?lazy`); await page.waitForLoadState('networkidle');
  const widget = page.locator('isle-widget'); await expect(widget).toHaveAttribute('data-widget-status', 'idle'); expect(requests).toHaveLength(0);
  await widget.scrollIntoViewIfNeeded(); await ready(widget); expect(requests).toHaveLength(1);
});

test('removal cancels an unfinished mount; reconnect does not revive a stale request', async ({ page }) => {
  let release; const gate = new Promise(resolve => { release = resolve; }); let requests = 0;
  await page.route(descriptorURL, async route => { if (++requests === 1) await gate; await route.continue(); });
  try {
    await page.goto(`${publisherURL}?two`); const second = page.locator('isle-widget').nth(1); await ready(second);
    await page.locator('isle-widget').first().evaluate(element => { window.removedWidget = element; element.remove(); });
    release(); await paint(page);
    expect(await page.evaluate(() => window.removedWidget.shadowRoot.childNodes.length)).toBe(0);
    await page.evaluate(() => document.querySelector('#after').before(window.removedWidget));
    await ready(page.locator('isle-widget').nth(1));
    await expect(page.locator('isle-widget').nth(1).locator('[data-task]')).toHaveCount(64);
    expect(requests).toBe(3);
  } finally { release(); }
});

test('a synchronous DOM move preserves state without duplicating a loader', async ({ page }) => {
  let requests = 0; page.on('request', request => { if (request.url() === descriptorURL) requests++; });
  await page.goto(publisherURL); const widget = page.locator('isle-widget'); await ready(widget);
  const item = widget.locator('[data-task="task-00"]'); await item.locator('[data-action=increment]').click();
  await expect(item.locator('[data-value=hours]')).toHaveText('3');
  await widget.evaluate(element => element.parentNode.append(element)); await paint(page);
  await expect(item.locator('[data-value=hours]')).toHaveText('3');
  await item.locator('[data-action=increment]').click(); await expect(item.locator('[data-value=hours]')).toHaveText('4');
  expect(requests).toBe(1);
});

test('descriptor cannot redirect module imports to another provider', async ({ page }) => {
  await page.addInitScript(observe); const unexpected = [];
  page.on('request', request => { if (request.url().includes('unexpected.invalid')) unexpected.push(request.url()); });
  await page.route(descriptorURL, route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ version: 2, runtime: runtimeIdentity, html: '<p>Untrusted</p>', module: 'https://unexpected.invalid/code.js', preload: [] }) }));
  await page.goto(publisherURL); await expect(page.locator('isle-widget')).toHaveAttribute('data-widget-status', 'error');
  expect(await page.evaluate(() => window.widgetErrors)).toEqual(['Widget code must come from its provider']);
  expect(unexpected).toEqual([]);
});

test('Worker serves CORS ESM and inert SSR descriptor, and retains server validation', async ({ request }) => {
  for (const path of ['widget.js', 'widget.json']) {
    const response = await request.get(new URL(path, widgetURL).href); expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBe('*');
  }
  const descriptor = await (await request.get(descriptorURL)).json();
  expect(descriptor.version).toBe(2); expect(descriptor.runtime.mode).toBe('shared'); expect(descriptor.preload.length).toBeGreaterThan(0); expect(descriptor.html).not.toContain('<iframe');
  expect((await request.get(new URL('server/contracts.json', widgetURL).href)).status()).toBe(404);
  const origin = new URL(publisherURL).origin, url = new URL('__isle/action/savePlan', widgetURL).href;
  const preflight = await request.fetch(url, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  expect(preflight.status()).toBe(204); expect(preflight.headers()['access-control-allow-origin']).toBe('*');
  expect((await request.post(url, { headers: { origin }, data: { id: 'other', hours: 3 } })).status()).toBe(403);
  const invalid = await request.post(url, { headers: { origin }, data: { id: 'task-00', hours: -1 } });
  expect(invalid.status()).toBe(422); expect(invalid.headers()['access-control-allow-origin']).toBe('*');
  expect((await request.post(url, { headers: { origin: 'null' }, data: { id: 'task-00', hours: 3 } })).status()).toBe(403);
});

for (const width of [1280, 375]) test(`standalone mounts without a shared page pool and preserves its slot at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(observe);
  let release;
  const definitions = new Promise(resolve => { release = resolve; });
  await page.route(new URL('standalone/widget.js', widgetURL).href, async route => { await definitions; await route.continue(); });
  try {
    await page.goto(`${publisherURL}?standalone`, { waitUntil: 'commit' });
    await page.locator('#after').waitFor(); await paint(page);
    const reserved = await geometry(page), widget = page.locator('isle-widget-standalone');
    expect(reserved.width).toBe(Math.min(640, width - 32)); expect(reserved.height).toBe(640);
    expect(await widget.evaluate(element => element.shadowRoot)).toBeNull();
    release(); await ready(widget);
    expect(await page.evaluate(() => Object.hasOwn(globalThis, Symbol.for('isle.runtime.registry/1')))).toBe(false);
    const item = widget.locator('[data-task="task-00"]');
    await item.locator('[data-action=increment]').click(); await expect(item.locator('[data-value=hours]')).toHaveText('3');
    await item.locator('[data-action=save]').click(); await expect(item.locator('[data-value=saved]')).toHaveText('3');
    const form = widget.locator('[data-project-form]');
    await form.getByRole('button', { name: 'Create project', exact: true }).click(); await expect(form.getByRole('alert')).toBeVisible();
    await paint(page); expect(await geometry(page)).toEqual(reserved);
    expect(await page.evaluate(() => window.widgetShifts.filter(entry => !entry.recent))).toEqual([]);
    expect(await page.evaluate(() => window.widgetErrors)).toEqual([]);
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: `${directory}/standalone-${width}.png`, fullPage: true });
    await writeFile(`${directory}/standalone-layout-${width}.json`, JSON.stringify({ widgetURL: new URL('standalone/', widgetURL).href, viewport: { width, height: 1000 }, reserved, final: await geometry(page), CLS: 0, sharedPool: false }, null, 2) + '\n');
  } finally { release(); }
});
