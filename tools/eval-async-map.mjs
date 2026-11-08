import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright';
import {buildMap} from './async-map-bundle.mjs';
import {compile} from '../lib/compiler.mjs';

const output=await buildMap(),ssr=await buildMap('ssr'),assets=new Map(output.map(item=>[item.fileName,item.type==='chunk'?Buffer.from(item.code):Buffer.from(item.source)]));
const chunks=new Map(output.filter(item=>item.type==='chunk').map(item=>[item.fileName,item.code]));
const types={js:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml',html:'text/html'};
const server=createServer((request,response)=>{
  const file=new URL(request.url,'http://localhost').pathname.slice(1)||'index.html',body=assets.get(file);
  response.writeHead(body?200:404,{'Content-Type':types[file.split('.').at(-1)]??'application/octet-stream','Cache-Control':'no-store'});response.end(body??'Not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch();
function sizes(files){const unique=[...new Set(files)].filter(file=>chunks.has(file));return {files:unique,raw:unique.reduce((sum,file)=>sum+Buffer.byteLength(chunks.get(file)),0),gzip:unique.reduce((sum,file)=>sum+gzipSync(chunks.get(file),{level:6}).length,0)};}
function initialPayload(paths){const files=[...new Set(paths.map(path=>path.slice(1)||'index.html'))].filter(file=>assets.has(file));return {files,raw:files.reduce((sum,file)=>sum+assets.get(file).length,0),gzip:files.reduce((sum,file)=>sum+gzipSync(assets.get(file),{level:6}).length,0)};}
try {
  const page=await browser.newPage({viewport:{width:1440,height:960}}),requests=[],errors=[];
  page.on('request',request=>requests.push(request.url()));page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.mapAudit={shifts:[],clicked:0,ready:0,trackPan:false,dataWrites:0};
    new PerformanceObserver(list=>list.getEntries().forEach(entry=>window.mapAudit.shifts.push(entry.value))).observe({type:'layout-shift',buffered:true});
    document.addEventListener('click',event=>{if(event.target.closest('[data-isle-on-click]')?.textContent.includes('Start exploring'))window.mapAudit.clicked=performance.now();},true);
    new MutationObserver(changes=>{if(window.mapAudit.clicked&&!window.mapAudit.ready&&document.querySelector('[data-map-phase="ready"]'))window.mapAudit.ready=performance.now();if(window.mapAudit.trackPan)window.mapAudit.dataWrites+=changes.filter(change=>['data-map-phase','aria-busy','aria-pressed'].includes(change.attributeName)).length;}).observe(document,{attributes:true,subtree:true});
  });
  const scripts=()=>requests.filter(url=>new URL(url).pathname.endsWith('.js')).map(url=>new URL(url).pathname.slice(1));
  await page.goto(origin);await page.getByRole('button',{name:'Start exploring'}).waitFor();
  const initial=sizes(scripts()),initialRequests=[...requests].map(url=>new URL(url).pathname),initialCLS=await page.evaluate(()=>window.mapAudit.shifts.reduce((sum,value)=>sum+value,0));
  assert.equal(requests.some(url=>/places-.*\.json|resources-|detail-view/.test(url)),false);
  await page.getByRole('button',{name:'Start exploring'}).click();
  await page.locator('[data-map-phase="ready"]').waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const active=sizes(scripts()),ready=await page.evaluate(()=>({clickToDataReadyMs:window.mapAudit.ready-window.mapAudit.clicked,cls:window.mapAudit.shifts.reduce((sum,value)=>sum+value,0)}));
  const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  const before=await page.locator('[data-map-app]').evaluate(root=>({draws:Number(root.dataset.mapDraws),requests:Number(root.dataset.mapIssued)})),box=await page.locator('canvas').boundingBox();
  await page.evaluate(()=>{window.mapAudit.trackPan=true;});
  await page.mouse.move(box.x+100,box.y+100);await page.mouse.down();await page.mouse.move(box.x+210,box.y+150,{steps:24});
  const during=Number(await page.locator('[data-map-app]').getAttribute('data-map-issued'));assert.equal(during,before.requests);
  const dataWrites=await page.evaluate(()=>{window.mapAudit.trackPan=false;return window.mapAudit.dataWrites;});assert.equal(dataWrites,0);
  await page.mouse.up();await page.waitForFunction(n=>{const root=document.querySelector('[data-map-app]');return root.dataset.mapPhase==='ready'&&Number(root.dataset.mapIssued)>n;},before.requests);
  const after=await page.locator('[data-map-app]').evaluate(root=>({draws:Number(root.dataset.mapDraws),requests:Number(root.dataset.mapIssued)})),afterPan=sizes(scripts());
  assert.deepEqual(afterPan.files,active.files);
  const selectionRows=await page.locator('.place-card').count();
  await page.evaluate(()=>{window.mapAudit.rowDataReads=0;const get=Element.prototype.getAttribute;window.mapAudit.restoreReads=()=>{Element.prototype.getAttribute=get;};Element.prototype.getAttribute=function(name){if(name==='data-place'&&this.matches('.place-card'))window.mapAudit.rowDataReads++;return get.call(this,name);};});
  await page.locator('.place-card').first().click();await page.locator('.place-detail h3').waitFor();await page.locator('.detail-save').waitFor();
  const selection=await page.evaluate(rows=>{window.mapAudit.restoreReads();return {rows,unchangedRowAttributeReads:window.mapAudit.rowDataReads};},selectionRows);
  const detail=sizes(scripts()),profile=(await cdp.send('Profiler.stop')).profile;
  const nodes=new Map(profile.nodes.map(node=>[node.id,node])),parents=new Map();profile.nodes.forEach(node=>node.children?.forEach(id=>parents.set(id,node.id)));
  const cpu=new Map();let idle=0;
  profile.samples?.forEach((id,index)=>{
    const leaf=nodes.get(id);if(leaf.callFrame.functionName==='(idle)'){idle+=(profile.timeDeltas[index]??0)/1000;return;}
    let node=leaf;while(!node.callFrame.url&&parents.has(node.id))node=nodes.get(parents.get(node.id));
    const source=node.callFrame.url.startsWith(origin)?new URL(node.callFrame.url).pathname.split('/').at(-1):'Other JS/native';
    cpu.set(source,(cpu.get(source)??0)+(profile.timeDeltas[index]??0)/1000);
  });
  const html=assets.get('index.html').toString(),snapshot=/<script[^>]*data-isle-snapshot[^>]*>([^<]+)<\/script>/.exec(html)?.[1];
  const logicFiles=['model.mjs','transport.mjs','renderer.mjs','setup.mjs','detail-view.mjs'],sourceLines={};
  for(const file of ['app.isle',...logicFiles])sourceLines[file]=(await readFile(new URL('../examples/async-map/'+file,import.meta.url),'utf8')).trimEnd().split('\n').length;
  const authored=await readFile(new URL('../examples/async-map/app.isle',import.meta.url),'utf8'),deriveCase=compile(authored.replace('state categories:','derive categories:'));
  const report={version:1,generatedAt:new Date().toISOString(),conditions:{viewport:{width:1440,height:960},dataLatencyMs:180,places:36,
    interpretation:'One controlled local diagnostic; not a framework speed comparison. CPU sampling is a separate pan/detail phase after the initial timing. gzip is summed per emitted file, not measured HTTP transfer.'},
    build:{htmlBytes:Buffer.byteLength(html),snapshotJsonBytes:Buffer.byteLength(snapshot??''),allJavaScript:sizes([...chunks.keys()]),initialJavaScript:initial,afterActivateJavaScript:active,afterDetailsJavaScript:detail,
      ssrJavaScriptFiles:ssr.filter(item=>item.type==='chunk').length,ssrHasSnapshot:/data-isle-snapshot/.test(ssr.find(item=>item.fileName==='index.html').source)},
    browser:{initialRequests,initialPayload:initialPayload(initialRequests),initialRawCLS:initialCLS,rawCLSAfterResume:ready.cls,clickToDataReadyMs:ready.clickToDataReadyMs,
      pan:{pointerMoves:24,draws:after.draws-before.draws,unrelatedDOMAttributeWrites:dataWrites,requestsDuringDrag:during-before.requests,requestsAfterRelease:after.requests-before.requests,additionalJavaScriptFiles:afterPan.files.filter(file=>!active.files.includes(file))},
      selection,detailViewLoaded:detail.files.some(file=>file.includes('detail-view')),externalRequests:requests.filter(url=>new URL(url).origin!==origin),errors},
    sourceLines,compilerManagedState:['query','category','started','categories','rows','phase','error','selected'],adapterManagedState:['viewport','details','saved','SDK model cache and request generations'],resourceChannelManaged:['query/category key epochs','receiver code arrival','publication sequence','owner revocation'],
    authoringFindings:[{id:'typed-record-array-derive',accepted:deriveCase.ok,diagnostics:deriveCase.diagnostics}],
    cpu:{phase:'pan and first details, including diagnostic observer/automation overhead; 1ms-scale sampling, short functions may receive no samples',idleMs:idle,sources:[...cpu].map(([source,ms])=>({source,ms})).sort((a,b)=>b.ms-a.ms)}};
  assert.equal(report.browser.initialRawCLS,0);assert.equal(report.browser.rawCLSAfterResume,0);assert.deepEqual(errors,[]);assert.deepEqual(report.browser.externalRequests,[]);
  assert.equal(report.build.ssrJavaScriptFiles,0);assert.equal(report.build.ssrHasSnapshot,false);
  const resultDirectory=new URL('../evals/results/async-map/',import.meta.url);await mkdir(resultDirectory,{recursive:true});await writeFile(new URL('latest.json',resultDirectory),JSON.stringify(report,null,2)+'\n');
  await mkdir('test-results/async-map-profile',{recursive:true});await writeFile('test-results/async-map-profile/pan-details.cpuprofile',JSON.stringify(profile));
  console.log(JSON.stringify({snapshot:report.build.snapshotJsonBytes,initialJS:initial,activatedJS:active,detailsJS:detail,pan:report.browser.pan,selection:report.browser.selection,cls:ready.cls,readyMs:ready.clickToDataReadyMs,cpu:report.cpu,sourceLines},null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
