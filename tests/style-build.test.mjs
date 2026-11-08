import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'vite';
import {isle} from '../lib/vite.mjs';
import {planCodeLoad} from '../runtime/manifest.mjs';
import {describeChunks} from '../lib/chunks.mjs';

async function bundle({inline=false,mode='resume',widget,loading='auto',cssCodeSplit=true}={}){
  const root=await mkdtemp(join(tmpdir(),'isle-style-'));
  try{
    const entry=join(root,'app.isle');
    await writeFile(entry,'client component Counter(){state n=0;<button class="panel">on click add {n+=1;}{n}</button>}');
    await writeFile(join(root,'index.html'),'<html><head></head><body><!--isle:ssr--></body></html>');
    await writeFile(join(root,'resources.mjs'),`import ${inline?'css from ':''}'./theme.css${inline?'?inline':''}';export function setup({root}){${inline?'root.dataset.css=css;':''}}`);
    await writeFile(join(root,'theme.css'),'.panel{color:rgb(20 40 180)}');
    return(await build({configFile:false,root,base:'./',logLevel:'silent',plugins:[isle({entry,mode,widget,loading,diagnostics:false,resources:{Counter:'./resources.mjs'},mounts:[{component:'Counter',props:{},label:'Counter'}]})],build:{write:false,cssCodeSplit}})).output;
  }finally{await rm(root,{recursive:true,force:true});}
}

test('Vite CSS edges reach CodeRefs and an optional readiness gate',async()=>{
  const output=await bundle(),manifest=JSON.parse(output.find(row=>row.fileName==='isle.manifest.json').source);
  const plan=planCodeLoad(manifest,['Counter.add']);assert.equal(plan.styles.length,1);
  assert.ok(Object.values(manifest.styles)[0].gzipBytes>0);
  const row=describeChunks(manifest).find(row=>row.id==='Counter.add');
  assert.equal(row.styleGzipBytes,Object.values(manifest.styles)[0].gzipBytes);
  assert.equal(row.coldGzipBytes,Object.values(manifest.chunks).filter(chunk=>plan.modules.includes(chunk.url)).reduce((sum,chunk)=>sum+chunk.gzipBytes,0)+row.styleGzipBytes);
  const html=output.find(row=>row.fileName==='index.html').source;
  assert.match(html,/data-isle-styles="1"/);assert.match(html,/as="style"/);
  const javascript=output.filter(row=>row.type==='chunk').map(row=>row.code).join('\n');
  assert.match(javascript,/Stylesheet unavailable/);assert.doesNotMatch(javascript,/__ISLE_CSS__/);
  for(const chunk of output.filter(row=>row.type==='chunk'))
    assert.ok(!Object.keys(chunk.modules).some(id=>/css-writes|css-tree|postcss|layout\/css|resume-plan/.test(id)),'Compile-time analysis stays out of application chunks');
});

test('CSS-as-text has no stylesheet gate; SSR emits no resource CSS',async()=>{
  const inline=await bundle({inline:true});
  assert.doesNotMatch(inline.filter(row=>row.type==='chunk').map(row=>row.code).join('\n'),/Stylesheet unavailable|data-isle-styles/);
  const ssr=await bundle({mode:'ssr'});
  assert.equal(ssr.filter(row=>row.type==='chunk'||row.fileName.endsWith('.css')).length,0);
});

test('widget style metadata uses descriptor-relative paths and shared engine ABI 7',async()=>{
  const output=await bundle({loading:'preload',widget:{descriptorFile:'embed/descriptor.json',loaderFile:'embed/loader.js'}});
  const descriptor=JSON.parse(output.find(row=>row.fileName==='embed/descriptor.json').source);
  assert.match(descriptor.html,/href="\.\.\/assets\/[^\"]+\.css"/);
  assert.equal(descriptor.preloadStyles.length,1);assert.match(descriptor.preloadStyles[0],/^\.\.\/assets\/.+\.css$/);
  assert.match(output.filter(row=>row.type==='chunk').map(row=>row.code).join('\n'),/isle\/client\/7:/);
});

test('a monolithic CSS bundle is rejected for CodeRef styles instead of losing its dependency',async()=>{
  await assert.rejects(bundle({cssCodeSplit:false}),/cssCodeSplit/);
});
