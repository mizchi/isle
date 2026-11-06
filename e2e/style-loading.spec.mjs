import {test,expect} from '@playwright/test';
import {planCodeLoad} from '../runtime/manifest.mjs';

const panel=page=>page.locator('[data-panel="a"][data-index="1"]');
async function cssURL(page,baseURL){const manifest=await(await page.request.get('/isle.manifest.json')).json();return new URL(planCodeLoad(manifest,['A.add']).styles[0],baseURL).href;}

test('initial CSS is fetched without evaluation or application, then setup sees ready styles',async({page})=>{
  await page.goto('/');await page.waitForLoadState('networkidle');
  expect(await page.evaluate(()=>window.styleModuleEvaluations??0)).toBe(0);
  await expect(panel(page)).not.toHaveCSS('color','rgb(20, 40, 180)');
  await panel(page).getByRole('textbox').fill('styled');await expect(panel(page).locator('output')).toHaveText('styled');
  await expect(panel(page)).toHaveCSS('color','rgb(20, 40, 180)');
  expect(await page.evaluate(()=>window.styleSetups.map(setup=>setup.phase))).toEqual(['ready']);
  expect(await page.evaluate(()=>performance.getEntriesByType('measure').some(entry=>entry.detail?.phase==='styles'))).toBe(true);
});

