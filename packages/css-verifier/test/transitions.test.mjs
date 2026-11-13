import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {createNoShiftContract,createTransitionIR,createTransitionObligation,verifyTransitionObligation} from '../src/transitions.mjs';
import {verifyNoShift} from '../src/transitions-node.mjs';

const viewport={min:320,max:960,height:{min:240,max:720}};
const html='<main class="page"><div class="content"></div><div class="action"></div></main>';
const base='*{box-sizing:border-box}.page{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.action{height:32px}';
const scene=(size,extra='',markup=html,changes={})=>analyzeHTML(markup,{name:'Page',viewport,css:base+`.content{height:${size}px}`+extra,...changes});
const contract=(path='Page/1')=>createNoShiftContract({name:'Load',targets:[{name:'action',before:path,after:path}]});
const check=(before,after,expected=contract())=>verifyNoShift(before,after,expected);

test('two fitting states can move a following box by 56px',async()=>{
  const before=scene(24),after=scene(80);
  assert.equal(before.status,'verified');assert.equal(after.status,'verified');
  const result=await check(before,after);
  assert.equal(result.status,'violated');
  assert.equal(result.change.target,'action');
  assert.equal(result.change.field,'blockStart');
  assert.equal(result.change.delta.exact,'56');
  assert.equal(result.change.before.exact,'32');
  assert.equal(result.change.after.exact,'88');
  const reverse=await check(after,before);
  assert.equal(reverse.status,'violated');
  assert.equal(reverse.change.delta.exact,'-56');
});

test('reservation preserves a sibling while dynamic content changes height',async()=>{
  const markup='<main class="page"><div class="slot"><div class="content"></div></div><div class="action"></div></main>';
  const extra='.slot{height:80px;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)}';
  const result=await check(scene(24,extra,markup),scene(80,extra,markup));
  assert.equal(result.status,'verified');
  assert.equal(result.coverage.status,'verified');
  assert.equal(result.proof.solver.result,'unsat');
});

test('a fixed outer rectangle does not certify an internal moving target',async()=>{
  const extra='.page{height:120px;align-content:start}';
  const before=scene(24,extra),after=scene(80,extra);
  assert.equal((await check(before,after,contract('Page'))).status,'verified');
  assert.equal((await check(before,after)).change.delta.exact,'56');
});

test('track starts account for padding, borders, gaps, nested grids and spans',()=>{
  const report=scene(24,'.page{padding:10px;border:2px solid black}');
  const action=report.sizes.find(row=>row.path==='Page/1');
  assert.equal(action.rect.inlineStart.constant,'12');
  assert.equal(action.rect.blockStart.constant,'44');
  const nested=scene(24,'.page{padding:10px;border:2px solid black}.content{display:grid;grid-template-columns:40px 50px;gap:3px;padding:4px;height:40px}.a{grid-column:2;height:10px}',
    '<main class="page"><div class="content"><div class="a"></div></div><div class="action"></div></main>');
  assert.equal(nested.status,'verified');
  assert.equal(nested.sizes.find(row=>row.path==='Page/0/0').rect.inlineStart.constant,'59');
});

test('absolute coordinates include the actual containing block padding origin',async()=>{
  const markup='<main class="page"><div class="content"><div class="target"></div></div></main>';
  const extra='.page{padding:10px;border:2px solid black}.content{position:relative;display:grid;padding:4px;border:3px solid black;height:100px}.target{position:absolute;left:5px;top:7px;width:20px;height:20px}';
  const before=scene(24,extra,markup),after=scene(24,extra.replace('left:5px','left:6px'),markup);
  assert.equal(before.status,'verified');
  const rect=before.sizes.find(row=>row.path==='Page/0/0').rect;
  assert.equal(rect.inlineStart.constant,'20');assert.equal(rect.blockStart.constant,'22');
  assert.equal((await check(before,after,contract('Page/0/0'))).change.delta.exact,'1');
});

test('a fractional responsive change is found in an interval missed by samples',async()=>{
  const after=scene(24,'@media(width >= 600px) and (width < 600.5px){.content{height:24.25px}}');
  const result=await check(scene(24),after);
  assert.equal(result.status,'violated');
  assert.ok(result.proof.witness.viewport>=600 && result.proof.witness.viewport<600.5);
  assert.equal(result.change.delta.exact,'1/4');
});

