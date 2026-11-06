import {mkdtemp,writeFile,readFile,readdir,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {build} from 'vite';
import {isle} from '../lib/vite.mjs';

const describe=(file,data)=>({file,bytes:data.length,gzipBytes:gzipSync(data).length,sha256:createHash('sha256').update(data).digest('hex')});
const totals=files=>({bytes:files.reduce((sum,file)=>sum+file.bytes,0),gzipBytes:files.reduce((sum,file)=>sum+file.gzipBytes,0)});
const root=await mkdtemp(join(tmpdir(),'isle-style-size-'));
const report={version:1,scope:'ES2023 production with diagnostics/profile disabled; per-file gzip, not network timings',variants:{},ordinaryApps:{}};
try{
  const entry=join(root,'app.isle');
  await writeFile(entry,'client component Counter(){state n=0;<button class="counter">on click add {n+=1;}{n}</button>}');
  await writeFile(join(root,'index.html'),'<html><head></head><body><!--isle:ssr--></body></html>');
  await writeFile(join(root,'theme.css'),'.counter{color:rgb(20 40 180)}');
  for(const variant of ['without-css','with-css','ssr']){
    await writeFile(join(root,'resources.mjs'),`${variant==='without-css'?'':"import './theme.css';"}export function setup(){}`);
    const {output}=await build({configFile:false,root,base:'./',logLevel:'silent',plugins:[isle({entry,mode:variant==='ssr'?'ssr':'resume',diagnostics:false,profile:false,resources:{Counter:'./resources.mjs'},mounts:[{component:'Counter',props:{},label:'Counter'}]})],build:{write:false}});
    const javascript=output.filter(row=>row.type==='chunk').map(row=>describe(row.fileName,Buffer.from(row.code)));
    const css=output.filter(row=>row.type==='asset'&&row.fileName.endsWith('.css')).map(row=>describe(row.fileName,Buffer.from(row.source)));
    report.variants[variant]={javascript:{...totals(javascript),files:javascript},css:{...totals(css),files:css}};
    if(variant==='without-css'&&output.some(row=>row.type==='chunk'&&/Stylesheet unavailable|isle\.style\.gate/.test(row.code)))throw Error('Unused stylesheet gate survived DCE');
    if(variant==='ssr'&&(javascript.length||css.length))throw Error('SSR emitted CodeRef assets');
  }
  const baseline=JSON.parse(await readFile('evals/results/resolution-loading/size.json'));
  for(const [name,directory]of Object.entries({counter:'dist',composition:'dist-composition','schema-form':'dist-schema-form'})){
    const files=await Promise.all((await readdir(directory+'/assets')).filter(file=>file.endsWith('.js')).map(async file=>describe('assets/'+file,await readFile(directory+'/assets/'+file))));
    files.sort((a,b)=>a.file.localeCompare(b.file));
    const before=baseline.examples[name].files.toSorted((a,b)=>a.file.localeCompare(b.file));
    const previous=totals(before),current=totals(files);
    report.ordinaryApps[name]={identicalJavaScript:JSON.stringify(before)===JSON.stringify(files),deltaBytes:current.bytes-previous.bytes,deltaGzipBytes:current.gzipBytes-previous.gzipBytes,files};
    if(!report.ordinaryApps[name].identicalJavaScript)throw Error('Unexpected JavaScript change without CodeRef CSS: '+name);
  }
  report.cssGateDelta={bytes:report.variants['with-css'].javascript.bytes-report.variants['without-css'].javascript.bytes,gzipBytes:report.variants['with-css'].javascript.gzipBytes-report.variants['without-css'].javascript.gzipBytes};
  await mkdir('evals/results/style-resolution',{recursive:true});
  await writeFile('evals/results/style-resolution/size.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({cssGateDelta:report.cssGateDelta,ordinaryApps:Object.fromEntries(Object.entries(report.ordinaryApps).map(([key,value])=>[key,{bytes:value.deltaBytes,gzip:value.deltaGzipBytes}])),ssrJavaScript:report.variants.ssr.javascript.bytes,ssrCSS:report.variants.ssr.css.bytes}));
}finally{await rm(root,{recursive:true,force:true});}
