import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { liveExampleIds, siteExamples } from '../config.mjs';
import {readFile} from 'node:fs/promises';
import {compile,requireIR} from '../../lib/compiler.mjs';
import {prepareProgram} from '../../lib/codegen.mjs';
import {analyzeLayout} from '../../lib/layout.mjs';
import {verifyLayoutReport} from '../../lib/layout-z3-node.mjs';
import {styleTags} from '../../lib/styles.mjs';

test.beforeAll(() => mkdir('test-results/site', { recursive: true }));

test('static hosting isolates only the playground and preserves unsaved editors through Z3 initialization',async({page})=>{
  await page.goto('./playground/');
  await expect(page.getByRole('status')).toContainText('Ready');
  expect(await page.evaluate(()=>crossOriginIsolated)).toBe(false);
  await page.locator('#auto').uncheck();
  const source=await readFile(new URL('../../examples/inline-css/app.isle',import.meta.url),'utf8')+'\n// Unsaved CSS experiment\n';
  await page.locator('#source').fill(source);await page.locator('#props').fill('{}');
  await page.locator('#css').fill('html,body {margin:0;padding:0} /* kept across reload */');
  await page.locator('#mode').selectOption('ssr');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#verify-layout').check();
  await expect(page.locator('#layout-status')).toContainText('Verified',{timeout:45000});
  expect(await page.evaluate(()=>crossOriginIsolated)).toBe(true);
  await expect(page.locator('#source')).toHaveValue(source);
  await expect(page.locator('#css')).toHaveValue(/kept across reload/);
  await expect(page.locator('#auto')).not.toBeChecked();await expect(page.locator('#mode')).toHaveValue('ssr');
  expect(await page.locator('#preview').getAttribute('srcdoc')).not.toMatch(/<script|data-isle-(root|on|snapshot)/);
  const scopes=await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.scope).pathname));
  expect(scopes.every(scope=>scope.endsWith('/playground/'))).toBe(true);
  await page.goto('./docs/quick-start.html');expect(await page.evaluate(()=>crossOriginIsolated)).toBe(false);
});

test('a Z3 overflow witness reproduces in Chromium and the fixed domain fits',async({page})=>{
  const source=await readFile(new URL('../../examples/inline-css/app.isle',import.meta.url),'utf8'),ir=requireIR(compile(source));
  const report=analyzeLayout(ir,{css:'',viewport:{min:120,max:640,height:{min:80,max:640}}}),proof=await verifyLayoutReport(report);
  expect(proof.status).toBe('violated');
  const width=Math.floor(proof.witness.viewport);expect(width).toBeGreaterThanOrEqual(120);expect(width).toBeLessThan(160);
  const rendered=prepareProgram(ir).render('Four',{}, {mode:'ssr'});
  const html='<!doctype html><style>html,body{margin:0;padding:0}</style>'+styleTags(rendered.styles)+rendered.html;
  const overlapping=()=>page.locator('.cell').evaluateAll(nodes=>nodes.some((node,index)=>index && nodes[index-1].getBoundingClientRect().right>node.getBoundingClientRect().left+.01));
  await page.setViewportSize({width,height:200});await page.setContent(html);expect(await overlapping()).toBe(true);
  await page.setViewportSize({width:160,height:200});expect(await overlapping()).toBe(false);
});

test('the playground compiles and resumes on the deployed project subpath',async({page})=>{
  await page.goto('./');await page.getByRole('link',{name:'Playground',exact:true}).click();
  await expect(page).toHaveURL(/\/playground\/$/);
  await expect(page.getByRole('status')).toContainText('Ready');
  const frame=page.frameLocator('#preview');await expect(frame.locator('output')).toHaveText('5 / 10');
  await frame.getByRole('button',{name:'Increment',exact:true}).click();
  await expect(frame.locator('output')).toHaveText('6 / 12');
  await page.locator('#preset').selectOption('list');await expect(frame.locator('li')).toHaveCount(2);
  await page.locator('#preset').selectOption('events');
  await expect(frame.getByRole('button',{name:'Cancel default'})).toBeVisible();
  expect(await frame.getByRole('button',{name:'Cancel default'}).evaluate(button=>!button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})))).toBe(true);
  await expect(frame.locator('[data-clicks]')).toHaveText('1');
  await page.locator('#source').fill('component C(){<main>@if(true){<p>Removed</p>}</main>}');
  await expect(page.getByRole('status')).toContainText('Compile error');
  await expect(page.locator('#diagnostics')).toContainText('E_CONTROL_REMOVED');
  await page.getByRole('link',{name:'Docs',exact:true}).click();
  await expect(page).toHaveURL(/\/docs\/quick-start.html$/);
});

