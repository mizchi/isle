import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';
import { describeChunks } from '../lib/chunks.mjs';

async function bundle({resourceSource='export function setup({owner,root}){owner.own(root,()=>{});}',...options}={}) {
  const root=await mkdtemp(join(tmpdir(),'isle-auto-'));
  try {
    const entry=join(root,'app.isle');
    await writeFile(entry,'client component Editor(){state title="";<section><input aria-label="Title" value={title}>on input edit {title=event.value;}</input><button type="button">on click clear {title="";}Clear</button><output>{title}</output></section>}');
    await writeFile(join(root,'resources.mjs'),resourceSource);
    await writeFile(join(root,'index.html'),'<html><head></head><body><!--isle:ssr--></body></html>');
    const {output}=await build({configFile:false,root,base:'./',logLevel:'silent',plugins:[isle({entry,diagnostics:false,resources:{Editor:'./resources.mjs'},mounts:[{component:'Editor',props:{},label:'Editor'}],...options})],build:{write:false}});
    return {output,html:output.find(row=>row.fileName==='index.html').source,manifest:JSON.parse(output.find(row=>row.fileName==='isle.manifest.json')?.source??'null')};
  }finally{await rm(root,{recursive:true,force:true});}
}

test('the default compiler plan preloads input dependencies without packing a click into the same chunk',async()=>{
  const {output,manifest,html}=await bundle();
  assert.deepEqual(manifest.loading.preload,['Editor.edit']);assert.deepEqual(manifest.loading.eager,[]);
  assert.notEqual(manifest.references['Editor.edit'].chunk,manifest.references['Editor.clear'].chunk);
  const initial=html.replace(/<template[\s\S]*?<\/template>/g,'');
  assert.ok(initial.includes(manifest.references['Editor.$resources'].ref[0]));
  assert.ok(!initial.includes(manifest.references['Editor.clear'].ref[0]));
  assert.ok(!/data-isle-eager/.test(html));
  assert.equal(describeChunks(manifest).find(row=>row.id==='Editor.edit').resolution.reason,'input');
  const bootstrap=output.find(row=>row.type==='chunk'&&row.facadeModuleId?.endsWith('index.html'));
  assert.doesNotMatch(bootstrap.code,/budgetGzipBytes|event-and-size|JSON\.parse/);
});

test('zero budget keeps the same handlers lazy, and explicit eager remains authoritative',async()=>{
  const lazy=await bundle({autoPreloadGzipBytes:0});
  assert.deepEqual(lazy.manifest.loading.preload,[]);
  assert.equal(lazy.manifest.resolution.decisions.find(row=>row.id==='Editor.edit').reason,'budget');
  const eager=await bundle({loading:'eager',autoPreloadGzipBytes:0});
  assert.ok(eager.manifest.loading.eager.includes('Editor.edit'));
  assert.equal(eager.manifest.resolution,undefined);
});

test('SSR never resolves configured resources or emits an automatic loading plan',async()=>{
  const {output,manifest,html}=await bundle({mode:'ssr',resources:{Editor:'./missing.mjs'}});
  assert.equal(manifest,null);assert.equal(output.filter(row=>row.type==='chunk').length,0);
  assert.doesNotMatch(html,/data-isle-|<script|modulepreload/);
});

test('automatic preload budgets reject ambiguous or invalid units',()=>{
  for(const autoPreloadGzipBytes of [-1,1.5,NaN,Infinity,'8192'])assert.throws(()=>isle({entry:'missing.isle',mounts:[],autoPreloadGzipBytes}),/budget/);
});

test('external static imports make the automatic closure cost unknown',async()=>{
  const {manifest}=await bundle({resourceSource:'import "https://cdn.example.test/opaque.mjs";export function setup(){}'});
  assert.equal(manifest.resolution.decisions.find(row=>row.id==='Editor.edit').reason,'unknown-size');
  assert.deepEqual(manifest.loading.preload,[]);
  assert.ok(Object.values(manifest.chunks).some(chunk=>chunk.externalImports?.includes('https://cdn.example.test/opaque.mjs')));
});
