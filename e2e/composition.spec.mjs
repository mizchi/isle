import { test, expect } from '@playwright/test';
import { build, preview } from 'vite';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { isle } from '../lib/vite.mjs';
import { host } from '../examples/schema-form/host.mjs';

const fixtures = [];
let publisher, publisherURL;
const source = `component Caption(value: number) { <output data-parent-value>{value}</output> }
component Card(title: string, children: RenderFragment) { <section><h1>{title}</h1>{children}</section> }
server component Note(message: string) { <p>{message}</p> }
client component Counter(initial: number) {
  state count = initial;
  <button type="button" data-counter>on click increment { count += 1; }{count}</button>
}
client component Parent(seed: number) {
  state count = seed;
  <section data-parent><button type="button" data-parent-add>on click add { count += 1; }Parent</button>
    <Caption value={count} /><Counter initial={seed} /><Counter initial={seed + 1} />
  </section>
}
client component Panel(children: RenderFragment) {
  state count = 0;
  <article data-panel><button type="button" data-panel-add>on click add { count += 1; }{count}</button>
    <output data-panel-value>{count}</output>{children}
  </article>
}
client component Minimal(seed: number) {
  state count = 0;
  <div data-minimal><button type="button" data-minimal-add>on click add { count += 1; }{count}</button>
    <Counter initial={seed} />
  </div>
}
server component Page(seed: number) {
  <Card title="Nested page"><Note message="Static server content" /><Parent seed={seed} />
    <Panel><Note message="Projected server content" /><Counter initial={seed + 10} /></Panel><Minimal seed={seed + 20} />
  </Card>
}
client component Dormant() { state count = 99; <button>on click { count += 1; }{count}</button> }
`;
test.beforeAll(async () => {
  const form = await readFile(new URL('../evals/scenarios/forms/shared.isle', import.meta.url), 'utf8');
  for (const [input, component, props, mode, widget] of [
    [source, 'Page', { seed: 5 }, 'resume'], [source, 'Page', { seed: 5 }, 'ssr'],
    [source + form + 'server component FormsPage() { <Card title="Forms"><SchemaSignup /><SchemaSignup /></Card> }', 'FormsPage', {}, 'resume'],
    [source, 'Page', { seed: 5 }, 'resume', { runtime: 'shared', tagName: 'nested-shared' }],
    [source, 'Page', { seed: 5 }, 'resume', { runtime: 'standalone', tagName: 'nested-standalone' }],
  ]) {
    const root = await mkdtemp(join(tmpdir(), 'isle-composition-')); fixtures.push({ root });
    const entry = join(root, 'app.isle'); await writeFile(entry, input);
    await writeFile(join(root, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><!--isle:ssr--></body></html>');
    await writeFile(join(root, 'main.mjs'), 'import { boot } from "virtual:isle-loader"; window.isleDemo = boot();');
    await build({ configFile: false, root, base: './', logLevel: 'silent', plugins: [isle({ entry, mode, host, widget, diagnostics: true,
      clientEntry: join(root, 'main.mjs'), mounts: [{ component, props, scopeId: 'page', label: 'Composition' }] })] });
    const server = await preview({ configFile: false, root, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: false },
      plugins: [isle({ entry, mode, host, mounts: [{ component, props, label: 'Composition' }] })] });
    Object.assign(fixtures.at(-1), { server, url: server.resolvedUrls.local[0] });
  }
  publisher = createServer((request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Nested widgets</title></head><body><div id="first"></div><div id="second"></div></body></html>'); });
  await new Promise(resolve => publisher.listen(0, '127.0.0.1', resolve)); publisherURL = `http://localhost:${publisher.address().port}/`;
});
test.afterAll(async () => { if (publisher) await new Promise(resolve => publisher.close(resolve)); for (const fixture of fixtures) { if (fixture.server) await new Promise(resolve => fixture.server.httpServer.close(resolve)); await rm(fixture.root, { recursive: true, force: true }); } });
test.beforeEach(async ({ page }) => { await page.addInitScript(() => {
  window.restored = []; const parse = JSON.parse;
  JSON.parse = function(...args) { const result = Reflect.apply(parse, JSON, args); if (Array.isArray(result) && result[0] === 2 && result.length === 4) window.restored.push(result[2]); return result; };
}); });

test('a child resumes alone, then a parent updates its own locators without touching child text', async ({ page }) => {
  const scripts = [], errors = []; page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); }); page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixtures[0].url); await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.restored)).toEqual([]);
  const parent = page.locator('[data-parent]'), counters = parent.locator('[data-counter]');
  await counters.nth(0).click(); await expect(counters.nth(0)).toHaveText('6');
  expect(await page.evaluate(() => window.restored)).toEqual([await counters.nth(0).getAttribute('data-isle-root')]);
  expect(scripts.some(url => /Parent[.-]|Panel[.-]|Dormant/.test(url))).toBe(false);
  await parent.locator('[data-parent-add]').click(); await expect(parent.locator('[data-parent-value]')).toHaveText('6');
  await expect(counters.nth(0)).toHaveText('6'); await expect(counters.nth(1)).toHaveText('6');
  const panel = page.locator('[data-panel]');
  await panel.locator('[data-panel-add]').click(); await expect(panel.locator('[data-panel-value]')).toHaveText('1');
  await expect(panel.locator('[data-panel-add]')).toHaveText('1'); await expect(panel.locator('[data-counter]')).toHaveText('15');
  await panel.locator('[data-counter]').click(); await expect(panel.locator('[data-counter]')).toHaveText('16');
  await expect(page.getByText('Projected server content', { exact: true })).toBeVisible(); expect(errors).toEqual([]);
});