for(const action of ['complete','dispose','remove','reparent','close'])test(`CSS barrier: ${action} never runs setup or commits early`,async({page,baseURL})=>{
  const url=await cssURL(page,baseURL);let release,began;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{began=resolve;});
  await page.route(url,async route=>{began();await gate;await route.continue();});
  try{
    await page.goto('/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.styleApp);await started;
    await panel(page).locator('[data-add]').click();
    await expect.poll(()=>page.evaluate(()=>document.head.querySelectorAll('link[rel="stylesheet"][media="not all"]').length)).toBe(1);
    expect(await page.evaluate(()=>window.styleModuleEvaluations??0)).toBe(0);
    await expect(panel(page).locator('[data-add]')).toHaveText('1');
    expect(await page.evaluate(()=>window.styleSetups?.length??0)).toBe(0);
    if(action==='dispose'){const id=await panel(page).getAttribute('data-isle-root');await page.evaluate(id=>window.styleApp.dispose(id),id);}
    if(action==='remove')await panel(page).evaluate(root=>root.remove());
    if(action==='reparent')await panel(page).evaluate(root=>{const host=document.createElement('aside');document.body.append(host);host.attachShadow({mode:'open'}).append(root);});
    if(action==='close')await page.evaluate(async()=>{window.styleApp.close();await window.styleApp.settled();});
    release();await page.evaluate(()=>window.styleApp.settled());
    expect(await page.evaluate(()=>window.styleSetups?.length??0)).toBe(action==='complete'?1:0);
    if(action!=='remove')await expect(panel(page).locator('[data-add]')).toHaveText(action==='complete'?'2':'1');
    expect(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--priority').trim())).toBe(action==='complete'?'a':'');
    expect(await page.evaluate(()=>window.styleErrors)).toEqual([]);
  }finally{release();}
});

test('explicit resource access waits for the same CSS barrier without executing a handler',async({page,baseURL})=>{
  const url=await cssURL(page,baseURL);let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route(url,async route=>{await gate;await route.continue();});
  try{
    await page.goto('/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.styleApp);
    const id=await panel(page).getAttribute('data-isle-root');
    await page.evaluate(id=>{window.resourceReady=window.styleApp.resources(id);},id);
    await expect.poll(()=>page.evaluate(()=>document.head.querySelectorAll('link[rel="stylesheet"][media="not all"]').length)).toBe(1);
    expect(await page.evaluate(()=>window.styleSetups?.length??0)).toBe(0);
    release();await page.evaluate(()=>window.resourceReady.then(()=>undefined));
    expect(await page.evaluate(()=>window.styleSetups[0].phase)).toBe('ready');
    await expect(panel(page).locator('[data-add]')).toHaveText('1');
  }finally{release();}
});

test('stylesheet failure blocks setup and can be retried',async({page,baseURL})=>{
  const url=await cssURL(page,baseURL);let fails=true;
  await page.route(url,route=>fails?route.fulfill({status:404,headers:{'cache-control':'no-store'}}):route.continue());
  await page.goto('/');await panel(page).locator('[data-add]').click();
  await expect.poll(()=>page.evaluate(()=>window.styleErrors)).toEqual(['Stylesheet unavailable']);
  expect(await page.evaluate(()=>window.styleSetups?.length??0)).toBe(0);
  fails=false;await panel(page).locator('[data-add]').click();await expect(panel(page).locator('[data-add]')).toHaveText('2');
  expect(await page.evaluate(()=>window.styleSetups[0].phase)).toBe('ready');
});

test('cascade order is stable when later entries activate first; shared CSS is linked once',async({page})=>{
  await page.goto('/');await page.locator('[data-panel="b"] [data-add]').click();
  await expect(page.locator('[data-panel="b"] [data-add]')).toHaveText('1');
  await panel(page).locator('[data-add]').click();await expect(panel(page).locator('[data-add]')).toHaveText('2');
  expect(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--priority').trim())).toBe('b');
  await page.locator('[data-panel="a"][data-index="2"] [data-add]').click();
  expect(await page.evaluate(()=>document.head.querySelectorAll('link[rel="stylesheet"]').length)).toBe(2);
});

test('widget CSS uses its descriptor base and stays inside each ShadowRoot',async({page})=>{
  test.skip(process.env.ISLE_STYLE_PLAIN==='1','This variant tests the private app engine');
  await page.goto('/');await page.evaluate(async()=>{
    await import('/embed/loader.js');history.replaceState(null,'','/consumer/deep/');
    for(const id of ['one','two']){const element=document.createElement('isle-style-widget');element.id=id;element.setAttribute('descriptor',new URL('/embed/descriptor.json',location.origin).href);element.setAttribute('width','640');element.setAttribute('height','640');document.body.append(element);}
  });
  const one=page.locator('#one'),two=page.locator('#two');await expect(one).toHaveAttribute('data-widget-status','ready');await expect(two).toHaveAttribute('data-widget-status','ready');
  await one.locator('[data-panel="a"][data-index="1"] [data-add]').click();await expect(one.locator('[data-panel="a"][data-index="1"] [data-add]')).toHaveText('2');
  await expect(one.locator('[data-panel="a"]').first()).toHaveCSS('color','rgb(20, 40, 180)');
  await expect(two.locator('[data-panel="a"]').first()).not.toHaveCSS('color','rgb(20, 40, 180)');
  await expect(page.locator('main').first().locator('[data-panel="a"]').first()).not.toHaveCSS('color','rgb(20, 40, 180)');
  await two.locator('[data-panel="a"][data-index="1"] [data-add]').click();await expect(two.locator('[data-panel="a"][data-index="1"] [data-add]')).toHaveText('2');
  await one.evaluate(root=>root.remove());await two.locator('[data-panel="a"][data-index="1"] [data-add]').click();await expect(two.locator('[data-panel="a"][data-index="1"] [data-add]')).toHaveText('3');
});

test('closing an imperative widget drains its CSS wait before the fetch completes',async({page,baseURL})=>{
  test.skip(process.env.ISLE_STYLE_PLAIN==='1','This variant tests the private app engine');
  const url=await cssURL(page,baseURL);let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route(url,async route=>{await gate;await route.continue().catch(()=>{});});
  try{
    await page.goto('/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.styleApp);
    await page.evaluate(async()=>{
      const {mountWidget}=await import('/embed/loader.js');
      const host=document.createElement('aside');host.id='imperative';host.attachShadow({mode:'open'});document.body.append(host);
      window.widgetMount=await mountWidget(host.shadowRoot,new URL('/embed/descriptor.json',location.origin).href);
    });
    await page.locator('#imperative [data-panel="a"][data-index="1"] [data-add]').click();
    await expect(page.locator('#imperative link[rel="stylesheet"][media="not all"]')).toHaveCount(1);
    await page.evaluate(async()=>{window.widgetMount.close();document.querySelector('#imperative').remove();await window.widgetMount.settled();});
    expect(await page.evaluate(()=>window.styleSetups?.length??0)).toBe(0);
    release();
  }finally{release();}
});

test('eager document styles prepare before module evaluation while setup stays dormant',async({page})=>{
  test.skip(process.env.ISLE_STYLE_PLAIN==='1','Eager fixture runs with the shared variant');
  const base='http://127.0.0.1:4213/',manifest=await(await page.request.get(base+'isle.manifest.json')).json();
  const style=new URL(planCodeLoad(manifest,['A.add']).styles[0],base).href;
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route(style,async route=>{await gate;await route.continue();});
  try{
    const code=page.waitForResponse(new URL(manifest.references['A.$resources'].ref[0],base).href);
    await page.goto(base,{waitUntil:'commit'});await(await code).finished();
    expect(await page.evaluate(()=>window.styleModuleEvaluations??0)).toBe(0);
    release();await page.waitForLoadState('networkidle');
    expect(await page.evaluate(()=>window.styleModuleEvaluations)).toBe(1);
    expect(await page.evaluate(()=>window.styleSetups?.length??0)).toBe(0);
    await expect(panel(page)).toHaveCSS('color','rgb(20, 40, 180)');
  }finally{release();}
});

test('eager widget prepares its own CSS before ready without resuming its components',async({page})=>{
  test.skip(process.env.ISLE_STYLE_PLAIN==='1','Eager fixture runs with the shared variant');
  await page.goto('http://127.0.0.1:4213/');
  await page.evaluate(async()=>{
    await import('/embed/loader.js');const root=document.createElement('isle-style-widget');root.id='eager';root.setAttribute('descriptor',new URL('/embed/descriptor.json',location.origin).href);root.setAttribute('width','640');root.setAttribute('height','640');document.body.append(root);
  });
  const root=page.locator('#eager');await expect(root).toHaveAttribute('data-widget-status','ready');
  await expect(root.locator('[data-panel="a"]').first()).toHaveCSS('color','rgb(20, 40, 180)');
  expect(await page.evaluate(()=>window.styleSetups?.length??0)).toBe(0);
  await root.locator('[data-panel="b"] [data-add]').click();await expect(root.locator('[data-panel="b"] [data-add]')).toHaveText('1');
  await root.locator('[data-panel="a"][data-index="1"] [data-add]').click();await expect(root.locator('[data-panel="a"][data-index="1"] [data-add]')).toHaveText('2');
});

test('another provider shares the engine while applying CSS only in its widget root',async({page})=>{
  test.skip(process.env.ISLE_STYLE_PLAIN==='1','Cross-provider fixture runs with the shared variant');
  await page.goto('/');await page.evaluate(async()=>{
    window.otherSDK=await import('http://127.0.0.1:4213/embed/loader.js');
    const root=document.createElement('isle-style-widget');root.id='cross-origin';root.setAttribute('descriptor','http://127.0.0.1:4213/embed/descriptor.json');root.setAttribute('width','640');root.setAttribute('height','640');document.body.append(root);
  });
  const root=page.locator('#cross-origin');await expect(root).toHaveAttribute('data-widget-status','ready');
  await expect(root.locator('[data-panel="a"]').first()).toHaveCSS('color','rgb(20, 40, 180)');
  await expect(page.locator('main').first().locator('[data-panel="a"][data-index="1"]')).not.toHaveCSS('color','rgb(20, 40, 180)');
  await root.locator('[data-panel="a"][data-index="1"] [data-add]').click();await expect(root.locator('[data-panel="a"][data-index="1"] [data-add]')).toHaveText('2');
  expect(await page.evaluate(()=>window.otherSDK.sharedRuntimeInfo().filter(entry=>entry.abi.startsWith('isle/client/')).length)).toBe(1);
});

test('abort during a mount import releases the old CSS gate before a new provider mounts',async({page})=>{
  test.skip(process.env.ISLE_STYLE_PLAIN==='1','Cross-provider fixture runs with the shared variant');
  const base='http://127.0.0.1:4211/embed/descriptor.json',descriptor=await(await page.request.get(base)).json();
  let release,began;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{began=resolve;});
  await page.route(new URL(descriptor.module,base).href,async route=>{began();await gate;await route.continue().catch(()=>{});});
  try{
    await page.goto('/');await page.evaluate(async()=>{
      const {mountWidget}=await import('/embed/loader.js');window.mountForCSS=mountWidget;
      const host=document.createElement('aside');host.id='reusable';host.attachShadow({mode:'open'});document.body.append(host);
      window.oldAbort=new AbortController();window.oldMount=mountWidget(host.shadowRoot,new URL('/embed/descriptor.json',location.origin).href,{signal:window.oldAbort.signal}).catch(()=>undefined);
    });
    await started;
    await page.evaluate(async()=>{window.oldAbort.abort();window.newMount=await window.mountForCSS(document.querySelector('#reusable').shadowRoot,'http://127.0.0.1:4213/embed/descriptor.json');});
    await expect(page.locator('#reusable [data-panel="a"]').first()).toHaveCSS('color','rgb(20, 40, 180)');
    release();await page.evaluate(()=>window.oldMount.then(()=>undefined));
    await page.locator('#reusable [data-panel="a"][data-index="1"] [data-add]').click();await expect(page.locator('#reusable [data-panel="a"][data-index="1"] [data-add]')).toHaveText('2');
  }finally{release();}
});
