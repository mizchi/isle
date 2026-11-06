import { test, expect } from '@playwright/test';
import { build, preview } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isle } from '../lib/vite.mjs';
import { source, prefix, suffix, aliases, repeated } from '../benchmarks/static-scenario.mjs';

const fixtures = [];
test.beforeAll(async () => {
  const fixed = Array.from({ length: 40 }, (_, index) => `<p>Static item ${index}</p>`).join('');
  const decorated = source.replace('<button>', `<div><aside class="fixed">${fixed}</aside><button>`).replace('</button>', '</button></div>');
  const attributeOnly = `export client component Attr() {
    state count = 0;
    <div>on click add { count += 1; }<span title={count}>Static label</span></div>
  }`;
  for (const [input, mounts] of [[decorated, [
    { component: 'Decorated', props: { initial: 'Draft' }, scopeId: 'a', label: 'Decorated' },
    { component: 'Decorated', props: { initial: '' }, scopeId: 'b', label: 'Initially empty' },
    { component: 'Decorated', props: { initial: 'a\r\nb' }, scopeId: 'crlf', label: 'HTML normalization' },
  ]], [attributeOnly, [{ component: 'Attr', props: {}, scopeId: 'attr', label: 'Attributes' }]],
  [`${aliases}\n${repeated}`, [
    { component: 'Aliased', props: { base: 5 }, scopeId: 'alias-a', label: 'Alias A' },
    { component: 'Aliased', props: { base: 7 }, scopeId: 'alias-b', label: 'Alias B' },
    { component: 'Repeated', props: { factor: 3 }, scopeId: 'repeat', label: 'Numeric diamond' },
  ]], [`export component Label(title: string) { derive text = title + "!"; <p>{text}</p> }
    export client component Counter(initial: number) { state count = initial; <button type="button">on click increment { count += 1; }{count}</button> }`, [
    { component: 'Label', props: { title: 'Pure' }, scopeId: 'pure', label: 'Universal' },
    { component: 'Counter', props: { initial: 5 }, scopeId: 'direct-a', label: 'Direct A' },
    { component: 'Counter', props: { initial: 10 }, scopeId: 'direct-b', label: 'Direct B' },
  ]]]) {
    const root = await mkdtemp(join(tmpdir(), 'isle-static-e2e-'));
    fixtures.push({ root });
    const entry = join(root, 'app.isle');
    await writeFile(entry, input);
    await writeFile(join(root, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><!--isle:ssr--></body></html>');
    await writeFile(join(root, 'main.mjs'), 'import { boot } from "virtual:isle-loader"; window.isleDemo = boot();');
    await build({ configFile: false, root, base: './', logLevel: 'silent', plugins: [isle({ entry, mounts,
      diagnostics: true, clientEntry: join(root, 'main.mjs') })] });
    const server = await preview({ configFile: false, root, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: false } });
    Object.assign(fixtures.at(-1), { server, url: server.resolvedUrls.local[0] });
  }
});
test.afterAll(async () => {
  for (const fixture of fixtures) {
    if (fixture.server) await new Promise(resolve => fixture.server.httpServer.close(resolve));
    await rm(fixture.root, { recursive: true, force: true });
  }
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.walkRoots = []; window.bindingQueries = 0;
    const walk = document.createTreeWalker;
    document.createTreeWalker = function (root, ...args) {
      window.walkRoots.push(root.tagName); return Reflect.apply(walk, this, [root, ...args]);
    };
    const query = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function (selector) {
      if (selector.startsWith('[data-isle-binding-')) window.bindingQueries++;
      return Reflect.apply(query, this, [selector]);
    };
  });
});

