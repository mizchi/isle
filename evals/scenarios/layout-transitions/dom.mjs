import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {compile,requireIR} from '../../../lib/compiler.mjs';
import {compilePreview} from '../../../lib/compiler-browser.mjs';
import {analyzeLayout} from '../../../lib/layout.mjs';
import {declaredLayoutOptions} from '../../../lib/layout-declarations.mjs';
import {verifyDeclaredNoShift} from '../../../lib/layout-noshift-node.mjs';

const source=await readFile(new URL('../../../examples/layout-contracts/noshift-dom.isle',import.meta.url),'utf8');
const button='<button @noshift class="action" type="button" aria-label="Toggle panel" on:click={toggle}/>';
const replacement=button.replace(' @noshift','');
const scenarios=[
  {name:'element-reserved',source,status:'verified'},
  {name:'element-class-changes',source:source.replace('class="action"','class={expanded ? "action changed" : "action"}'),status:'verified'},
  {name:'element-same-class-neighbor',source:source.replace(button,'<div class="action"/>'+button),status:'verified'},
  {name:'element-unreserved',source:source.replace('height:80px;display:grid','display:grid'),status:'violated'},
  {name:'element-hidden',source:source.replace('</style>','.action{display:none}</style>'),status:'violated'},
  {name:'element-replaced',source:source.replace(button,`<Show when={expanded} fallback={${replacement}}>${button}</Show>`),status:'violated'},
  {name:'element-repeated',source:source.replace(button,'<For each={[1]}>{item=><div key={item} class="action" @noshift/>}</For>'),status:'verified'},
];
const cases=[];
for(const scenario of scenarios) {
  const ir=requireIR(compile(scenario.source));
  const report=analyzeLayout(ir,declaredLayoutOptions(ir,{component:'Panel',css:''}));
  const proof=await verifyDeclaredNoShift(ir,report);
  assert.equal(proof.status,scenario.status,scenario.name);
  assert.ok(proof.comparisons.planned>0,'An element requirement must produce an actual check');
  const failed=proof.checks.find(row=>row.status!=='verified');
  cases.push({name:scenario.name,status:proof.status,comparisons:proof.comparisons,
    ...(failed?.change ? {change:failed.change} : {}),...(failed?.proof.witness ? {witness:failed.proof.witness} : {}),
    diagnostics:[...proof.diagnostics,...(failed?.proof.diagnostics ?? [])]});
}
const checked=compilePreview(source),plain=compilePreview(source.replace(' @noshift',''));
assert.equal(checked.ok,true);assert.equal(plain.ok,true);
for(const key of ['html','snapshotHtml','modules']) assert.deepEqual(checked.preview[key],plain.preview[key]);
assert.deepEqual(checked.preview.styles.map(row=>row.css),plain.preview.styles.map(row=>row.css));
const bytes=preview=>({html:Buffer.byteLength(preview.html+preview.snapshotHtml),modules:preview.modules.reduce((n,row)=>n+Buffer.byteLength(row.code),0),css:preview.styles.reduce((n,row)=>n+Buffer.byteLength(row.css),0)});
const baseline=bytes(plain.preview),current=bytes(checked.preview),runtimeDelta=Object.fromEntries(Object.keys(baseline).map(key=>[key,current[key]-baseline[key]]));
const directory=new URL('../../results/layout-transitions/',import.meta.url);await mkdir(directory,{recursive:true});
await writeFile(new URL('dom.json',directory),JSON.stringify({version:1,passed:true,
  scope:'DOM @noshift -> build-only source-site IDs -> generic target-ID contracts; all finite candidates, without a browser',
  limits:['source-site identity is local to this compilation','repeated targets require exact finite keys and row lifetimes','one owning component layout profile supplies the environment','text/paint/intermediate frames and CLS not proved'],
  runtimeBytes:current,runtimeDelta,cases},null,2)+'\n');
console.log(`DOM noshift: ${cases.length} scenarios passed; HTML/JS/CSS delta ${JSON.stringify(runtimeDelta)}.`);