test('an equality only at one viewport does not prove a continuous domain',async()=>{
  const before=scene(24,'.action{width:160px}');
  const after=scene(24,'.action{width:50%}');
  const result=await check(before,after);
  assert.equal(result.status,'violated');
  assert.equal(result.change.field,'inlineSize');
  assert.notEqual(result.change.delta.exact,'0');
});

test('disappearance is a presence violation, not a vacuous equality',async()=>{
  const result=await check(scene(24),scene(24,'.action{display:none}'));
  assert.equal(result.status,'violated');
  assert.equal(result.proof.witness.code,'E_NOSHIFT_PRESENCE');
});

test('a hidden target at just one responsive boundary cannot escape coverage',async()=>{
  const result=await check(scene(24),scene(24,'@media(width = 600px){.action{display:none}}'));
  assert.equal(result.status,'violated');
  assert.equal(result.proof.witness.code,'E_NOSHIFT_PRESENCE');
  assert.equal(result.proof.witness.viewportExact,'600');
});

test('container-query conditions remain correlated to the shared viewport',async()=>{
  const extra='.page{padding:10px;container-type:inline-size}';
  const result=await check(scene(24,extra),scene(24,extra+'@container(width >= 580px) and (width < 580.5px){.content{height:24.25px}}'));
  assert.equal(result.status,'violated');
  assert.ok(result.proof.witness.viewport>=600 && result.proof.witness.viewport<600.5);
  assert.equal(result.change.delta.exact,'1/4');
});

test('missing mappings, unsupported coordinates and unequal domains remain Unknown',async()=>{
  const before=scene(24);
  for(const after of [scene(24,'','<main class="page"><div class="content"></div></main>'),
    scene(24,'.page{overflow:hidden}'),scene(24,'',html,{viewport:{...viewport,min:400}}),
    scene(24,'.action{transform:translateY(1px)}'),scene(24,'',html,{block:false,viewport:{min:320,max:960}})]) {
    const result=await check(before,after);
    assert.equal(result.status,'unknown');
    assert.ok(result.proof.diagnostics.some(d=>d.severity==='unknown'));
  }
});

test('removing a rectangle cannot silently discharge the transition contract',async()=>{
  const before=scene(24),after=structuredClone(before);
  delete after.sizes.find(row=>row.path==='Page/1').rect;
  assert.equal((await check(before,after)).status,'unknown');
});

test('unmatched finite cases and shared subgrid coordinates remain Unknown',async()=>{
  const before=scene(24),ambiguous=structuredClone(before);
  ambiguous.structure={complete:true,variants:[{id:0,choices:[]},{id:1,choices:[]}],bounds:[]};
  assert.equal((await check(before,ambiguous)).status,'unknown');
  const markup='<main class="page"><div class="content"><div class="action"></div></div></main>';
  const extra='.page{grid-template-rows:100px}.content{display:grid;grid-template-columns:subgrid}';
  const subgrid=scene(100,extra,markup);
  assert.equal(subgrid.status,'verified');
  assert.equal((await check(subgrid,subgrid,contract('Page/0/0'))).status,'unknown');
});

test('a solver failure cannot certify an endpoint relation',async()=>{
  const report=scene(24),obligation=createTransitionObligation(contract(),createTransitionIR({before:report,after:report}));
  const api={Context:class {constructor(){throw new Error('simulated solver failure');}}};
  const result=await verifyTransitionObligation(obligation,api);
  assert.equal(result.status,'unknown');
  assert.ok(result.proof.diagnostics.some(d=>d.code==='U_LAYOUT_SOLVER'));
});

test('contracts do not alter extracted facts, and transition IR is immutable JSON',()=>{
  const before=scene(24),after=scene(80),snapshot=JSON.stringify([before,after]);
  const transition=createTransitionIR({before,after}),expected=contract();
  const obligation=createTransitionObligation(expected,transition);
  assert.equal(JSON.stringify([before,after]),snapshot);
  assert.equal(obligation.kind,'transition-obligation');
  assert.ok(Object.isFrozen(obligation));
  assert.deepEqual(JSON.parse(JSON.stringify(transition)),transition);
  assert.throws(()=>createNoShiftContract({name:'Empty',targets:[]}),TypeError);
  assert.throws(()=>createNoShiftContract({name:'Extra',targets:[{name:'x',before:'Page',after:'Page'}],tolerance:1}),TypeError);
});
