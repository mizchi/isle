import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'vite';
import {isle} from '../lib/vite.mjs';
import {compile,requireIR} from '../lib/compiler.mjs';
import {prepareProgram} from '../lib/codegen.mjs';

const source=await readFile(new URL('../evals/scenarios/lexical-events/fixture.isle',import.meta.url),'utf8');
async function bundle(source,mode='resume') {
  const root=await mkdtemp(join(tmpdir(),'isle-lexical-'));
  try {
    await writeFile(join(root,'app.isle'),source);
    await writeFile(join(root,'index.html'),'<html><body><!--isle:ssr--></body></html>');
    return (await build({root,configFile:false,logLevel:'silent',plugins:[isle({entry:join(root,'app.isle'),mode,loading:'lazy',diagnostics:false,profile:false,wrapMounts:false,mounts:[{component:'Reviews',props:{}}]})],build:{write:false}})).output;
  } finally {await rm(root,{force:true,recursive:true});}
}

test('lexical projection shares the native template handler, region and production runtime code',async()=>{
  const flat=source.slice(source.indexOf('client component Reviews'));
  const native=source.slice(0,source.indexOf('component ReviewCard'))+flat.replace(
    /<ReviewCard key=\{review.id\} id=\{review.id\} title=\{review.title\} done=\{review.done\}>\s*([\s\S]*?)\s*<\/ReviewCard>/,
    '<article key={review.id} data-review={review.id}><h2>{review.title}</h2><p>{review.done ? "Done" : "Open"}</p>$1</article>');
  const projected=await bundle(source),direct=await bundle(native);
  const chunks=output=>output.filter(item=>item.type==='chunk');
  assert.equal(chunks(projected).length,chunks(direct).length);
  // Schema hashes can differ in whether a minifier quotes an object key.
  // Compare executable plans and shared runtime rather than that hash spelling.
  const plan=text=>prepareProgram(requireIR(compile(text))).get('Reviews').generate();
  assert.equal(plan(source).regions.code,plan(native).regions.code);
  assert.deepEqual(plan(source).handlers.map(h=>h.code),plan(native).handlers.map(h=>h.code));
  const runtime=output=>chunks(output).filter(c=>/\/(?:isle-resume|value)-/.test(c.fileName)).map(c=>({name:c.fileName.replace(/-[\w-]{8}\.js$/,'-HASH.js'),code:c.code.replace(/(?:["'`][0-9a-f]{16}["'`]|\b[0-9a-f]{16}\b)(?=:)/g,'SCHEMA')})).sort((a,b)=>a.name.localeCompare(b.name));
  assert.ok(runtime(projected).length, chunks(projected).map(c=>c.fileName).join(", "));
  assert.deepEqual(runtime(projected),runtime(direct));
  assert.doesNotMatch(chunks(projected).map(c=>c.code).join(''),/RenderFragment|ReviewCard|IsleLexicalScope/);
  const ssr=await bundle(source,'ssr');
  assert.equal(chunks(ssr).length,0);
  assert.doesNotMatch(ssr.find(c=>c.fileName==='index.html').source,/data-isle-|<script|<!--[rte]:/);
});
