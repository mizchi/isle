import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'vite';
import {isle} from '../lib/vite.mjs';

async function bundle(source,mode='resume') {
  const root=await mkdtemp(join(tmpdir(),'isle-event-'));
  try {
    await writeFile(join(root,'app.isle'),source);
    await writeFile(join(root,'index.html'),'<html><body><!--isle:ssr--></body></html>');
    return (await build({configFile:false,root,logLevel:'silent',plugins:[isle({entry:join(root,'app.isle'),mode,diagnostics:false,loading:'lazy',cost:false,mounts:[{component:'C',props:{}}]})],build:{write:false}})).output;
  } finally {await rm(root,{recursive:true,force:true});}
}
const named='client component C(){state n=0;event add(e:EventSnapshot<MouseEvent>){n+=1;}<button on:click={add}>{n}</button>}';
test('event declarations ship the same production modules as existing entries',async()=>{
  const legacy=await bundle('client component C(){state n=0;<button>on click add {n+=1;}{n}</button>}');
  const modern=await bundle(named);
  const chunks=output=>output.filter(row=>row.type==='chunk').map(({fileName,code})=>({fileName,code})).sort((a,b)=>a.fileName.localeCompare(b.fileName));
  assert.deepEqual(chunks(modern),chunks(legacy));
  assert.doesNotMatch(chunks(modern).map(c=>c.code).join('\n'),/preventDefault|__ISLE_EVENT_POLICY__/);
});
test('synchronous cancellation is emitted only for resume builds that use it',async()=>{
  const source=named.replace('on:click=', 'on:click.preventDefault=');
  const output=await bundle(source),javascript=output.filter(c=>c.type==='chunk').map(c=>c.code).join('\n');
  assert.match(javascript,/\.preventDefault\(\)/);assert.doesNotMatch(javascript,/__ISLE_EVENT_POLICY__/);
  assert.match(output.find(c=>c.fileName==='index.html').source,/C\.add\|p/);
  const ssr=await bundle(source,'ssr');assert.equal(ssr.filter(c=>c.type==='chunk').length,0);
  assert.doesNotMatch(ssr.find(c=>c.fileName==='index.html').source,/data-isle-|on:|<script/);
});
