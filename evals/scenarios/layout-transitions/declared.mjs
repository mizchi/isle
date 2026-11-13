import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {compile,requireIR} from '../../../lib/compiler.mjs';
import {compilePreview} from '../../../lib/compiler-browser.mjs';
import {analyzeLayout} from '../../../lib/layout.mjs';
import {declaredLayoutOptions} from '../../../lib/layout-declarations.mjs';
import {verifyDeclaredNoShift} from '../../../lib/layout-noshift-node.mjs';

const source=await readFile(new URL('../../../examples/layout-contracts/noshift.isle',import.meta.url),'utf8');
const scenarios=[
  {name:'reserved',source,status:'verified'},
  {name:'unreserved',source:source.replace('height:80px;display:grid','display:grid'),status:'violated'},
  {name:'missing-target',source:source.replace('noshift ".action"','noshift ".missing"'),status:'unknown'},
  {name:'duplicate-target',source:source.replace('<button class="action"','<div class="action"/><button class="action"'),status:'unknown'},
  {name:'hidden-target',source:source.replace('</style>','.action{display:none}</style>'),status:'violated'},
];
const cases=[];
for(const scenario of scenarios) {
  const ir=requireIR(compile(scenario.source));
  const report=analyzeLayout(ir,declaredLayoutOptions(ir,{component:'Panel',css:''}));
  const proof=await verifyDeclaredNoShift(ir,report);
  assert.equal(proof.status,scenario.status,scenario.name);
  const failed=proof.checks.find(row=>row.status!=='verified');
  cases.push({name:scenario.name,status:proof.status,candidates:report.structure.variants.length,comparisons:proof.comparisons,
    ...(failed?.change ? {change:failed.change} : {}),...(failed?.proof.witness ? {witness:failed.proof.witness} : {}),diagnostics:proof.diagnostics});
}
const checked=compilePreview(source),plain=compilePreview(source.replace('noshift ".action";',''));
assert.equal(checked.ok,true);assert.equal(plain.ok,true);
for(const key of ['html','snapshotHtml','modules']) assert.deepEqual(checked.preview[key],plain.preview[key]);
const bytes=preview=>({html:Buffer.byteLength(preview.html+preview.snapshotHtml),modules:preview.modules.reduce((n,row)=>n+Buffer.byteLength(row.code),0),css:preview.styles.reduce((n,row)=>n+Buffer.byteLength(row.css),0)});
const baseline=bytes(plain.preview),current=bytes(checked.preview),runtimeDelta=Object.fromEntries(Object.keys(baseline).map(key=>[key,current[key]-baseline[key]]));
assert.ok(Object.values(runtimeDelta).every(value=>value===0));
const directory=new URL('../../results/layout-transitions/',import.meta.url);
await mkdir(directory,{recursive:true});
await writeFile(new URL('declared.json',directory),JSON.stringify({version:1,passed:true,
  scope:'Isle source noshift declarations -> finite abstract structural candidates -> generic noshift/1 endpoint obligations; no browser',
  limits:['state candidates are a conservative overapproximation, not an exact event graph','each declared live instance has unique owned/public-root targets','fixed root origin and viewport; text/paint/CLS outside the profile','unmount outside a child instance lifetime needs a caller contract'],
  runtimeBytes:current,runtimeDelta,cases},null,2)+'\n');
console.log(`Declared noshift: ${cases.length} scenarios passed; HTML/JS/CSS delta ${JSON.stringify(runtimeDelta)}.`);
