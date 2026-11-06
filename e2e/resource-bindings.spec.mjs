import { test, expect } from '@playwright/test';

test('manual resource access shares setup with resume and close invalidates every scope before cleanup',async({page})=>{
  await page.goto('/');
  const id=await page.locator('[data-counter="1"]').getAttribute('data-isle-root');
  await page.evaluate(async id=>{
    const owner=await window.resourceApp.resources(id);
    window.sameResourceOwner=owner===await window.resourceApp.resources(id);
    const childId=document.querySelector('[data-counter="1"] [data-child]').getAttribute('data-isle-root');
    const child=await window.resourceApp.resources(childId);
    owner.own(null,()=>{if(!child.disposed)throw Error('child was still live');throw Error('cleanup failed');});
  },id);
  expect(await page.evaluate(()=>window.sameResourceOwner)).toBe(true);
  await page.locator('[data-add="1"]').click();await expect(page.locator('[data-count="1"]')).toHaveText('2');
  expect(await page.evaluate(()=>window.resourceProbe.contexts.length)).toBe(2);
  await page.evaluate(()=>window.resourceApp.close());await page.evaluate(()=>window.resourceApp.settled());
  expect(await page.evaluate(()=>window.resourceProbe.released.length)).toBe(4);
  expect(await page.evaluate(()=>window.resourceErrors)).toEqual(['cleanup failed']);
  expect(await page.evaluate(async id=>{try{await window.resourceApp.resources(id);return false;}catch{return true;}},id)).toBe(true);
});

test('setup and handler fetch in parallel; removal while code loads prevents initialization',async({page,baseURL})=>{
  const manifest=await (await page.request.get('/isle.manifest.json')).json();
  const resource=manifest.references['Counter.$resources'].ref[0],handler=manifest.references['Counter.add'].ref[0];
  let release, began;
  const barrier=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{began=resolve;});
  let handlerRequested=false;
  await page.route(new URL(handler,baseURL).href,route=>{handlerRequested=true;return route.continue();});
  await page.route(new URL(resource,baseURL).href,async route=>{began();await barrier;await route.continue();});
  await page.goto('/');await page.locator('[data-add="1"]').click();await started;
  await expect.poll(()=>handlerRequested).toBe(true);
  await page.locator('[data-counter="1"]').evaluate(root=>root.remove());release();
  await page.evaluate(()=>window.resourceApp.settled());
  expect(await page.evaluate(()=>window.resourceProbe?.contexts.length??0)).toBe(0);
});

test('setup is lazy, runs once per resumed component and closes automatically on native removal',async({page})=>{
  await page.goto('/');
  expect(await page.evaluate(()=>window.resourceModuleLoads??0)).toBe(0);
  await page.locator('[data-add="1"]').click();
  await expect(page.locator('[data-count="1"]')).toHaveText('2');
  await page.locator('[data-add="1"]').click();
  await expect(page.locator('[data-count="1"]')).toHaveText('3');
  const phases=await page.evaluate(()=>performance.getEntriesByType('measure').filter(entry=>entry.detail?.handlerId==='Counter.add').map(entry=>entry.detail.phase));
  expect(phases).toContain('resource-code');expect(phases).toContain('resource-setup');
  expect(phases.filter(phase=>phase==='resource-setup')).toHaveLength(1);
  expect(phases.filter(phase=>phase==='restore')).toHaveLength(1);
  expect(await page.evaluate(()=>window.resourceProbe.contexts.length)).toBe(1);
  await page.locator('[data-counter="1"]').evaluate(root=>{ window.removedResourceRoot=root;root.dispatchEvent(new Event('resource:ping'));root.remove(); });
  await expect.poll(()=>page.evaluate(()=>window.resourceProbe.released.length)).toBe(2);
  expect(await page.evaluate(()=>window.resourceProbe.contexts[0].owner.disposed)).toBe(true);
  await page.evaluate(()=>window.removedResourceRoot.dispatchEvent(new Event('resource:ping')));
  expect(await page.evaluate(()=>window.resourceProbe.hits.length)).toBe(1);
  await page.evaluate(()=>window.resourceApp.close());
  expect(await page.evaluate(()=>window.resourceProbe.released.length)).toBe(2);
});

