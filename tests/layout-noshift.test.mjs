import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compile as browserCompile,compilePreview} from '../lib/compiler-browser.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {declaredLayoutOptions} from '../lib/layout-declarations.mjs';
import {createNoShiftPlan} from '../lib/layout-noshift.mjs';
import {verifyDeclaredNoShift} from '../lib/layout-noshift-node.mjs';

const source=await readFile(new URL('../examples/layout-contracts/noshift.isle',import.meta.url),'utf8');
const analyze=text=>{
  const ir=requireIR(compile(text));
  const report=analyzeLayout(ir,declaredLayoutOptions(ir,{component:'Panel',css:''}));
  return {ir,report};
};
const run=async text=>{const {ir,report}=analyze(text);return verifyDeclaredNoShift(ir,report);};

test('noshift syntax is build-only, scoped and identical in Node/browser compilation',()=>{
  const result=compile(source);assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(browserCompile(source),result);
  const target=result.ir.components[0].layout.noshift[0];
  assert.equal(target.selector,'.action');
  assert.equal(source.slice(target.source.start,target.source.end),'noshift ".action";');
  const plain=compilePreview(source.replace('noshift ".action";','')),checked=compilePreview(source);
  assert.equal(checked.ok,true);
  for(const key of ['html','snapshotHtml','modules','entries','schemas','events']) assert.deepEqual(checked.preview[key],plain.preview[key]);
  assert.deepEqual(checked.preview.styles.map(({sources,...style})=>style),plain.preview.styles.map(({sources,...style})=>style));
});

test('reserved space verifies every finite state against an anchor state',async()=>{
  const {ir,report}=analyze(source);
  assert.equal(report.status,'verified');assert.equal(report.structure.variants.length,2);
  const plan=createNoShiftPlan(ir,report);
  assert.equal(plan.checks.length,2);
  assert.ok(Object.isFrozen(plan));
  const result=await verifyDeclaredNoShift(ir,report);
  assert.equal(result.status,'verified');assert.equal(result.checks.length,2);
  assert.equal(result.coverage,'all-finite-cases');
});

test('an unreserved mutable state reports the authored target and its exact movement',async()=>{
  const text=source.replace('height:80px;display:grid','display:grid');
  const result=await run(text);
  assert.equal(result.status,'violated');
  const failed=result.checks.find(c=>c.status==='violated');
  assert.equal(failed.change.delta.exact,'56');
  assert.equal(failed.targets[0].selector,'.action');
  assert.equal(text.slice(failed.targets[0].source.start,failed.targets[0].source.end),'noshift ".action";');
});

test('a missing or ambiguous target cannot silently pass',async()=>{
  const missing=await run(source.replace('noshift ".action"','noshift ".missing"'));
  assert.equal(missing.status,'unknown');assert.ok(missing.diagnostics.some(d=>d.code==='U_NOSHIFT_TARGET'));
  const duplicate=await run(source.replace('<button class="action"','<div class="action"/><button class="action"'));
  assert.equal(duplicate.status,'unknown');assert.ok(duplicate.diagnostics.some(d=>d.code==='U_NOSHIFT_TARGET'));
});

test('targets hidden in a candidate state fail even when only one case remains',async()=>{
  const result=await run(source.replace('</style>','.action{display:none}</style>'));
  assert.equal(result.status,'violated');
  assert.equal(result.checks[0].proof.witness.code,'E_NOSHIFT_PRESENCE');
});

test('noshift may use the profile default fit guarantees and rejects unsupported syntax',()=>{
  assert.equal(compile(source.replace('overflow-inline:fit;overflow-block:fit;','')).ok,true);
  for(const statement of ['noshift ".panel .action";','noshift ".action";noshift ".action";','noshift action;','noshift ".action" tolerance 1px;']) {
    const result=compile(source.replace('noshift ".action";',statement));
    assert.equal(result.ok,false);assert.match(result.diagnostics[0].code,/^E_LAYOUT_/);
  }
});

test('unbounded geometry and excessive comparisons produce Unknown',async()=>{
  const {ir,report}=analyze(source),partial=structuredClone(report);
  partial.structure.complete=false;
  assert.equal((await verifyDeclaredNoShift(ir,partial)).status,'unknown');
  const invalid=await run(source.replace('.panel{display:grid','.panel{transform:translateX(1px);display:grid'));
  assert.equal(invalid.status,'unknown');
  const large=structuredClone(report),variants=Array.from({length:257},(_,id)=>({id,choices:[]}));
  large.structure={...large.structure,variants};
  for(const key of ['elements','diagnostics','policies','checks','sizes','queries','subgrids','scrollbars','layoutBindings']) {
    if(report[key]) large[key]=variants.flatMap(({id})=>report[key].filter(row=>row.variant===0).map(row=>({...row,variant:id})));
  }
  const plan=createNoShiftPlan(ir,large);
  assert.equal(plan.complete,false);assert.ok(plan.diagnostics.some(d=>d.code==='U_NOSHIFT_LIMIT'));
});

test('caller selectors can bind a child public root and cannot bind its private descendants',async()=>{
  const child=`component Child(){layout SafeGrid{requires{inline-size:320px..960px;block-size:32px..720px;}}
    <div class="child"><style>*{box-sizing:border-box;margin:0;padding:0}.child{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:8px;height:32px}.private{height:8px}</style><div class="private"/></div>}`;
  const publicSource=child+source.replace('noshift ".action"','noshift ".child"').replace('<button class="action"','<Child/><button class="action"');
  assert.equal((await run(publicSource)).status,'verified');
  const privateSource=publicSource.replace('noshift ".child"','noshift ".private"');
  const result=await run(privateSource);
  assert.equal(result.status,'unknown');
  assert.ok(result.diagnostics.some(d=>d.code==='U_NOSHIFT_TARGET'));
});
