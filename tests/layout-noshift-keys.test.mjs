import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compilePreview} from '../lib/compiler-browser.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {declaredLayoutOptions} from '../lib/layout-declarations.mjs';
import {verifyDeclaredNoShift} from '../lib/layout-noshift-node.mjs';

const fixture=({initial='[1,2]',next='[2,1]',key='item',row='<div key={item} @noshift class="cell"/>',css='',index=false,type='number[]',schema=''}={})=>`${schema}
client component List(){
  state items:${type}=${initial};
  layout SafeGrid{requires{inline-size:320px..960px;block-size:240px..720px;}}
  event change(e:EventSnapshot<MouseEvent>){items=${next};}
  <main class="list" on:click={change}>
    <style>*{box-sizing:border-box;margin:0;padding:0}.list{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:40px;align-content:start}.cell{height:40px}${css}</style>
    <For each={items}>{${index ? '(item,index)' : 'item'}=>${row.replace('key={item}',`key={${key}}`)}}</For>
  </main>
}`;
const run=async (source,props)=>{
  const ir=requireIR(compile(source));
  const report=analyzeLayout(ir,declaredLayoutOptions(ir,{component:'List',css:'',...(props ? {props} : {})}));
  return {ir,report,proof:await verifyDeclaredNoShift(ir,report)};
};

test('known keys verify and carry no executable annotation payload',async()=>{
  const source=fixture({next:'[1,2]'}),{proof}=await run(source);
  assert.equal(proof.status,'verified',JSON.stringify(proof));
  assert.ok(proof.comparisons.checked>0);
  const checked=compilePreview(source),plain=compilePreview(source.replaceAll(' @noshift',''));
  assert.equal(checked.ok,true);
  assert.deepEqual(checked.preview,plain.preview);
});

test('reorder compares the same key at different paths rather than borrowing an index',async()=>{
  const {proof}=await run(fixture());
  assert.equal(proof.status,'violated',JSON.stringify(proof));
  const check=proof.checks.find(row=>row.change);
  assert.equal(check.change.field,'blockStart');
  assert.equal(Math.abs(check.change.delta.value),40);
  assert.notEqual(check.change.beforePath,check.change.afterPath);
  assert.ok(check.identities.some(row=>row.keys.some(key=>key.value===1 || key.value===2)));
});

test('explicit grid placement can preserve keyed rectangles across a DOM reorder',async()=>{
  const {proof}=await run(fixture({initial:'[{id:1,slot:"a"},{id:2,slot:"b"}]',next:'[{id:2,slot:"b"},{id:1,slot:"a"}]',key:'item.id',
    schema:'schema Item{id:number;slot:string;}',type:'Item[]',
    row:'<div key={item} @noshift class={item.slot}/>',css:'.list{grid-template-rows:40px 40px}.a{grid-column:1;grid-row:1;height:40px}.b{grid-column:1;grid-row:2;height:40px}'}));
  assert.equal(proof.status,'verified',JSON.stringify(proof));
});

test('tail insertion and deletion start or end a row lifetime',async()=>{
  for(const [initial,next] of [['[1]','[1,2]'],['[1,2]','[1]'],['[]','[1]'],['[1]','[]']]) {
    const {proof}=await run(fixture({initial,next}));
    assert.equal(proof.status,'verified',`${initial} -> ${next}: ${JSON.stringify(proof)}`);
  }
  assert.equal((await run(fixture({next:'[2]'}))).proof.status,'violated');
});

test('hiding an annotated target inside a surviving keyed row violates presence',async()=>{
  const source=fixture({next:'[1,2]',row:'<Fragment key={item}><Show when={show}><div @noshift class="cell"/></Show></Fragment>'})
    .replace('state items:','state show=true;state items:').replace('items=[1,2];}', 'items=[1,2];show=!show;}');
  const {proof}=await run(source);
  assert.equal(proof.status,'violated',JSON.stringify(proof));
  assert.equal(proof.checks.find(row=>row.status==='violated').proof.witness.code,'E_NOSHIFT_PRESENCE');
});

