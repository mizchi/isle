import {test,expect} from '@playwright/test';
import {build} from 'vite';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isle} from '../lib/vite.mjs';

async function bundle() {
  const root=await mkdtemp(join(tmpdir(),'isle-semantic-optimizer-'));
  try {
    await writeFile(join(root,'app.isle'),await readFile(new URL('../examples/semantic-optimizer/app.isle',import.meta.url),'utf8'));
    await writeFile(join(root,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><!--isle:ssr--></body></html>');
    return (await build({configFile:false,root,base:'./',logLevel:'silent',plugins:[isle({entry:join(root,'app.isle'),diagnostics:false,profile:false,wrapMounts:false,
      mounts:[{component:'Details',scopeId:'a',props:{summary:'First preview',user:{name:'Ada',biography:'x'.repeat(65536)}}},
        {component:'Details',scopeId:'b',props:{summary:'Second preview',user:{name:'Grace',biography:'Not serialized'}}},
        {component:'Idle',scopeId:'idle',props:{}}]})],build:{write:false}})).output;
  } finally {await rm(root,{recursive:true,force:true});}
}

test('projected state resumes a one-way arm while an unobserved owner emits no code',async({page})=>{
  const output=await bundle(),assets=new Map(output.map(item=>[item.fileName,item.type==='chunk'?item.code:String(item.source)])),errors=[];
  const manifest=JSON.parse(assets.get('isle.manifest.json'));
  expect(manifest.references['Idle.increment']).toBeUndefined();
  for(const chunk of output.filter(item=>item.type==='chunk')) expect(Object.keys(chunk.modules).some(id=>/observability|record-captures/.test(id))).toBe(false);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://semantic.test/**',route=>{
    const file=new URL(route.request().url()).pathname.slice(1)||'index.html';
    return route.fulfill({status:assets.has(file)?200:404,contentType:file.endsWith('.js')?'text/javascript':'text/html',body:assets.get(file)??''});
  });
  await page.goto('https://semantic.test/');
  const a=page.locator('[data-isle-root="a"]'),b=page.locator('[data-isle-root="b"]');
  expect(await page.locator('[data-isle-snapshot]').count()).toBe(2);
  expect(JSON.parse(await page.locator('[data-isle-snapshot="a"]').textContent())[3]).toEqual(['Ada',false]);
  await expect(a.locator('[data-test="summary"]')).toHaveText('First preview');
  await expect(page.locator('[data-test="idle"]')).not.toHaveAttribute('data-isle-on-click');
  await page.locator('[data-test="idle"]').click();
  await a.locator('[data-test="open"]').click();
  await expect(a.locator('[data-test="name"]')).toHaveText('Ada');
  await expect(a.locator('[data-test="summary"]')).toHaveCount(0);
  await expect(b.locator('[data-test="summary"]')).toHaveText('Second preview');
  await a.locator('[data-test="open"]').click();await expect(a.locator('[data-test="name"]')).toHaveText('Ada');
  await b.locator('[data-test="open"]').click();await expect(b.locator('[data-test="name"]')).toHaveText('Grace');
  expect(errors).toEqual([]);
});