test('unmount during acquisition aborts it and frees an ignored-abort late value',async({page})=>{
  await page.goto('/'); await page.locator('[data-add="2"]').click();
  await expect(page.locator('[data-count="2"]')).toHaveText('3');
  const key=await page.locator('[data-counter="2"]').getAttribute('data-resource-key');
  await page.locator('[data-counter="2"]').evaluate(root=>root.remove());
  await expect.poll(()=>page.evaluate(key=>window.resourceProbe.aborted.includes(key),key)).toBe(true);
  await page.evaluate(key=>window.resourceProbe.pending[key](key+':late'),key);
  await page.evaluate(()=>window.resourceApp.settled());
  expect(await page.evaluate(()=>window.resourceProbe.released.filter(x=>x.endsWith(':late')).length)).toBe(1);
  expect(await page.evaluate(()=>window.resourceProbe.contexts[0].handles.every(h=>h.state==='disposed'))).toBe(true);
});

test('child-first resume preserves parent laziness; parent disposal invalidates the whole subtree',async({page})=>{
  await page.goto('/'); const root=page.locator('[data-counter="1"]');
  await root.locator('[data-child]').click(); await expect(root.locator('[data-child]')).toHaveText('1');
  expect(await page.evaluate(()=>window.resourceProbe.contexts.length)).toBe(1);
  expect(await page.evaluate(()=>window.resourceProbe.contexts[0].root.hasAttribute('data-counter'))).toBe(false);
  await root.locator('[data-add]').click(); await expect(root.locator('[data-count]')).toHaveText('2');
  const id=await root.getAttribute('data-isle-root');
  await page.evaluate(id=>window.resourceApp.dispose(id),id); await page.evaluate(()=>window.resourceApp.settled());
  expect(await page.evaluate(()=>window.resourceProbe.contexts.every(c=>c.owner.disposed))).toBe(true);
  expect(await page.evaluate(()=>window.resourceProbe.released.length)).toBe(4);
});

test('a synchronous DOM move retains the same resources and state',async({page})=>{
  await page.goto('/');await page.locator('[data-add="1"]').click();await expect(page.locator('[data-count="1"]')).toHaveText('2');
  await page.locator('[data-counter="1"]').evaluate(root=>{root.remove();document.body.append(root);});
  await page.evaluate(()=>window.resourceApp.settled());
  expect(await page.evaluate(()=>window.resourceProbe.released.length)).toBe(0);
  await page.locator('[data-add="1"]').click();await expect(page.locator('[data-count="1"]')).toHaveText('3');
  expect(await page.evaluate(()=>window.resourceProbe.contexts.length)).toBe(1);
});

test('setup failure releases partial acquisitions and does not execute the handler',async({page})=>{
  await page.goto('/');await page.locator('[data-broken]').click();
  await expect.poll(()=>page.evaluate(()=>window.resourceErrors)).toEqual(['setup failed']);
  await page.evaluate(()=>window.resourceApp.settled());
  await expect(page.locator('[data-broken]')).toHaveText('0');
  expect(await page.evaluate(()=>window.resourceProbe.released.length)).toBe(2);
});

test('widget disconnect closes only its own resource owners and preserves another mount',async({page})=>{
  test.skip(process.env.ISLE_RESOURCE_PLAIN === '1','This build exercises the app runtime without the widget SDK');
  await page.goto('/');await page.evaluate(async()=>{
    await import('/resource-widget-loader.js');
    for(const id of ['widget-a','widget-b']){const element=document.createElement('isle-resource-widget');element.id=id;element.setAttribute('descriptor',new URL('/resource-widget.json',location.href).href);element.setAttribute('width','640');element.setAttribute('height','640');document.body.append(element);}
  });
  const a=page.locator('#widget-a'),b=page.locator('#widget-b');
  await expect(a).toHaveAttribute('data-widget-status','ready');await expect(b).toHaveAttribute('data-widget-status','ready');
  await a.locator('[data-add="1"]').click();await expect(a.locator('[data-count="1"]')).toHaveText('2');
  await b.locator('[data-add="1"]').click();await expect(b.locator('[data-count="1"]')).toHaveText('2');
  await a.evaluate(element=>element.remove());
  await expect.poll(()=>page.evaluate(()=>window.resourceProbe.contexts.filter(c=>c.key.startsWith('widget-a:')).every(c=>c.owner.disposed))).toBe(true);
  expect(await page.evaluate(()=>window.resourceProbe.contexts.filter(c=>c.key.startsWith('widget-b:')).every(c=>!c.owner.disposed))).toBe(true);
  await b.locator('[data-add="1"]').click();await expect(b.locator('[data-count="1"]')).toHaveText('3');
});