test('the Isle landing page resumes its SSR counter and switches language', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('[data-hero-count]')).toHaveText('5');
  await page.getByRole('button', { name: 'Increment counter' }).click();
  await expect(page.locator('[data-hero-count]')).toHaveText('6');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('[data-hero-count]')).toHaveText('5');
  await page.getByRole('link', { name: '日本語', exact: true }).click();
  await expect(page).toHaveURL(/\/ja\/$/);
  await expect(page.locator('h1')).toContainText('まず HTML。');
  await page.getByRole('button', { name: 'カウンターを増やす' }).click();
  await expect(page.locator('[data-hero-count]')).toHaveText('6');
  expect(errors).toEqual([]);
});

for (const route of ['', 'ja/', 'examples/', 'ja/examples/', 'docs/quick-start.html', 'ja/docs/forms.html']) {
  test(`responsive page: ${route || 'home'}`, async ({ page }) => {
    for (const width of [1440, 768, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('./' + route);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/site/${route.replaceAll('/', '-').replaceAll('.', '-') || 'home'}-${width}.png`, fullPage: true });
    }
  });
}

test('the gallery labels server-only examples and opens a working static demo', async ({ page }) => {
  await page.goto('./examples/');
  await expect(page.locator('.example-card')).toHaveCount(siteExamples.length);
  const card = page.locator('.example-card').filter({ has: page.getByRole('heading', { name: 'Shared schema and server validation' }) });
  await expect(card).toContainText('Requires a server');
  await expect(card.getByRole('link', { name: 'Open demo' })).toHaveCount(0);
  await page.goto('./demos/hello/');
  await page.getByRole('button', { name: 'Increment', exact: true }).click();
  await expect(page.locator('output')).toHaveText('6 / 12');
});

for (const id of liveExampleIds) {
  test(`static Pages export loads without failed requests: ${id}`, async ({ page }) => {
    const errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
    await page.goto('./demos/' + id + '/');
    await expect(page.locator('h1')).toBeVisible();
    if (id === 'todomvc') {
      await page.getByRole('textbox', { name: 'New todo', exact: true }).fill('Try Pages');
      await page.getByRole('textbox', { name: 'New todo', exact: true }).press('Enter');
      await expect(page.locator('.todo-title')).toHaveText('Try Pages');
    }
    if (id === 'loading') {
      await page.getByLabel('Search query').fill('Pages');
      await expect(page.locator('output')).toHaveText('Pages');
      await expect(page.locator('[data-search]')).toHaveAttribute('data-setup', 'ready');
    }
    if (id === 'styles') {
      await page.getByRole('button', { name: 'Activate style' }).click();
      await expect(page.locator('.lazy-card')).toHaveAttribute('data-style-at-setup', 'ready');
    }
    if (id === 'navigation') { await page.getByRole('link', { name: 'Next page', exact: true }).click(); await expect(page.locator('h1')).toHaveText('Destination page'); }
    expect(errors).toEqual([]); expect(failed).toEqual([]);
  });
}

test('two static-host Web Components share a runtime and keep independent state', async ({ page }) => {
  await page.goto('./demos/portable-widget/');
  const a = page.locator('#widget-a'), b = page.locator('#widget-b');
  await expect(a).toHaveAttribute('data-widget-status', 'ready');
  await expect(b).toHaveAttribute('data-widget-status', 'ready');
  await a.getByRole('button', { name: 'Increment', exact: true }).click();
  await expect(a.locator('output')).toHaveText('6 / 12');
  await expect(b.locator('output')).toHaveText('5 / 10');
  const info = await page.evaluate(async () => (await import(new URL('widget.js', location.href).href)).sharedRuntimeInfo());
  expect(info.filter(entry => entry.abi === 'isle/widget/3')).toHaveLength(1);
});

test('guides stay static and the preview archive is downloadable', async ({ page, request }) => {
  await page.goto('./docs/quick-start.html');
  await expect(page.locator('script[type="module"]')).toHaveCount(0);
  await expect(page.getByText("import { isle } from '@isle/prototype/vite';", { exact: false })).toBeVisible();
  const archive = await request.get('./downloads/isle-prototype-0.0.1.tgz');
  expect(archive.status()).toBe(200); expect((await archive.body()).length).toBeGreaterThan(100000);
  await page.goto('./reports/layout.html');
  await expect(page.locator('.report-title h2')).toHaveText(['verified', 'violated', 'unknown']);
});

test('example source disclosures open with readable code', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('./examples/resources/');
  const source = page.locator('details.source-details').filter({ has: page.getByText('app.isle', { exact: true }) });
  await source.locator('summary').click();
  await expect(source.locator('pre')).toBeVisible();
  await expect(source.locator('code')).toContainText('client component Session');
  await source.screenshot({ path: 'test-results/site/source-open.png' });
});