test('only the changing text and its minimal DOM subtree resume', async ({ page }) => {
  await page.goto(fixtures[0].url); await page.waitForLoadState('networkidle');
  const first = page.locator('[data-isle-root="a"]'), second = page.locator('[data-isle-root="b"]');
  await expect(first).toHaveJSProperty('tagName', 'BUTTON');
  await expect(first).toHaveText(`${prefix}Draft${suffix}`);
  await expect(second).toHaveText(`${prefix}${suffix}`);
  expect(await page.evaluate(() => window.walkRoots)).toEqual([]);
  expect(await page.locator('[data-isle-snapshot="a"]').textContent()).not.toContain('catalog-');
  await page.evaluate(() => {
    window.staticChanges = 0;
    window.staticPanel = document.querySelector('.fixed');
    window.originalText = [...document.querySelector('[data-isle-root="a"]').childNodes].find(node => node.nodeType === 3);
    new MutationObserver(records => { window.staticChanges += records.length; }).observe(window.staticPanel,
      { childList: true, subtree: true, attributes: true, characterData: true });
  });
  await first.click(); await expect(first).toHaveText(`${prefix}Draft!${suffix}`);
  await second.click(); await expect(second).toHaveText(`${prefix}!${suffix}`);
  await first.click(); await expect(first).toHaveText(`${prefix}Draft!!${suffix}`);
  expect(await page.evaluate(() => window.walkRoots)).toEqual(['BUTTON', 'BUTTON']);
  expect(await page.evaluate(() => window.staticChanges)).toBe(0);
  expect(await page.evaluate(() => window.staticPanel === document.querySelector('.fixed'))).toBe(true);
  expect(await page.evaluate(() => window.originalText === [...document.querySelector('[data-isle-root="a"]').childNodes].find(node => node.nodeType === 3))).toBe(true);
  expect(await page.evaluate(() => window.isleDemo.metrics.restores)).toBe(2);
});

test('text ranges use the current DOM length after HTML newline normalization', async ({ page }) => {
  await page.goto(fixtures[0].url); await page.waitForLoadState('networkidle');
  const button = page.locator('[data-isle-root="crlf"]');
  expect(await button.textContent()).toBe(`${prefix}a\nb${suffix}`);
  await button.click(); await page.evaluate(() => window.isleDemo.settled());
  expect(await button.textContent()).toBe(`${prefix}a\r\nb!${suffix}`);
  await button.click(); await page.evaluate(() => window.isleDemo.settled());
  expect(await button.textContent()).toBe(`${prefix}a\r\nb!!${suffix}`);
});

test('attribute-only updates have no text walk and reuse the resolved attribute target', async ({ page }) => {
  await page.goto(fixtures[1].url); await page.waitForLoadState('networkidle');
  const root = page.locator('[data-isle-root="attr"]'), output = root.locator('span');
  for (let count = 1; count <= 5; count++) {
    await root.click(); await expect(output).toHaveAttribute('title', String(count));
  }
  expect(await page.evaluate(() => window.walkRoots)).toEqual([]);
  expect(await page.evaluate(() => window.bindingQueries)).toBe(1);
  await expect(output).toHaveText('Static label');
});

test('minified aliases and numeric computation caches preserve independent resumed state', async ({ page }) => {
  const scripts = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname); });
  await page.goto(fixtures[2].url); await page.waitForLoadState('networkidle');
  const a = page.locator('[data-isle-root="alias-a"]'), b = page.locator('[data-isle-root="alias-b"]');
  await a.click(); await expect(a).toHaveText('15');
  await b.click(); await expect(b).toHaveText('21');
  await a.click(); await expect(a).toHaveText('30');
  expect(scripts.filter(path => path.includes('/Aliased.add-'))).toHaveLength(1);
  const root = page.locator('[data-isle-root="repeat"]'), output = root.locator('output');
  await root.locator('button').click();
  await expect(root.locator('button')).toHaveText('107'); await expect(output).toHaveText('107'); await expect(output).toHaveAttribute('title', '107');
  await root.locator('button').click();
  await expect(root.locator('button')).toHaveText('173'); await expect(output).toHaveText('173'); await expect(output).toHaveAttribute('title', '173');
  expect(await page.evaluate(() => window.isleDemo.metrics.restores)).toBe(3);
});

test('a universal component stays inert while direct-prop client instances resume independently', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixtures[3].url); await page.waitForLoadState('networkidle');
  await expect(page.getByText('Pure!', { exact: true })).toBeVisible();
  await expect(page.locator('[data-isle-snapshot="pure"]')).toHaveCount(0);
  await expect(page.locator('[data-isle-root="pure"]')).toHaveCount(0);
  const first = page.locator('[data-isle-root="direct-a"]'), second = page.locator('[data-isle-root="direct-b"]');
  await expect(first).toHaveText('5'); await expect(second).toHaveText('10');
  await first.click(); await expect(first).toHaveText('6'); await expect(second).toHaveText('10');
  await second.click(); await expect(second).toHaveText('11'); await expect(first).toHaveText('6');
  expect(await page.evaluate(() => window.isleDemo.metrics.restores)).toBe(2);
  expect(await page.evaluate(() => window.walkRoots)).toEqual(['BUTTON', 'BUTTON']);
  expect(errors).toEqual([]);
});
