import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {compile,requireIR} from '../../../lib/compiler.mjs';
import {compilePreview} from '../../../lib/compiler-browser.mjs';
import {analyzeLayout} from '../../../lib/layout.mjs';
import {declaredLayoutOptions} from '../../../lib/layout-declarations.mjs';
import {verifyDeclaredNoShift} from '../../../lib/layout-noshift-node.mjs';

const source=await readFile(new URL('../../../examples/layout-contracts/noshift-keys.isle',import.meta.url),'utf8');
const list=(initial,next,row='<div key={item} @noshift class="cell"/>')=>`
client component Keyed(){
  state items:number[]=${initial};
  layout SafeGrid{requires{inline-size:320px..960px;block-size:240px..720px;}}
  event change(e:EventSnapshot<MouseEvent>){items=${next};}
  <main class="list" on:click={change}>
    <style>*{box-sizing:border-box;margin:0;padding:0}.list{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:40px;align-content:start}.cell{height:40px}</style>
    <For each={items}>{item=>${row}}</For>
  </main>
}`;
const scenarios=[
  {name:'keyed-explicit-placement',source,status:'verified'},
  {name:'keyed-reorder-moves',source:source.replace('grid-column:1;grid-row:1;','').replace('grid-column:1;grid-row:2;',''),status:'violated'},
  {name:'keyed-tail-append',source:list('[1]','[1,2]'),status:'verified'},
  {name:'keyed-tail-remove',source:list('[1,2]','[1]'),status:'verified'},
  {name:'keyed-head-remove-moves-survivor',source:list('[1,2]','[2]'),status:'violated'},
  {name:'keyed-live-row-target-disappears',source:list('[1,2]','[1,2]','<Fragment key={item}><Show when={visible}><div @noshift class="cell"/></Show></Fragment>').replace('state items:','state visible=true;state items:').replace('items=[1,2];}','items=[1,2];visible=!visible;}'),status:'violated'},
  {name:'keyed-duplicate',source:list('[1,1]','[1,1]'),status:'unknown'},
  {name:'keyed-unsafe-number',source:list('[1.5]','[1.5]'),status:'unknown'},
];
const cases=[];
for(const scenario of scenarios) {
  const ir=requireIR(compile(scenario.source));
  const report=analyzeLayout(ir,declaredLayoutOptions(ir,{component:'Keyed',css:''}));
  const proof=await verifyDeclaredNoShift(ir,report),failed=proof.checks.find(row=>row.status!=='verified');
  assert.equal(proof.status,scenario.status,scenario.name);
  cases.push({name:scenario.name,status:proof.status,variants:report.structure.variants.length,comparisons:proof.comparisons,
    ...(failed?.change ? {change:failed.change,identities:failed.identities} : {}),
    ...(failed?.proof.witness ? {witness:failed.proof.witness} : {}),diagnostics:[...report.diagnostics,...proof.diagnostics]});
}
const checked=compilePreview(source),plain=compilePreview(source.replace(' @noshift',''));
assert.equal(checked.ok,true);assert.equal(plain.ok,true);assert.deepEqual(checked.preview,plain.preview);
const bytes=preview=>({html:Buffer.byteLength(preview.html+preview.snapshotHtml),modules:preview.modules.reduce((n,row)=>n+Buffer.byteLength(row.code),0),css:preview.styles.reduce((n,row)=>n+Buffer.byteLength(row.css),0)});
const baseline=bytes(plain.preview),current=bytes(checked.preview),runtimeDelta=Object.fromEntries(Object.keys(baseline).map(key=>[key,current[key]-baseline[key]]));
const directory=new URL('../../results/layout-transitions/',import.meta.url);await mkdir(directory,{recursive:true});
await writeFile(new URL('keys.json',directory),JSON.stringify({version:1,passed:true,
  scope:'Finite ordered arrays -> typed key chains and source-site identities -> generic endpoint obligations; no browser',
  limits:['exact finite item/key alternatives required','same live key is compared across all cases; entire row birth/death is allowed','same-key remount lifetimes may be conservatively combined','text/paint/intermediate frames and CLS not proved'],
  runtimeBytes:current,runtimeDelta,cases},null,2)+'\n');
console.log(`Keyed noshift: ${cases.length} scenarios passed; HTML/JS/CSS delta ${JSON.stringify(runtimeDelta)}.`);
