import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {init,killThreads} from 'z3-solver';
import {compile,requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {createContractIR,createLayoutIR,createObligationIR,verifyObligationIR,createRefinementObligationIR} from '../lib/layout-contract.mjs';

const api=await init();after(()=>killThreads(api.em));
const ir=requireIR(compile('component Four(){<main class="row"><div class="cell"/><div class="cell"/><div class="cell"/><div class="cell"/></main>}'));
const css='*{box-sizing:border-box;margin:0;padding:0}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:40px}.cell{min-width:40px;height:40px}';
const contract=(min=160,blockMin=40,component='Four')=>createContractIR({component,requires:{inlineSize:{min,max:640},blockSize:{min:blockMin,max:640}}});
const layout=(sheet=css,min=80,blockMin=40,extra={})=>createLayoutIR(analyzeLayout(ir,{css:sheet,viewport:{min,max:640,height:{min:blockMin,max:640}},...extra}));
const verify=(c,l,children=[])=>verifyObligationIR(createObligationIR(c,l,{children}),api);

test('contract grammar is closed, exact and immutable, independent of implementation facts',()=>{
  const c=contract(160.125),l=layout();
  assert.equal(c.kind,'contract');assert.equal(c.profile.id,'safe-grid/1');
  assert.equal(c.requires.inlineSize.minExact,'1281/8');
  assert.deepEqual(c.ensures,{inline:'fit',block:'fit'});
  assert.equal(l.kind,'layout');assert.ok(Object.isFrozen(c.requires.inlineSize));
  assert.deepEqual(JSON.parse(JSON.stringify(c)),c);
  for(const input of [
    {component:'Four',requires:{inlineSize:{min:640,max:160},blockSize:{min:40,max:640}}},
    {...c,profile:'any-css'},
    {component:'Four',requires:{inlineSize:{min:160,max:640},blockSize:{min:40,max:640}},ensures:{inline:'ignore',block:'fit'}},
    {component:'Four',requires:{inlineSize:{min:160,max:640},blockSize:{min:40,max:640}},assume:'no overflow'},
  ]) assert.throws(()=>createContractIR(input));
});

test('four cells satisfy their own contract even when extraction includes smaller failing widths',async()=>{
  const c=contract(),l=layout();
  const before=JSON.stringify(l),o=createObligationIR(c,l);
  assert.equal(o.kind,'obligation');assert.equal(o.implementation.component,'Four');
  assert.equal(JSON.stringify(l),before,'checking does not constrain or mutate implementation facts');
  const result=await verifyObligationIR(o,api);
  assert.equal(result.status,'verified');assert.equal(result.coverage.status,'verified');
  assert.equal(result.proof.solver.result,'unsat');
  assert.equal((await verify(contract(120),l)).status,'violated');
});

test('a gap is an implementation change, not an assumption added to satisfy ensures',async()=>{
  const l=layout(css+'.row{column-gap:8px}');
  const broken=await verify(contract(),l);
  assert.equal(broken.status,'violated');assert.ok(broken.proof.witness.viewport<184);
  assert.equal((await verify(contract(184),l)).status,'verified');
  assert.equal((await verify(contract(),layout(css.replace('min-width:40px','min-width:41px')))).status,'violated');
});

test('responsive obligations preserve strict boundaries and both axes',async()=>{
  const responsive=threshold=>css+`@media(width < ${threshold}px){.row{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
  assert.equal((await verify(contract(80,80),layout(responsive(160),80,80))).status,'verified');
  const broken=await verify(contract(80,80),layout(responsive(159),80,80));
  assert.equal(broken.status,'violated');assert.ok(broken.proof.witness.viewport>=159 && broken.proof.witness.viewport<160);
  assert.equal((await verify(contract(80,40),layout(responsive(160)))).status,'violated');
});

test('parent allocations satisfy child requirements, independently of rendered child dimensions',async()=>{
  const l=layout(),child=contract(40,40,'Cell');
  const children=Array.from({length:4},(_,i)=>({path:`Four/${i}`,contract:child}));
  assert.equal((await verify(contract(),l,children)).status,'verified');
  const stronger=children.map(binding=>({...binding,contract:contract(48,40,'Cell')}));
  const broken=await verify(contract(),l,stronger);
  assert.equal(broken.status,'violated');assert.equal(broken.proof.witness.code,'E_LAYOUT_CHILD_REQUIRES');
  assert.ok(broken.proof.witness.viewport<192);
  assert.equal((await verify(contract(192),l,stronger)).status,'verified');
  assert.throws(()=>createObligationIR(contract(),l,{children:[{path:'Four/missing',contract:child}]}),/path/i);
});

test('allocation, border and content dimensions remain distinct with padding, border and host insets',async()=>{
  const l=layout(css+'.row{padding:8px;border:2px solid black}',80,40);
  const root=l.boxes.find(box=>box.path==='Four');
  assert.equal(root.allocated.inline.coefficient,'1');assert.equal(root.border.inline.coefficient,'1');
  assert.equal(root.content.inline.constant,'-20');
  assert.equal((await verify(contract(180,60),l)).status,'verified');
  assert.equal((await verify(contract(),l)).status,'violated');
  const inset=layout(css,180,60,{hostInset:20,hostBlockInset:20,viewport:{min:180,max:660,height:{min:60,max:660}}});
  assert.equal((await verify(contract(160,40),inset)).status,'verified');
});

test('coverage is checked per case and box; holes and missing dimensions cannot verify',async()=>{
  assert.equal((await verify(contract(80),layout(css,160))).status,'unknown');
  const l=layout(),root=l.boxes.find(box=>box.path==='Four');
  const hole={...l,boxes:l.boxes.filter(box=>box!==root)};
  const result=await verify(contract(),hole);
  assert.equal(result.status,'unknown');assert.equal(result.proof.witness.code,'U_LAYOUT_COVERAGE');
  assert.equal(result.proof.complete,false);
  assert.ok(result.proof.diagnostics.some(d=>d.code==='U_LAYOUT_COVERAGE'));
  const missingChild={...l,boxes:l.boxes.filter(box=>box.path!=='Four/0')};
  assert.equal((await verify(contract(),missingChild)).status,'unknown');
  const noBlock={...l,boxes:l.boxes.map(box=>({...box,border:{inline:box.border.inline}}))};
  assert.equal((await verify(contract(),noBlock)).status,'unknown');
  const missingCase={...l,cases:[...l.cases,{variant:1}]};
  assert.equal((await verify(contract(),missingCase)).status,'unknown');
});

test('Fit is checked against geometry facts, and an empty or altered IR grammar is rejected',async()=>{
  const l=layout();
  const changed={...l,boxes:l.boxes.map(box=>box.path!=='Four/0' ? box : {...box,border:{...box.border,inline:{coefficient:'0',constant:'1000'}}})};
  assert.equal((await verify(contract(),changed)).status,'violated');
  assert.throws(()=>createObligationIR(contract(),{...l,cases:[],boxes:[],presence:[],checks:[]}),/case/i);
  const c=contract();
  assert.throws(()=>createObligationIR({...c,profile:{...c.profile,boxSizing:'content-box'}},l),/ContractIR/);
});

test('solver failure and an empty serialized input domain cannot become success',async()=>{
  const o=createObligationIR(contract(),layout());
  const brokenAPI={Context:class {constructor(){throw new Error('solver unavailable');}}};
  const result=await verifyObligationIR(o,brokenAPI);
  assert.equal(result.status,'unknown');assert.match(result.proof.diagnostics.at(-1).message,/solver unavailable/);
  const empty={...o,coverage:{...o.coverage,domain:o.coverage.domain+'(assert (< width 0))\n'}};
  assert.equal((await verifyObligationIR(empty,api)).status,'unknown');
});

test('real dynamic and platform cases are all checked; unbounded state stays Unknown',async()=>{
  const source='client component C(){state show=true;<main class="row">on click {show=false;}<Show when={show} fallback={<div class="wide"/>}><div class="cell"/></Show></main>}';
  const options={css:css+'.wide{min-width:140px;height:40px}',viewport:{min:80,max:640,height:{min:40,max:640}},scrollbars:[{name:'overlay',inlineSize:0,blockSize:0},{name:'classic',inlineSize:15,blockSize:15}]};
  const l=createLayoutIR(analyzeLayout(requireIR(compile(source)),options));
  assert.equal(l.cases.length,4);
  assert.equal((await verify(contract(160,40,'C'),l)).status,'violated');
  assert.equal((await verify(contract(560,40,'C'),l)).status,'verified');
  const hole={...l,boxes:l.boxes.filter(box=>box.scrollbarProfile!=='classic')};
  assert.equal((await verify(contract(560,40,'C'),hole)).status,'unknown');
  const growing='client component C(){state items=[1];<main class="row">on click {items=items.concat([2]);}<For each={items}>{(item) => <Fragment key={item}><div class="cell"/></Fragment>}</For></main>}';
  const unbounded=createLayoutIR(analyzeLayout(requireIR(compile(growing)),options));
  assert.equal(unbounded.boxes.length,0,'diagnostic placeholder boxes are not actual implementation cases');
  const result=await verify(contract(160,40,'C'),unbounded);
  assert.equal(result.status,'unknown');
  assert.ok(result.proof.diagnostics.some(d=>d.code==='U_LAYOUT_CARDINALITY'));
});

test('unresolved geometry, weakened overflow policies and unsupported profiles remain explicit',async()=>{
  const unknown=await verify(contract(),layout(css+'.cell{width:var(--missing)}'));
  assert.equal(unknown.status,'unknown');assert.ok(unknown.proof.diagnostics.length);
  const clipped=layout(css+'.row{overflow:hidden}',80,40,{boxes:{'.row':{overflow:'clip'}}});
  assert.equal((await verify(contract(),clipped)).status,'unknown');
  const contentBox=layout(css+'.cell{box-sizing:content-box}');
  assert.equal((await verify(contract(),contentBox)).status,'violated');
});

test('replacement may weaken requirements, but may not strengthen them',async()=>{
  const old=contract(160),weaker=contract(120),stronger=contract(184);
  assert.equal((await verifyObligationIR(createRefinementObligationIR(old,weaker),api)).status,'verified');
  const result=await verifyObligationIR(createRefinementObligationIR(old,stronger),api);
  assert.equal(result.status,'violated');assert.equal(result.proof.witness.code,'E_LAYOUT_REFINEMENT');
  assert.throws(()=>createObligationIR(contract(160,40,'Other'),layout()),/component/i);
});

test('independent reference semantics agrees with CSS extraction and detects broken implementations',async()=>{
  const spec=await readFile(new URL('../models/layout_contract/contract.smt2',import.meta.url),'utf8');
  for(const [sheet,expected] of [
    [css,'(four-fit width height 0 40)'],
    [css+'.row{column-gap:8px}','(four-fit width height 8 40)'],
    [css+'@media(width < 160px){.row{grid-template-columns:repeat(2,minmax(0,1fr))}}','(responsive-fit width height)'],
  ]) {
    const obligations=createObligationIR(contract(80,40),layout(sheet)).model;
    const actual=`(or ${obligations.obligations.map(o=>`(and ${o.domain} ${o.failure})`).join(' ')})`;
    const ctx=new api.Context('contract_reference'),solver=new ctx.Solver();
    try {
      solver.fromString(obligations.domain+spec+`(assert (xor ${actual} (not ${expected})))`);
      assert.equal(await solver.check(),'unsat');
    } finally {solver.release();}
  }
  const child=contract(48,40,'Cell');
  const composed=createObligationIR(contract(80,40),layout(),{children:Array.from({length:4},(_,i)=>({path:`Four/${i}`,contract:child}))}).model;
  const composedBad=`(or ${composed.obligations.map(o=>`(and ${o.domain} ${o.failure})`).join(' ')})`;
  const compositionContext=new api.Context('composition_reference'),compositionSolver=new compositionContext.Solver();
  try {
    compositionSolver.fromString(composed.domain+spec+`(assert (xor ${composedBad} (not (and (four-fit width height 0 40) (four-child-inputs width 48 40)))))`);
    assert.equal(await compositionSolver.check(),'unsat');
  } finally {compositionSolver.release();}
  const mutated=createObligationIR(contract(80,40),layout(css.replace('min-width:40px','min-width:41px'))).model;
  const actual=`(or ${mutated.obligations.map(o=>`(and ${o.domain} ${o.failure})`).join(' ')})`;
  const ctx=new api.Context('contract_mutant'),solver=new ctx.Solver();
  try {
    solver.fromString(mutated.domain+spec+`(assert (xor ${actual} (not (four-fit width height 0 40))))`);
    assert.equal(await solver.check(),'sat');
  } finally {solver.release();}
});
