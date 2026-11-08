import {test,expect} from '@playwright/test';
import {build} from 'vite';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isle} from '../lib/vite.mjs';

async function bundle(mode='resume') {
  const root=await mkdtemp(join(tmpdir(),'isle-resume-phases-'));
  try {
    await writeFile(join(root,'app.isle'),await readFile(new URL('../evals/scenarios/resume-semantics/phases.isle',import.meta.url),'utf8'));
    await writeFile(join(root,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><!--isle:ssr--></body></html>');
    const props={initial:7,heading:'Server heading',initialItems:[],panel:'Future panel',suffix:'!',errorLabel:'Unavailable',unused:'x'.repeat(65536)};
    return (await build({configFile:false,root,base:'./',logLevel:'silent',plugins:[isle({entry:join(root,'app.isle'),diagnostics:false,profile:false,mode,wrapMounts:false,
      mounts:[{component:'Phases',scopeId:'a',props},{component:'Phases',scopeId:'b',props:{...props,initial:20,panel:'Second panel'}}]})],build:{write:false}})).output;
  } finally {await rm(root,{force:true,recursive:true});}
}

test('compact phase snapshots resume new branches, rows and error fallbacks across independent mounts',async({page})=>{
  const output=await bundle(),assets=new Map(output.map(item=>[item.fileName,item.type==='chunk'?item.code:String(item.source)]));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const chunk of output.filter(item=>item.type==='chunk'))
    expect(Object.keys(chunk.modules).some(id=>/resume-plan|region-codegen|compiler-core/.test(id))).toBe(false);
  await page.route('https://phases.test/**',route=>{
    const file=new URL(route.request().url()).pathname.slice(1)||'index.html';
    return route.fulfill({status:assets.has(file)?200:404,contentType:file.endsWith('.js')?'text/javascript':'text/html',body:assets.get(file)??''});
  });
  await page.goto('https://phases.test/');
  const a=page.locator('[data-isle-root="a"]'),b=page.locator('[data-isle-root="b"]');
  const snapshot=await page.locator('[data-isle-snapshot="a"]').textContent();
  expect(JSON.parse(snapshot)[3]).toEqual(['Future panel','!','Unavailable',7,false,[]]);
  expect(snapshot).not.toContain('Server heading');expect(snapshot.length).toBeLessThan(150);
  await expect(a.locator('h1')).toHaveText('Server heading');
  await expect(a.locator('[data-test="fallback"]')).toHaveText('Unavailable');
  await a.locator('[data-test="increment"]').click();await expect(a.locator('[data-test="increment"]')).toHaveText('8');
  await a.locator('[data-test="reveal"]').click();
  await expect(a.locator('[data-test="panel"]')).toHaveText('Future panel');
  await expect(a.locator('[data-test="row"]')).toHaveText('Alpha!');
  await expect(a.locator('[data-test="first"]')).toHaveText('Alpha');
  await expect(b.locator('[data-test="panel"]')).toHaveCount(0);
  await expect(b.locator('[data-test="increment"]')).toHaveText('20');
  await a.locator('[data-test="clear"]').click();
  await expect(a.locator('[data-test="row"]')).toHaveCount(0);
  await expect(a.locator('[data-test="fallback"]')).toHaveText('Unavailable');
  await a.locator('[data-test="increment"]').click();await expect(a.locator('[data-test="increment"]')).toHaveText('9');
  await b.locator('[data-test="reveal"]').click();await expect(b.locator('[data-test="panel"]')).toHaveText('Second panel');
  expect(errors).toEqual([]);
});

test('phase analysis preserves SSR-only output without snapshots or browser code',async()=>{
  const output=await bundle('ssr'),html=output.find(item=>item.fileName==='index.html').source;
  expect(output.filter(item=>item.type==='chunk')).toHaveLength(0);
  expect(html).toContain('Server heading');expect(html).toContain('Unavailable');
  expect(html).not.toMatch(/data-isle-snapshot|data-isle-on|<!--r:/);
});