test('duplicate, invalid and positional keys cannot certify keyed requirements',async()=>{
  for(const options of [
    {initial:'[1,1]',next:'[1,1]'},
    {initial:'[1.5]',next:'[1.5]'},
  ]) {
    const {report,proof}=await run(fixture(options));
    assert.equal(proof.status,'unknown',JSON.stringify(proof));
    assert.ok(report.diagnostics.some(row=>row.code==='U_LAYOUT_IDENTITY'));
  }
  for(const options of [{key:'index',index:true},{initial:'[true]',next:'[true]',type:'boolean[]'}]) {
    const result=compile(fixture(options));
    assert.equal(result.ok,false);assert.equal(result.diagnostics[0].code,'E_CONTROL_KEY');
  }
});

test('an invalid -0 key cannot be merged into a valid zero key',async()=>{
  const source=fixture({initial:'[0]',next:'[-0]'}),result=compile(source);
  if(!result.ok) return;
  const {proof}=await run(source);
  assert.equal(proof.status,'unknown');
});

test('immutable props preserve the runtime distinction between -0 and zero',async()=>{
  const source=fixture({initial:'initial',next:'initial'}).replace('component List()','component List(initial:number[])');
  assert.equal((await run(source,{initial:[-0]})).proof.status,'unknown');
  assert.equal((await run(source,{initial:[0]})).proof.status,'verified');
});

test('nested repeats and separate repeat sites keep equal keys distinct',async()=>{
  const source=fixture({next:'[1,2]',row:'<Fragment key={item}><For each={[1,2]}>{inner=><div key={inner} @noshift class="cell"/>}</For></Fragment>'})
    .replace('</main>','<For each={[1,2]}>{other=><div key={other} @noshift class="cell"/>}</For></main>');
  const {proof}=await run(source);
  assert.equal(proof.status,'verified',JSON.stringify(proof));
  assert.equal(new Set(proof.checks.flatMap(row=>row.identities.map(identity=>identity.id))).size,6);
});

test('a pure child declaration follows its keyed instance across path changes',async()=>{
  const child='component Child(){layout SafeGrid{requires{inline-size:320px..960px;block-size:40px..720px;}}<div @noshift class="cell"/>}';
  const {proof}=await run(child+fixture({row:'<Child key={item}/>'}));
  assert.equal(proof.status,'violated',JSON.stringify(proof));
  assert.notEqual(proof.checks.find(row=>row.change).change.beforePath,proof.checks.find(row=>row.change).change.afterPath);
});

test('For fallback requirements belong to the owner lifetime, not a row lifetime',async()=>{
  const source=fixture({initial:'[1]',next:'[]',row:'<div key={item} class="cell"/>'})
    .replace('<For each={items}>','<For each={items} fallback={<div @noshift class="cell"/>}>');
  const {proof}=await run(source);
  assert.equal(proof.status,'violated',JSON.stringify(proof));
  assert.equal(proof.checks.find(row=>row.status==='violated').proof.witness.code,'E_NOSHIFT_PRESENCE');
});

test('a row-bounded array with unknown identities cannot certify noshift',async()=>{
  const source=fixture({initial:'initial',next:'initial'})
    .replace('component List()','component List(initial:number[])')
    .replace('<For each={items}>','<Show when={items.length<3}><For each={items}>').replace('</For>','</For></Show>');
  const {report,proof}=await run(source);
  assert.equal(proof.status,'unknown');
  assert.ok(report.diagnostics.some(row=>row.code==='U_LAYOUT_IDENTITY'));
});

test('selector contracts in repeated children also follow keys',async()=>{
  const child='component Child(){layout SafeGrid{requires{inline-size:320px..960px;block-size:40px..720px;}ensures{noshift ".cell";}}<div class="cell"/>}';
  const {proof}=await run(child+fixture({row:'<Child key={item}/>'}));
  assert.equal(proof.status,'violated',JSON.stringify(proof));
});

test('an incomplete identity inventory cannot turn live targets into an empty proof',async()=>{
  const {ir,report}=await run(fixture({next:'[1,2]'}));
  report.structure.variants[0].requirements=[];
  const proof=await verifyDeclaredNoShift(ir,report);
  assert.equal(proof.status,'unknown');
  assert.ok(proof.diagnostics.some(row=>row.code==='U_NOSHIFT_IDENTITY'));
});

test('a statically eliminated annotated site cannot silently erase its requirement',async()=>{
  const source=fixture({row:'<Fragment key={item}><div class="cell"/><Show when={false}><div @noshift class="cell"/></Show></Fragment>'});
  const result=compile(source);
  if(!result.ok) {assert.match(result.diagnostics[0].code,/^E_LAYOUT_/);return;}
  assert.notEqual((await run(source)).proof.status,'verified');
});
