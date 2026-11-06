import { test,expect } from '@playwright/test';

for(const budget of [8192,0])test(`budget ${budget}: preload is fetch-only and initialization remains per owner`,async({page})=>{
  const url=`http://127.0.0.1:${budget?4199:4200}/`;
  const manifest=await(await page.request.get(new URL('isle.manifest.json',url).href)).json();
  const ids=['Editor.edit','Editor.clear','Counter.add'],requested=[],errors=[];
  const paths=Object.fromEntries(ids.map(id=>[id,new URL(manifest.references[id].ref[0],url).pathname]));
  page.on('request',request=>requested.push(new URL(request.url()).pathname));page.on('pageerror',error=>errors.push(error.message));
  for(const id of ids)await page.route(address=>address.pathname===paths[id],async route=>{
    const response=await route.fetch();await route.fulfill({response,body:`(window.evaluatedEntries??=[]).push(${JSON.stringify(id)});\n${await response.text()}`});
  });
  await page.addInitScript(()=>{
    window.parsedScopes=[];const parse=JSON.parse;
    JSON.parse=function(...args){const value=Reflect.apply(parse,JSON,args);if(Array.isArray(value)&&value[0]===2&&value.length===4)window.parsedScopes.push(value[2]);return value;};
  });
  await page.goto(url);await page.waitForLoadState('networkidle');
  expect(requested.includes(paths['Editor.edit'])).toBe(budget>0);
  expect(requested).not.toContain(paths['Editor.clear']);expect(requested).not.toContain(paths['Counter.add']);
  expect(await page.evaluate(()=>[window.evaluatedEntries??[],window.parsedScopes,window.setupEvaluations??0,window.setupInvocations??0])).toEqual([[],[],0,0]);
  await page.locator('[data-title]').fill('typed');await expect(page.locator('[data-result]')).toHaveText('typed');
  expect(await page.evaluate(()=>[window.evaluatedEntries,window.parsedScopes,window.setupEvaluations,window.setupInvocations])).toEqual([['Editor.edit'],['page/c0'],1,1]);
  await page.locator('[data-clear]').click();await expect(page.locator('[data-result]')).toHaveText('');
  expect(await page.evaluate(()=>window.setupInvocations)).toBe(1);expect(requested).not.toContain(paths['Counter.add']);
  await page.locator('[data-editor]').evaluate(root=>root.remove());
  await expect.poll(()=>page.evaluate(()=>window.setupReleases??0)).toBe(1);
  await page.locator('[data-counter]').click();await expect(page.locator('[data-counter]')).toHaveText('1');
  expect(await page.evaluate(()=>window.loadingErrors)).toEqual([]);expect(errors).toEqual([]);
});

test('closing an entirely prefetched page never evaluates setup or restores snapshots',async({page})=>{
  await page.goto('http://127.0.0.1:4199/');await page.waitForLoadState('networkidle');
  await page.evaluate(()=>window.loadingApp.close());
  await page.locator('[data-title]').fill('closed');
  await expect(page.locator('[data-result]')).toHaveText('');
  expect(await page.evaluate(()=>[window.setupEvaluations??0,window.setupInvocations??0,window.setupReleases??0])).toEqual([0,0,0]);
});
