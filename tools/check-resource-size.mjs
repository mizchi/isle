import { mkdtemp, writeFile, readFile, readdir, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';

const describe = (file, data) => ({file,bytes:data.length,gzipBytes:gzipSync(data).length,sha256:createHash('sha256').update(data).digest('hex')});
const totals = files => ({bytes:files.reduce((n,file)=>n+file.bytes,0),gzipBytes:files.reduce((n,file)=>n+file.gzipBytes,0)});
const directory = await mkdtemp(join(tmpdir(),'isle-resource-size-'));
const report = {version:1,scope:'ES2023 production, diagnostics/profile disabled; per-file gzip totals, not network timings',variants:{},ordinaryApps:{}};
try {
  const entry=join(directory,'app.isle');
  await writeFile(entry,'client component Counter(initial:number){state n=initial;<button>on click add {n+=1;}{n}</button>}');
  await writeFile(join(directory,'index.html'),'<!doctype html><html><head></head><body><!--isle:ssr--></body></html>');
  await writeFile(join(directory,'resources.mjs'),'export function setup({owner,root}){const observer=new ResizeObserver(()=>{});owner.own(observer,value=>value.disconnect());observer.observe(root);}');
  for(const variant of ['plain','resources','ssr']) {
    const result=await build({configFile:false,root:directory,base:'./',logLevel:'silent',plugins:[isle({entry,
      mode:variant==='ssr'?'ssr':'resume',resources:variant==='plain'?{}:{Counter:'./resources.mjs'},
      diagnostics:false,profile:false,mounts:[{component:'Counter',props:{initial:1},label:'Counter'}],
    })],build:{write:false}});
    const chunks=result.output.filter(output=>output.type==='chunk');
    const files=chunks.map(chunk=>describe(chunk.fileName,Buffer.from(chunk.code)));
    report.variants[variant]={...totals(files),files};
    if(variant==='plain'&&chunks.some(chunk=>/MutationObserver|Resource owner disposed|Resource component disposed/.test(chunk.code)))throw Error('Unused resource runtime survived DCE');
    if(variant==='ssr'&&chunks.length)throw Error('SSR emitted runtime code');
  }
  const baseline=JSON.parse(await readFile('evals/results/resource-disposal/size.json','utf8'));
  for(const [name,output]of Object.entries({counter:'dist',composition:'dist-composition','schema-form':'dist-schema-form'})){
    const files=await Promise.all((await readdir(output+'/assets')).filter(file=>file.endsWith('.js')).map(async file=>describe('assets/'+file,await readFile(output+'/assets/'+file))));
    const before=totals(baseline.examples[name].files),after=totals(files);
    report.ordinaryApps[name]={deltaBytes:after.bytes-before.bytes,deltaGzipBytes:after.gzipBytes-before.gzipBytes,files};
  }
  const plain=report.variants.plain,resources=report.variants.resources;
  report.resourceDelta={bytes:resources.bytes-plain.bytes,gzipBytes:resources.gzipBytes-plain.gzipBytes};
  await mkdir('evals/results/resource-bindings',{recursive:true});
  await writeFile('evals/results/resource-bindings/size.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({resourceDelta:report.resourceDelta,ssrJavaScript:report.variants.ssr.bytes,ordinaryApps:Object.fromEntries(Object.entries(report.ordinaryApps).map(([name,entry])=>[name,{bytes:entry.deltaBytes,gzipBytes:entry.deltaGzipBytes}]))}));
} finally {await rm(directory,{recursive:true,force:true});}
