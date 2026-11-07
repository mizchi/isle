import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {isle} from '../lib/vite.mjs';

async function bundle({checked=false,min=160,widget=false,allInline=false,variables=false}={}) {
  const root=await mkdtemp(join(tmpdir(),'isle-inline-css-'));
  try {
    const input=await readFile(new URL(variables ? '../examples/inline-css/variables.isle' : '../examples/inline-css/app.isle',import.meta.url),'utf8');
    await writeFile(join(root,'app.isle'),variables ? input.replace('component Variables()','component Four()') : input);
    await writeFile(join(root,'index.html'),'<!doctype html><html><head><meta charset="utf-8"></head><body><!--isle:ssr--></body></html>');
    await writeFile(join(root,'base.css'),'html,body{margin:0;padding:0}');
    return (await build({configFile:false,root,logLevel:'silent',plugins:[isle({entry:join(root,'app.isle'),wrapMounts:false,mode:'ssr',mounts:[{component:'Four',props:{}}],
      ...(widget ? {widget:{}} : {}),...(checked ? {layout:{...(allInline ? {} : {css:'./base.css'}),viewport:{min,max:640,height:{min:80,max:640}}}} : {})})],build:{write:false}})).output;
  } finally {await rm(root,{recursive:true,force:true});}
}
test('production SSR owns scoped CSS without any solver or UI JavaScript',async()=>{
  const output=await bundle(),html=output.find(o=>o.fileName==='index.html').source;
  assert.match(html,/<style[^>]+data-isle-style/);assert.match(html,/min-width:40px/);
  assert.equal(output.filter(o=>o.type==='chunk' || o.fileName.endsWith('.wasm')).length,0);
});
test('checked builds merge inline CSS into the owned cascade and carry a Z3 UNSAT certificate',async()=>{
  const output=await bundle({checked:true});
  const certificate=JSON.parse(output.find(o=>o.fileName==='isle.layout.json').source);
  assert.equal(certificate.proof.status,'verified');assert.equal(certificate.proof.solver.result,'unsat');
  assert.match(output.find(o=>o.fileName==='index.html').source,/min-width:40px/);
  await assert.rejects(bundle({checked:true,min:120}),/E_ISLE_LAYOUT/);
});
test('Web Component descriptors include static owned CSS without a solver download',async()=>{
  const output=await bundle({widget:true});
  const descriptor=JSON.parse(output.find(o=>o.fileName==='widget.json').source);
  assert.match(descriptor.html,/<style data-isle-style=/);assert.match(descriptor.html,/min-width:40px/);
  assert.doesNotMatch(JSON.stringify(output),/z3-built|\.wasm/);
});
test('an entirely inline stylesheet needs no empty external CSS file for checked builds',async()=>{
  const output=await bundle({checked:true,allInline:true});
  const certificate=JSON.parse(output.find(o=>o.fileName==='isle.layout.json').source);
  assert.equal(certificate.proof.solver.result,'unsat');assert.equal(certificate.proof.status,'verified');
  assert.ok(certificate.sources.some(source=>source.file==='<inline:Four>'));
});
test('checked CSS variables remain native CSS and add no solver or application runtime',async()=>{
  const output=await bundle({checked:true,allInline:true,variables:true,min:80});
  const certificate=JSON.parse(output.find(o=>o.fileName==='isle.layout.json').source);
  assert.equal(certificate.proof.status,'verified');
  assert.match(output.find(o=>o.fileName==='index.html').source,/var\(--cell\)/);
  assert.equal(output.filter(o=>o.type==='chunk' || o.fileName.endsWith('.wasm')).length,0);
});
