import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { isle } from '../lib/vite.mjs';

const rational = value => { const [n,d=1] = value.split('/').map(Number); return n/d; };
const at = (value,width,height) => rational(value.coefficient)*width+rational(value.heightCoefficient ?? '0')*height+rational(value.constant);
const includes = (range,value) => value >= range.min && value <= range.max && (value !== range.min || range.minInclusive) && (value !== range.max || range.maxInclusive);
const output = await build({configFile:'examples/responsive-checked/vite.config.mjs',logLevel:'silent',build:{write:false}});
const assets = new Map(output.output.map(item => [item.fileName,item.type === 'chunk' ? item.code : String(item.source)]));
const certificate = JSON.parse(assets.get('isle.layout.json'));
async function serve(page,assets) {
  await page.route('https://checked.test/**',route => {
    const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    return route.fulfill({status:assets.has(file) ? 200 : 404,contentType:file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/json',body:assets.get(file) ?? ''});
  });
}

test('checked production document agrees with symbolic two-axis sizes and paints without JS or shifts', async ({page}) => {
  const samples = [], scripts = [], errors = [];
  expect(certificate.document.sha256).toBe(createHash('sha256').update(assets.get('index.html')).digest('hex'));
  page.on('request',request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  page.on('pageerror',error => errors.push(error.message));
  await serve(page,assets);
  await page.addInitScript(() => {
    window.shifts = [];
    new PerformanceObserver(list => window.shifts.push(...list.getEntries().map(entry => entry.value))).observe({type:'layout-shift',buffered:true});
  });
  await mkdir('.responsive-checked/screenshots',{recursive:true});
  for (const width of [320,375,639,640,641,1280]) for (const height of [240,400,900]) {
    await page.setViewportSize({width,height});
    await page.goto('https://checked.test/');
    await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.evaluate(() => {
      const rect = node => { const r=node.getBoundingClientRect();return {width:r.width,height:r.height}; };
      return {boxes:Object.fromEntries(['html','body','.board','.title','.tiles','.tile','.note'].map(selector => [selector,[...document.querySelectorAll(selector)].map(rect)])),
        shifts:window.shifts,overflowX:document.documentElement.scrollWidth>innerWidth,overflowY:document.documentElement.scrollHeight>innerHeight,
        css:getComputedStyle(document.querySelector('.tile')).boxSizing};
    });
    expect(geometry.css).toBe('border-box');
    for (const size of certificate.report.sizes.filter(row => includes(row.range,width) && includes(row.heightRange,height))) {
      const selector = size.box.startsWith('html@') ? 'html' : size.box.startsWith('body@') ? 'body' : size.box;
      for (const box of geometry.boxes[selector]) {
        expect(Math.abs(box.width-at(size.inlineSize,width,height)),`${width}/${height}/${selector}/width`).toBeLessThan(.04);
        expect(Math.abs(box.height-at(size.blockSize,width,height)),`${width}/${height}/${selector}/height`).toBeLessThan(.04);
      }
    }
    expect(geometry.shifts).toEqual([]); expect(geometry.overflowX).toBe(false); expect(geometry.overflowY).toBe(false);
    samples.push({width,height,...geometry});
    if (height === 900 && [375,1280].includes(width)) await page.screenshot({path:`.responsive-checked/screenshots/${width}.png`,fullPage:true});
  }
  expect(scripts).toEqual([]); expect(errors).toEqual([]);
  await mkdir('evals/results/layout-build',{recursive:true});
  await writeFile('evals/results/layout-build/full.json.gz',gzipSync(JSON.stringify({certificate,samples})));
  await writeFile('evals/results/layout-build/latest.json',JSON.stringify({status:certificate.status,scope:certificate.report.scope,sampleCount:samples.length,
    payload:{html:Buffer.byteLength(assets.get('index.html')),htmlGzip:gzipSync(assets.get('index.html'),{level:6}).length,javascript:0,reportFetched:false},scripts,errors,samples},null,2)+'\n');
});

test('a checked nested client resumes independently and stays inside the declared boxes', async ({page}) => {
  const directory = await mkdtemp(join(tmpdir(),'isle-checked-client-'));
  try {
    await Promise.all([
      writeFile(join(directory,'app.isle'),`client component Cell() { state n = 0; <a class="counter" href="#">on click { n = n < 3 ? n + 1 : 0; }{n}</a> }
        export client component Pair() { <main class="row"><Cell/><Cell/></main> }`),
      writeFile(join(directory,'app.css'),'*{margin:0;box-sizing:border-box}html{font:16px/20px system-ui}.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr)}'),
      writeFile(join(directory,'index.html'),'<!doctype html><html><head></head><body><!--isle:ssr--></body></html>'),
      writeFile(join(directory,'package.json'),'{"type":"module"}'),
    ]);
    const result = await build({root:directory,configFile:false,base:'./',logLevel:'silent',build:{write:false},plugins:[isle({
      entry:join(directory,'app.isle'),mounts:[{component:'Pair',props:{}}],wrapMounts:false,
      layout:{css:'./app.css',viewport:{min:320,max:800,height:{min:240,max:600}},boxes:{'.counter':{minInlineSize:40,minBlockSize:20}}},
    })]});
    const files = new Map(result.output.map(item => [item.fileName,item.type === 'chunk' ? item.code : String(item.source)]));
    expect(JSON.parse(files.get('isle.layout.json')).status).toBe('verified');
    const scripts = [], errors = [];
    page.on('request',request => { if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname); });
    page.on('pageerror',error => errors.push(error.message));
    await serve(page,files); await page.setViewportSize({width:320,height:240}); await page.goto('https://checked.test/');
    const initialScripts = [...scripts];
    const first = page.locator('.counter').first(), second = page.locator('.counter').last();
    await expect(first).toHaveText('0'); await expect(second).toHaveText('0');
    for (const n of ['1','2','3','0']) { await first.click(); await expect(first).toHaveText(n); await expect(second).toHaveText('0'); }
    await second.focus(); await page.keyboard.press('Enter'); await expect(second).toHaveText('1'); await expect(first).toHaveText('0');
    const boxes = await page.locator('.counter').evaluateAll(nodes => nodes.map(node => ({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,overflow:node.scrollWidth>node.clientWidth || node.scrollHeight>node.clientHeight})));
    expect(boxes).toEqual([{width:160,height:240,overflow:false},{width:160,height:240,overflow:false}]);
    expect(initialScripts).toHaveLength(1); expect(scripts.length).toBeGreaterThan(initialScripts.length); expect(errors).toEqual([]);
    await writeFile('evals/results/layout-build/client.json',JSON.stringify({status:'verified',initialScripts,scripts,errors,boxes,independentResume:true,boundedValues:[0,1,2,3]},null,2)+'\n');
  } finally { await rm(directory,{recursive:true,force:true}); }
});
