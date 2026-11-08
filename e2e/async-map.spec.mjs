import {test,expect} from '@playwright/test';
import {buildMap} from '../tools/async-map-bundle.mjs';
const app=page=>page.locator('[data-map-app]');
async function activate(page){await page.goto('/');await page.getByRole('button',{name:'Start exploring'}).click();await expect(app(page)).toHaveAttribute('data-map-phase','ready');}

test('SSR paints a reserved map without starting the adapter, then resumes without layout shifts',async({page})=>{
  const requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.shifts=[];new PerformanceObserver(list=>list.getEntries().forEach(entry=>window.shifts.push(entry.value))).observe({type:'layout-shift',buffered:true});});
  await page.goto('/');await expect(page.getByRole('button',{name:'Start exploring'})).toBeVisible();
  expect(requests.some(url=>/resources-|places-.*\.json|details-.*\.json|detail-view/.test(url))).toBe(false);
  await expect(page.locator('canvas')).toHaveCount(0);const box=await page.locator('.map-panel').boundingBox();
  await page.getByRole('button',{name:'Start exploring'}).click();await expect(app(page)).toHaveAttribute('data-map-phase','ready');
  await expect(page.locator('canvas')).toBeVisible();expect(await page.locator('.place-card').count()).toBeGreaterThan(0);
  expect(await page.locator('.map-panel').boundingBox()).toEqual(box);
  expect(await page.evaluate(()=>window.shifts.reduce((sum,value)=>sum+value,0))).toBe(0);expect(errors).toEqual([]);
});

test('search and categories update results; repeated viewport searches preserve result DOM identity',async({page})=>{
  await activate(page);const first=page.locator('.place-card').first();await first.evaluate(node=>{window.originalPlace=node;});
  const published=Number(await app(page).getAttribute('data-map-published'));
  await page.getByRole('button',{name:'Reset map view'}).click();await expect.poll(async()=>Number(await app(page).getAttribute('data-map-published'))).toBeGreaterThan(published);
  expect(await first.evaluate(node=>node===window.originalPlace)).toBe(true);
  await page.getByRole('searchbox').fill('coffee');await expect(app(page)).toHaveAttribute('data-query','coffee');await expect(app(page)).toHaveAttribute('data-map-phase','ready');
  await expect(page.locator('.place-copy small').first()).toContainText('Coffee');
  await page.getByRole('searchbox').fill('');await page.getByRole('button',{name:'Parks',exact:true}).click();
  await expect(app(page)).toHaveAttribute('data-category','park');await expect(app(page)).toHaveAttribute('data-map-phase','ready');
  expect((await page.locator('.place-copy small').allTextContents()).every(text=>text.startsWith('Park'))).toBe(true);
});

test('pointer capture, wheel and keyboard move the view without a framework event per frame',async({page})=>{
  await activate(page);const canvas=page.locator('canvas'),box=await canvas.boundingBox(),before=await app(page).getAttribute('data-map-center'),issued=await app(page).getAttribute('data-map-issued');
  await app(page).evaluate(root=>{window.panDataWrites=0;window.panObserver=new MutationObserver(changes=>{window.panDataWrites+=changes.length;});window.panObserver.observe(root,{attributes:true,subtree:true,attributeFilter:['data-map-phase','aria-busy','aria-pressed']});});
  await page.mouse.move(box.x+100,box.y+100);await page.mouse.down();await page.mouse.move(box.x+260,box.y+160,{steps:12});
  await expect(app(page)).not.toHaveAttribute('data-map-center',before);await expect(app(page)).toHaveAttribute('data-map-issued',issued);
  expect(await page.evaluate(()=>window.panDataWrites)).toBe(0);await page.evaluate(()=>window.panObserver.disconnect());
  await page.mouse.up();await expect.poll(async()=>Number(await app(page).getAttribute('data-map-issued'))).toBeGreaterThan(Number(issued));
  const zoom=Number(await app(page).getAttribute('data-map-zoom'));await page.mouse.wheel(0,-200);
  await expect.poll(async()=>Number(await app(page).getAttribute('data-map-zoom'))).toBeGreaterThan(zoom);
  await canvas.focus();const moved=await app(page).getAttribute('data-map-center');await page.keyboard.press('ArrowRight');await expect(app(page)).not.toHaveAttribute('data-map-center',moved);
  await page.keyboard.press('Home');await expect(app(page)).toHaveAttribute('data-map-center','1024.0,768.0');await expect(app(page)).toHaveAttribute('data-map-zoom','1.00');
});

test('failed searches retain previous rows and retry adopts a validated response',async({page})=>{
  await activate(page);const previous=await page.locator('.place-copy strong').allTextContents();let fail=true;
  await page.route('**/*places-*.json*',route=>{if(fail){fail=false;return route.fulfill({status:503,body:'Unavailable'});}return route.continue();});
  await page.getByRole('searchbox').fill('coffee');await expect(app(page)).toHaveAttribute('data-map-phase','error');
  expect(await page.locator('.place-copy strong').allTextContents()).toEqual(previous);
  await expect(page.getByRole('status')).toContainText('503');await page.getByRole('button',{name:'Try searching again'}).click();
  await expect(app(page)).toHaveAttribute('data-map-phase','ready');await expect(page.locator('.place-copy small').first()).toContainText('Coffee');
});

