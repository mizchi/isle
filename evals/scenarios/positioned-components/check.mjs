import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {compile,requireIR} from '../../../lib/compiler.mjs';
import {compilePreview} from '../../../lib/compiler-browser.mjs';
import {analyzeLayout} from '../../../lib/layout.mjs';
import {declaredLayoutOptions} from '../../../lib/layout-declarations.mjs';
import {verifyDeclaredLayouts} from '../../../lib/layout-contract-node.mjs';
import {styleTags} from '../../../lib/styles.mjs';

const source=await readFile(new URL('../../../examples/layout-contracts/positioned-components.isle',import.meta.url),'utf8');
const editPanel=edit=>{
  const start=source.indexOf('component MapPanel()'),end=source.indexOf('component MapWithPanels()');
  return source.slice(0,start)+edit(source.slice(start,end))+source.slice(end);
};
const cases=[
  {name:'owned-child-spaces',source,status:'verified'},
  {name:'child-requires-161',source:source.replace('160px..240px','161px..240px'),status:'violated',code:'E_LAYOUT_CHILD_REQUIRES'},
  {name:'private-overlay-overflow',source:editPanel(s=>s.replace('inset-inline-end: 8px','inset-inline-end: -8px')),status:'violated',code:'E_LAYOUT_ABSOLUTE_END'},
  {name:'caller-space-mismatch',source:source.replace('space map = ".map"','space map = ".map-panel"'),status:'violated'},
  {name:'child-interface-missing',source:editPanel(s=>s.replace(/  layout PositionedGrid \{[\s\S]*?\n  \}\n/,'')),status:'unknown'},
  {name:'private-profile-invalid',source:editPanel(s=>s.replace('layout PositionedGrid','layout SafeGrid').replace(/^    (?:space|overlay)[^\n]*\n/gm,'')),status:'violated',code:'E_LAYOUT_PROFILE'},
  {name:'public-root-collision',source:source.replace('<MapPanel />','<MapPanel /><MapPanel />'),status:'violated',code:'E_LAYOUT_OVERLAY_OVERLAP'},
  {name:'transform-unmodeled',source:editPanel(s=>s.replace('.map-panel {','.map-panel { transform: translateX(1px);')),status:'unknown'},
];
const directory=new URL('../../results/positioned-components/',import.meta.url);
await mkdir(directory,{recursive:true});
const results=[];
let positive;
for(const scenario of cases) {
  const ir=requireIR(compile(scenario.source));
  const report=analyzeLayout(ir,declaredLayoutOptions(ir,{component:'MapWithPanels',css:''}));
  const proofs=await verifyDeclaredLayouts(report),parent=proofs.find(p=>p.contract.component==='MapWithPanels');
  assert.equal(parent.status,scenario.status,scenario.name);
  if(scenario.code) assert.equal(parent.proof.witness.code,scenario.code,scenario.name);
  if(scenario.status==='verified') {assert.ok(proofs.every(p=>p.status==='verified'));positive={ir,report,proofs};}
  results.push({name:scenario.name,status:parent.status,...(parent.proof.witness ? {witness:parent.proof.witness} : {}),
    declarations:proofs.map(p=>({component:p.contract.component,path:p.instance.path,status:p.status,...(p.dependencies ? {dependencies:p.dependencies} : {}),...(p.placementTransfers ? {placementTransfers:p.placementTransfers} : {})}))});
}
const compiled=compilePreview(source,{component:'MapWithPanels'});assert.equal(compiled.ok,true);
let stripped=source;
for(const span of positive.ir.components.map(c=>c.layout.source).toSorted((a,b)=>b.start-a.start)) stripped=stripped.slice(0,span.start)+stripped.slice(span.end);
const plain=compilePreview(stripped,{component:'MapWithPanels'});assert.equal(plain.ok,true);
assert.equal(compiled.preview.html,plain.preview.html);
assert.deepEqual(compiled.preview.modules,plain.preview.modules);
assert.deepEqual(compiled.preview.styles.map(s=>s.css),plain.preview.styles.map(s=>s.css));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Positioned component boundaries</title>
<style>html,body{margin:0;padding:0}body{font:16px/1.5 system-ui,sans-serif;color:#234}h1{font-size:20px;margin:16px}.host{inline-size:min(100%,960px)}p{margin:16px;max-width:40ch}</style>${styleTags(compiled.preview.styles)}
<h1>Positioned component boundaries</h1><div class="host">${compiled.preview.html}</div><p>The map places a 160 × 120 panel. The panel and legend own their private coordinate spaces.</p></html>`;
await writeFile(new URL('preview.html',directory),html);
const browser=await chromium.launch(),samples=[];
try {
  const page=await browser.newPage();
  for(const width of [320,375,641,960]) {
    await page.setViewportSize({width,height:640});await page.setContent(html);
    const actual=await page.locator('.map-panel').evaluate(panel=>{
      const map=document.querySelector('.map'),inner=document.querySelector('.panel-content'),knob=document.querySelector('.panel-knob');
      const p=map.getBoundingClientRect(),c=panel.getBoundingClientRect(),i=inner.getBoundingClientRect(),k=knob.getBoundingClientRect();
      return {width:c.width,height:c.height,x:c.left-p.left-map.clientLeft,y:c.top-p.top-map.clientTop,
        knob:{x:k.left-i.left-inner.clientLeft,y:k.top-i.top-inner.clientTop},directRoot:panel.parentElement===map,nativeBoxes:map.querySelectorAll('*').length+1};
    });
    assert.deepEqual(actual,{width:160,height:120,x:width-180,y:100,knob:{x:108,y:68},directRoot:true,nativeBoxes:6});
    samples.push({viewport:width,...actual});
  }
  for(const width of [375,1280]) {
    await page.setViewportSize({width,height:800});await page.setContent(html);
    await page.screenshot({path:new URL(`preview-${width}.png`,directory).pathname,fullPage:true});
  }
  const panel=positive.report.sizes.find(row=>row.path==='MapWithPanels/1');
  assert.deepEqual(panel.allocatedInlineSize,{coefficient:'0',constant:'160'});
  assert.deepEqual(panel.allocatedBlockSize,{coefficient:'0',constant:'120'});
  const report={version:1,passed:true,scope:'Compiled child contracts, recursive Z3 obligations and caller placement transfers; Chromium component geometry samples, not a proof of the surrounding fixture',
    browser:browser.version(),cases:results,samples,
    allocation:{inline:panel.allocatedInlineSize,block:panel.allocatedBlockSize,containingBlock:panel.containingBlock},
    payload:{htmlBytes:Buffer.byteLength(compiled.preview.html),moduleBytes:compiled.preview.modules.reduce((n,m)=>n+Buffer.byteLength(m.code),0),identicalWithoutDeclarations:true},
    limits:['Closed CSS and independently resolved dimensions','Undeclared child boundaries remain Unknown','No transforms, scrolling or opaque SDK DOM','Browser rounding and hit testing are not proved']};
  await writeFile(new URL('report.json',directory),JSON.stringify(report,null,2)+'\n');
  console.log(`Positioned components: ${results.length} scenarios passed, four browser widths, no additional module bytes.`);
} finally {await browser.close();}
