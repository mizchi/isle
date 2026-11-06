import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '../lib/layout.mjs';

const css = '*{box-sizing:border-box;margin:0}.root{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:40px}.cell{min-width:40px}.wide{min-width:140px}';
const run = (source,options={}) => analyzeLayout(requireIR(compile(source)),{css,viewport:{min:100,max:300,height:{min:200,max:600}},...options});

test('all dynamic branch arms are checked, including an arm absent from SSR',()=>{
  const source='client component C(){state show=true;<main class="root">on click {show=false;}<Show when={show} fallback={<Fragment><div class="wide"></div></Fragment>}><div class="cell"></div></Show></main>}';
  const report=run(source);
  assert.equal(report.status,'violated',JSON.stringify(report.diagnostics));
  assert.equal(report.structure.complete,true);
  assert.equal(report.structure.variants.length,2);
  assert.ok(report.diagnostics.some(d=>d.code==='E_LAYOUT_ITEM_SIZE' && d.variant!==undefined));
  assert.equal(run(source,{viewport:{min:140,max:300,height:{min:200,max:600}}}).status,'verified');
});

test('switch and synchronous error fallbacks join the same checked structure union',()=>{
  const source='client component C(){state n=0;<main class="root">on click {n+=1;}<Switch fallback={<Fragment><div class="wide"></div></Fragment>}><Match when={n === 0}><div class="cell"></div></Match></Switch><ErrorBoundary fallback={(error) => <Fragment><div class="cell"></div></Fragment>}><div>{[1][n]}</div></ErrorBoundary></main>}';
  const report=run(source,{boxes:{div:{minInlineSize:40,minBlockSize:20}}});
  assert.equal(report.status,'violated',JSON.stringify(report.diagnostics));
  assert.equal(report.structure.variants.length,4);
});

test('finite dynamic classes are analyzed without trusting the initial class',()=>{
  const source='client component C(){state show=true;<main class="root">on click {show=false;}<div class={show ? "cell" : "wide"}></div></main>}';
  assert.equal(run(source).status,'violated');
  assert.equal(run(source,{viewport:{min:140,max:300,height:{min:200,max:600}}}).status,'verified');
});

test('guarded append proves a list bound and checks every count, including empty',()=>{
  const source='client component C(){state items=[1];<main class="root">on click {items=items.length < 4 ? items.concat([2]) : items;}on dblclick {items=[];}<For each={items} fallback={<Fragment><div class="wide"></div></Fragment>}>{(item) => <Fragment key={item}><div class="cell"></div></Fragment>}</For></main>}';
  const report=run(source);
  assert.equal(report.status,'violated',JSON.stringify(report.diagnostics));
  assert.deepEqual(report.structure.bounds.find(row=>row.state==='items').length,{min:0,max:4});
  assert.equal(report.structure.variants.length,5);
  assert.equal(run(source,{viewport:{min:140,max:300,height:{min:200,max:600}}}).status,'verified');
});

test('unbounded growth stays unknown rather than trusting a max-items assertion',()=>{
  const source='client component C(){state items=[1];<main class="root">on click {items=items.concat([2]);}<For each={items}>{(item) => <Fragment key={item}><div class="cell"></div></Fragment>}</For></main>}';
  const report=run(source);
  assert.equal(report.status,'unknown');
  assert.ok(report.diagnostics.some(row=>row.code==='U_LAYOUT_CARDINALITY'));
});

test('length proofs account for sequential writes in one handler',()=>{
  const source='client component C(){state items=[1];<main class="root">on click {items=items.length < 4 ? items.concat([2]) : items;items=items.concat([3]);}<For each={items}>{(item) => <Fragment key={item}><div class="cell"></div></Fragment>}</For></main>}';
  assert.equal(run(source).status,'unknown');
});

test('immutable mount arrays give finite bounds; unmatched contracts are checked across arms',()=>{
  const source='component C(items: number[],show:boolean){<main class="root"><Show when={show} fallback={<Fragment><div class="wide"></div></Fragment>}><For each={items}>{(item) => <Fragment key={item}><div class="cell"></div></Fragment>}</For></Show></main>}';
  const report=run(source,{props:{items:[1,2]},boxes:{'.cell':{minInlineSize:40},'.wide':{minInlineSize:40}}});
  assert.equal(report.status,'violated',JSON.stringify(report.diagnostics));
  assert.throws(()=>run(source,{props:{items:[1]},boxes:{'.typo':{minInlineSize:40}}}),/does not match/);
});

test('finite state choices stay correlated across repeated rows',()=>{
  const source='client component C(){state show=true;state items=[1,2,3,4];<main class="root">on click {show=!show;}<For each={items}>{(item) => <Fragment key={item}><div class={show ? "cell":"wide"}></div></Fragment>}</For></main>}';
  const report=run(source,{viewport:{min:140,max:300,height:{min:200,max:600}}});
  assert.equal(report.status,'verified');
  assert.equal(report.structure.variants.length,2,'one global boolean, not 2^4 independent row choices');
});

test('native buttons need explicit appearance, padding and border geometry',()=>{
  const source='component C(){<button class="cell" type="button">Click</button>}';
  const options={boxes:{'.cell':{minInlineSize:40,minBlockSize:20,intrinsicBlockSize:20}}};
  assert.equal(run(source,options).status,'unknown');
  assert.equal(run(source,{...options,css:css+'button{appearance:none;display:block;min-width:0;min-height:0;padding:0;border:0}'}).status,'verified');
});

test('text-only state does not multiply structural variants',()=>{
  const flags=Array.from({length:10},(_,i)=>`flag${i}`);
  const source=`client component C(){state show=true;${flags.map(n=>`state ${n}=true;`).join('')}<main class="root">on click {show=!show;${flags.map(n=>`${n}=!${n};`).join('')}}<div class={show ? "cell":"wide"}></div><p class="copy">${flags.map(n=>`{${n} ? "yes":"no"}`).join('')}</p></main>}`;
  const report=run(source,{viewport:{min:600,max:800,height:{min:200,max:400}},boxes:{'.copy':{minInlineSize:500,minBlockSize:20}}});
  assert.equal(report.status,'verified',JSON.stringify(report.diagnostics));
  assert.equal(report.structure.variants.length,2);
});

test('a view guard can bound a repeated slice of an otherwise unknown typed array',()=>{
  const source='component C(items:number[]){<main class="root"><Show when={items.length<4} fallback={<Fragment><div class="wide"></div></Fragment>}><For each={items}>{(item) => <Fragment key={item}><div class="cell"></div></Fragment>}</For></Show></main>}';
  const report=run(source,{viewport:{min:140,max:300,height:{min:200,max:400}}});
  assert.equal(report.status,'verified',JSON.stringify(report.diagnostics));
  assert.equal(report.structure.variants.length,5);
});