test('detail data and view code fetch in parallel, and the newest selection wins while code is held',async({page})=>{
  await activate(page);let release;const held=new Promise(resolve=>{release=resolve;});let seenCode;const codeSeen=new Promise(resolve=>{seenCode=resolve;});
  await page.route('**/*detail-view-*.js',async route=>{seenCode();await held;await route.continue();});
  const names=await page.locator('.place-copy strong').allTextContents();
  const data=page.waitForRequest(r=>/details-.*\.json/.test(r.url()));await page.locator('.place-card').nth(0).click();await Promise.all([data,codeSeen]);
  await page.locator('.place-card').nth(1).click();await expect(app(page)).toHaveAttribute('data-map-detail-phase','ready');
  release();await expect(page.locator('.place-detail h3')).toHaveText(names[1]);
  await page.getByRole('button',{name:'Save this place'}).click();await expect(page.getByRole('button',{name:'Saved to your places'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Close place details'}).click();await expect(page.locator('.place-detail')).toBeHidden();
});

test('native removal aborts pending search and cleans one owner without late UI writes',async({page})=>{
  let release,seen;const held=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{seen=resolve;});
  await page.route('**/*places-*.json*',async route=>{seen();await held;await route.continue().catch(()=>{});});
  await page.goto('/');await page.getByRole('button',{name:'Start exploring'}).click();await requested;
  await page.evaluate(()=>{window.removedMap=document.querySelector('[data-map-app]');window.removedMap.remove();});
  await expect.poll(()=>page.evaluate(()=>window.removedMap.dataset.mapDisposed)).toBe('true');
  const before=await page.evaluate(()=>window.removedMap.innerHTML);release();
  expect(await page.evaluate(()=>window.removedMap.dataset.mapCleanups)).toBe('1');expect(await page.evaluate(()=>window.removedMap.innerHTML)).toBe(before);
});

test('a superseded browser search is aborted while the newest query remains interactive',async({page})=>{
  await activate(page);let release,seen;const held=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{seen=resolve;});
  await page.route('**/*places-*.json*',async route=>{if(new URL(route.request().url()).searchParams.get('query')==='coffee'){seen();await held;await route.continue().catch(()=>{});}else await route.continue();});
  await page.getByRole('searchbox').fill('coffee');await requested;
  const aborted=page.waitForEvent('requestfailed',{predicate:r=>new URL(r.url()).searchParams.get('query')==='coffee'});
  await page.getByRole('searchbox').fill('museum');await aborted;await expect(app(page)).toHaveAttribute('data-map-phase','ready');release();
  expect((await page.locator('.place-copy small').allTextContents()).every(text=>text.startsWith('Art + culture'))).toBe(true);
  await expect(app(page)).toHaveAttribute('data-query','museum');
});

test('touch pinch zooms and pointer release leaves the map usable on a narrow screen',async({page,context})=>{
  await page.setViewportSize({width:390,height:960});const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await activate(page);
  const canvas=page.locator('canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-35,y,id:1},{x:x+35,y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-80,y,id:1},{x:x+80,y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Number(await app(page).getAttribute('data-map-zoom'))).toBeGreaterThan(1);
  await expect(canvas).toHaveAttribute('data-dragging','false');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('map-mobile.png'),fullPage:true});
});

test('two maps share code but keep queries, results and disposal independent',async({page})=>{
  const output=await buildMap('resume',[{component:'Explorer',scopeId:'a',props:{},label:'A'},{component:'Explorer',scopeId:'b',props:{},label:'B'}]);
  const assets=new Map(output.map(item=>[item.fileName,item.type==='chunk'?item.code:String(item.source)]));
  await page.route('https://maps.test/**',route=>{
    const file=new URL(route.request().url()).pathname.slice(1)||'index.html';
    const contentType=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':'text/html';
    return route.fulfill({status:assets.has(file)?200:404,contentType,body:assets.get(file)??''});
  });
  await page.goto('https://maps.test/');const a=page.locator('[data-isle-root="a"]'),b=page.locator('[data-isle-root="b"]');
  await a.getByRole('button',{name:'Start exploring'}).click();await expect(a).toHaveAttribute('data-map-phase','ready');await expect(b).not.toHaveAttribute('data-map-active');
  await b.getByRole('button',{name:'Start exploring'}).click();await expect(b).toHaveAttribute('data-map-phase','ready');
  await a.getByRole('searchbox').fill('coffee');await expect(a).toHaveAttribute('data-map-phase','ready');await expect(b).toHaveAttribute('data-query','');
  const before=await b.locator('.place-card').count();await a.evaluate(node=>node.remove());
  await b.getByRole('button',{name:'Zoom in'}).click();await expect.poll(async()=>Number(await b.getAttribute('data-map-zoom'))).toBeGreaterThan(1);
  expect(before).toBeGreaterThan(0);await expect(b).not.toHaveAttribute('data-map-disposed');
});