test('disposing an unresumed parent cancels its descendants while sibling branches remain live', async ({ page }) => {
  await page.goto(fixtures[0].url);
  const parent = page.locator('[data-parent]'), id = await parent.getAttribute('data-isle-root');
  await page.evaluate(id => window.isleDemo.dispose(id), id);
  await parent.locator('[data-counter]').first().click(); await page.evaluate(() => window.isleDemo.settled()); await expect(parent.locator('[data-counter]').first()).toHaveText('5');
  await parent.locator('[data-parent-add]').click(); await expect(parent.locator('[data-parent-value]')).toHaveText('5');
  const other = page.locator('[data-panel] [data-counter]'); await other.click(); await expect(other).toHaveText('16');
  expect(await page.evaluate(() => window.restored)).toEqual([await other.getAttribute('data-isle-root')]);
});

test('SSR-only mode propagates through every call and projection without emitting client code', async ({ page }) => {
  const scripts = []; page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto(fixtures[1].url); await expect(page.getByText('Static server content', { exact: true })).toBeVisible();
  await expect(page.locator('[data-counter]')).toHaveCount(4); await expect(page.locator('[data-isle-snapshot], [data-isle-root]')).toHaveCount(0);
  await page.locator('[data-counter]').first().click(); await expect(page.locator('[data-counter]').first()).toHaveText('5'); expect(scripts).toEqual([]);
});

test('logical disposal includes children outside the minimized parent DOM root', async ({ page }) => {
  await page.goto(fixtures[0].url);
  const parent = page.locator('[data-minimal-add]'), child = page.locator('[data-minimal] [data-counter]');
  const id = await parent.getAttribute('data-isle-root');
  expect(await parent.evaluate((element, childId) => element.contains(document.querySelector(`[data-isle-root="${childId}"]`)), await child.getAttribute('data-isle-root'))).toBe(false);
  await page.evaluate(id => window.isleDemo.dispose(id), id);
  await child.click(); await page.evaluate(() => window.isleDemo.settled()); await expect(child).toHaveText('25');
  expect(await page.evaluate(() => window.restored)).toEqual([]);
});

test('disposing a parent during a child chunk import prevents late restoration and commit', async ({ page }) => {
  let release, requested; const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { requested = resolve; });
  await page.route(/\/Counter[.-].*\.js$/, async route => { requested(); await gate; await route.continue(); });
  try {
    await page.goto(fixtures[0].url); const parent = page.locator('[data-parent]'), child = parent.locator('[data-counter]').first();
    await child.click(); await started;
    await page.evaluate(id => window.isleDemo.dispose(id), await parent.getAttribute('data-isle-root'));
    release(); await page.evaluate(() => window.isleDemo.settled()); await expect(child).toHaveText('5');
    expect(await page.evaluate(() => window.restored)).toEqual([]);
  } finally { release(); }
});

test('nested schema form instances keep their labels, errors, submission and reset independent', async ({ page }) => {
  await page.goto(fixtures[2].url); const forms = page.getByRole('form', { name: 'Create account' }); await expect(forms).toHaveCount(2);
  const first = forms.nth(0), second = forms.nth(1);
  expect(await first.locator('[name=email]').getAttribute('id')).not.toBe(await second.locator('[name=email]').getAttribute('id'));
  await first.getByRole('button', { name: 'Create account', exact: true }).click(); await expect(first.getByRole('alert')).toBeVisible(); await expect(second.getByRole('alert')).not.toBeVisible();
  await first.locator('[name=email]').fill('nested@example.com'); await first.locator('[name=confirmation]').fill('nested@example.com'); await first.locator('[name=accepted]').check();
  await first.getByRole('button', { name: 'Create account', exact: true }).click(); await expect(first.getByRole('status')).toHaveText('Saved.'); await expect(second.locator('[name=email]')).toHaveValue('');
  await first.getByRole('button', { name: 'Reset', exact: true }).click(); await expect(first.locator('[name=email]')).toHaveValue('');
});

for (const [index, mode] of [[3, 'shared'], [4, 'standalone']]) test(`${mode} widget SDK resumes nested owners independently in two ShadowRoots`, async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message)); await page.goto(publisherURL);
  await page.evaluate(async provider => {
    const sdk = await import(new URL('widget.js', provider).href);
    window.controllers = [];
    for (const id of ['first', 'second']) window.controllers.push(await sdk.mountWidget(document.getElementById(id).attachShadow({ mode: 'open' }), new URL('widget.json', provider).href));
  }, fixtures[index].url);
  expect(await page.evaluate(() => window.restored)).toEqual([]);
  const first = page.locator('#first'), second = page.locator('#second');
  await first.locator('[data-parent] [data-counter]').first().click(); await expect(first.locator('[data-parent] [data-counter]').first()).toHaveText('6');
  await first.locator('[data-parent-add]').click(); await expect(first.locator('[data-parent-value]')).toHaveText('6');
  await expect(second.locator('[data-parent-value]')).toHaveText('5'); await expect(second.locator('[data-parent] [data-counter]').first()).toHaveText('5');
  await page.evaluate(() => window.controllers[0].close());
  await second.locator('[data-parent] [data-counter]').first().click(); await expect(second.locator('[data-parent] [data-counter]').first()).toHaveText('6');
  expect(await page.evaluate(() => Object.hasOwn(globalThis, Symbol.for('isle.runtime.registry/1')))).toBe(mode === 'shared'); expect(errors).toEqual([]);
});
