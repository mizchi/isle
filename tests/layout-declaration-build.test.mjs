import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'vite';
import {isle} from '../lib/vite.mjs';

async function bundle({change=s=>s,layout,wrapMounts=false}={}) {
  const root=await mkdtemp(join(tmpdir(),'isle-layout-declaration-'));
  try {
    const source=await readFile(new URL('../examples/layout-contracts/declared.isle',import.meta.url),'utf8');
    await writeFile(join(root,'app.isle'),change(source));
    await writeFile(join(root,'index.html'),'<!doctype html><html><head><meta charset="utf-8"></head><body><!--isle:ssr--></body></html>');
    return (await build({root,configFile:false,logLevel:'silent',plugins:[isle({entry:join(root,'app.isle'),mode:'ssr',mounts:[{component:'Four',props:{}}],wrapMounts,...(layout ? {layout} : {})})],build:{write:false}})).output;
  } finally {await rm(root,{recursive:true,force:true});}
}
test('a root declaration automatically enables owned CSS and a checked certificate without a sidecar',async()=>{
  const output=await bundle(),certificate=JSON.parse(output.find(o=>o.fileName==='isle.layout.json').source);
  assert.equal(certificate.status,'verified');assert.ok(certificate.declarations.length);
  assert.ok(certificate.declarations.every(p=>p.status==='verified'));
  assert.equal(output.filter(o=>o.type==='chunk'||o.fileName.endsWith('.wasm')).length,0);
});
test('declared guarantees and actual allocation cannot be bypassed by Vite viewport options',async()=>{
  await assert.rejects(bundle({change:s=>s.replace('min-inline-size: 40px','min-inline-size: 41px')}),/E_ISLE_LAYOUT/);
  await assert.rejects(bundle({layout:{viewport:{min:120,max:640,height:{min:40,max:640}}}}),/E_ISLE_LAYOUT/);
  await assert.rejects(bundle({wrapMounts:true}),/E_ISLE_LAYOUT/);
});

test('the delivered document checks nested declarations on their own native paths',async()=>{
  const child='component Cell(){layout SafeGrid{requires{inline-size:48px..640px;block-size:40px..640px;}}<div class="cell"><style>*{box-sizing:border-box;margin:0;padding:0}.cell{height:40px;min-width:40px}</style></div>}';
  await assert.rejects(bundle({change:s=>child+s.replaceAll('<div class="cell" />','<Cell />')}),/Declared layout Cell.*violated/);
  const output=await bundle({change:s=>child+s.replace('160px..640px','192px..640px').replaceAll('<div class="cell" />','<Cell />')});
  const certificate=JSON.parse(output.find(o=>o.fileName==='isle.layout.json').source);
  assert.equal(certificate.declarations.filter(p=>p.contract.component==='Cell').length,4);
  assert.ok(certificate.declarations.every(p=>p.status==='verified'));
});
