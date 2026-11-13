import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'vite';
import {isle} from '../lib/vite.mjs';

const source=await readFile(new URL('../examples/layout-contracts/noshift.isle',import.meta.url),'utf8');
async function bundle(text=source) {
  const root=await mkdtemp(join(tmpdir(),'isle-noshift-build-'));
  try {
    await writeFile(join(root,'app.isle'),text);
    await writeFile(join(root,'index.html'),'<!doctype html><html><head><meta charset="utf-8"></head><body><!--isle:ssr--></body></html>');
    return (await build({root,configFile:false,logLevel:'silent',plugins:[isle({entry:join(root,'app.isle'),mounts:[{component:'Panel',props:{}}],wrapMounts:false})],build:{write:false}})).output;
  } finally {await rm(root,{recursive:true,force:true});}
}

test('a source noshift declaration gates the delivered document and emits proof metadata',async()=>{
  const output=await bundle(),certificate=JSON.parse(output.find(row=>row.fileName==='isle.layout.json').source);
  assert.equal(certificate.noshift.status,'verified');
  assert.deepEqual(certificate.noshift.comparisons,{planned:2,checked:2});
  assert.equal(certificate.noshift.coverage,'all-finite-cases');
});

test('noshift rejects fitting but moving layouts and unresolved selectors at build time',async()=>{
  await assert.rejects(bundle(source.replace('height:80px;display:grid','display:grid')),/E_ISLE_LAYOUT.*[\s\S]*E_NOSHIFT_BLOCK_START/);
  await assert.rejects(bundle(source.replace('noshift ".action"','noshift ".missing"')),/U_NOSHIFT_TARGET/);
  await assert.rejects(bundle(source.replace('.panel{display:grid','.panel{overflow:hidden;display:grid')),/U_NOSHIFT_GEOMETRY/);
});

test('noshift declarations add no executable HTML, JS or CSS to the application',async()=>{
  const checked=await bundle(),plain=await bundle(source.replace('noshift ".action";',''));
  const executable=output=>output.filter(row=>/\.(?:js|css|html)$/.test(row.fileName)).map(row=>[row.fileName,row.code ?? row.source]).sort(([a],[b])=>a.localeCompare(b));
  assert.deepEqual(executable(checked),executable(plain));
  assert.ok(!checked.some(row=>row.fileName.endsWith('.wasm')));
});

test('element requirements gate Vite through the same independent core with zero delivery delta',async()=>{
  const dom=source.replace('noshift ".action";','').replace('<button class="action"','<button @noshift class="action"');
  const output=await bundle(dom),plain=await bundle(dom.replace('@noshift',''));
  const certificate=JSON.parse(output.find(row=>row.fileName==='isle.layout.json').source);
  assert.equal(certificate.noshift.status,'verified');
  const executable=rows=>rows.filter(row=>/\.(?:js|css|html)$/.test(row.fileName)).map(row=>[row.fileName,row.code ?? row.source]).sort(([a],[b])=>a.localeCompare(b));
  assert.deepEqual(executable(output),executable(plain));
  await assert.rejects(bundle(dom.replace('height:80px;display:grid','display:grid')),/E_NOSHIFT_BLOCK_START/);
});

test('keyed requirements gate Vite and erase every identity inventory from delivery',async()=>{
  const source=(await readFile(new URL('../examples/layout-contracts/noshift-keys.isle',import.meta.url),'utf8')).replace('component Keyed','component Panel');
  const output=await bundle(source),plain=await bundle(source.replace(' @noshift',''));
  const certificate=JSON.parse(output.find(row=>row.fileName==='isle.layout.json').source);
  assert.equal(certificate.noshift.status,'verified');
  assert.equal(certificate.noshift.checks[0].identities.length,2);
  const executable=rows=>rows.filter(row=>/\.(?:js|css|html)$/.test(row.fileName)).map(row=>[row.fileName,row.code ?? row.source]).sort(([a],[b])=>a.localeCompare(b));
  assert.deepEqual(executable(output),executable(plain));
  await assert.rejects(bundle(source.replace('grid-column:1;grid-row:1;','').replace('grid-column:1;grid-row:2;','')),/E_NOSHIFT_BLOCK_START/);
});
