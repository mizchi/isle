import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {init,killThreads} from 'z3-solver';
import {compile,requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {declaredLayoutOptions} from '../lib/layout-declarations.mjs';
import {createLayoutIR,createObligationIR,createDeclaredObligations,verifyObligationIR} from '../lib/layout-contract.mjs';

const api=await init();after(()=>killThreads(api.em));
const requirements=(min=120)=>`requires{inline-size:${min}px..240px;block-size:80px..240px;}`;
function panel({absolute=true,privateOverlay=false,min=120}={}) {
  return `component Panel(){layout ${privateOverlay ? 'PositionedGrid' : 'SafeGrid'}{${requirements(min)}
    ${privateOverlay ? 'space inner=".inner";overlay ".knob" within inner;' : ''}}
    <aside class="panel"><style>
      *{box-sizing:border-box;margin:0;padding:0}
      .panel{${absolute ? 'position:absolute;right:16px;bottom:16px;' : 'position:relative;'}display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);width:160px;height:120px;padding:8px;border:2px solid black}
      .inner{position:relative;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);min-width:0;min-height:0}
      .knob{position:absolute;right:8px;bottom:8px;width:24px;height:24px}
    </style><div class="inner">${privateOverlay ? '<div class="knob"/>' : ''}</div></aside>}`;
}
function parent(child=panel(),{body='<div class="surface"/><Panel/>',sheet='',overlay='overlay ".panel" within map;',safe=false}={}) {
  return child+`component Map(){layout ${safe ? 'SafeGrid' : 'PositionedGrid'}{
    requires{inline-size:320px..960px;block-size:240px..720px;}
    ${safe ? '' : `space map=".map";${overlay}`}}
    <main class="map"><style>*{box-sizing:border-box;margin:0;padding:0}
      .map{position:relative;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:120px;grid-auto-rows:120px;height:240px;padding:16px;border:2px solid black}
      .surface{min-width:0;min-height:0}
      .control{position:absolute;left:16px;top:16px;width:40px;height:40px}
      ${sheet}</style>${body}</main>}`;
}
async function check(source) {
  const ir=requireIR(compile(source));
  const report=analyzeLayout(ir,declaredLayoutOptions(ir,{component:'Map',css:''}));
  const obligations=createDeclaredObligations(createLayoutIR(report)),proofs=[];
  for(const obligation of obligations) proofs.push(await verifyObligationIR(obligation,api));
  return {ir,report,obligations,proofs,parent:proofs.find(p=>p.contract.component==='Map')};
}
const allVerified=result=>assert.ok(result.proofs.every(p=>p.status==='verified'),JSON.stringify(result.proofs.map(p=>({component:p.contract.component,status:p.status,witness:p.proof.witness}))));

test('a pre-sized absolute child receives its used border rectangle, separately from its containing block',async()=>{
  const result=await check(parent());allVerified(result);
  const box=result.report.sizes.find(row=>row.position==='absolute');
  assert.deepEqual(box.allocatedInlineSize,{coefficient:'0',constant:'160'});
  assert.deepEqual(box.allocatedBlockSize,{coefficient:'0',constant:'120'});
  assert.deepEqual(box.containingBlock.inline,{coefficient:'1',constant:'-4'});
  assert.deepEqual(result.parent.dependencies,[{component:'Panel',path:'Map/1'}]);
  assert.equal(result.proofs.find(p=>p.contract.component==='Panel').placementTransfers[0].allocation,'used-border-box');
});

test('a parent proof includes the child requirements and private implementation',async()=>{
  const needsMore=await check(parent(panel({min:161})));
  assert.equal(needsMore.parent.status,'violated');
  assert.equal(needsMore.parent.proof.witness.code,'E_LAYOUT_CHILD_REQUIRES');
  const broken=await check(parent(panel().replace('min-width:0','min-width:200px')));
  assert.equal(broken.parent.status,'violated');
  assert.ok(broken.proofs.some(p=>p.contract.component==='Panel' && p.status==='violated'));
  const wrongProfile=panel({privateOverlay:true}).replace('layout PositionedGrid','layout SafeGrid').replace('space inner=".inner";overlay ".knob" within inner;','');
  const invalid=await check(parent(wrongProfile));
  assert.equal(invalid.report.status,'verified');
  assert.equal(invalid.parent.status,'violated');
  assert.equal(invalid.parent.proof.witness.code,'E_LAYOUT_PROFILE');
});

test('an allocation cannot be inflated in LayoutIR to manufacture child conformance',async()=>{
  const result=await check(parent(panel({min:161})));
  const layout=createLayoutIR(result.report);
  const changed={...layout,boxes:layout.boxes.map(box=>box.path!=='Map/1' ? box : {...box,allocated:{...box.allocated,inline:{coefficient:'0',constant:'200'}}})};
  const [obligation]=createDeclaredObligations(changed),proof=await verifyObligationIR(obligation,api);
  assert.equal(proof.status,'violated');
  assert.equal(proof.proof.witness.code,'E_LAYOUT_ABSOLUTE_ALLOCATION');
});

test('private child coordinate spaces compose through an explicit parent overlay binding',async()=>{
  const result=await check(parent(panel({privateOverlay:true})));allVerified(result);
  assert.equal(result.proofs.length,2);
  const knob=result.report.sizes.find(row=>row.containingBlock?.path==='Map/1/0');
  assert.ok(knob,'private overlay keeps its own containing block');
});

test('SafeGrid admits a checked in-flow child with a private PositionedGrid region',async()=>{
  const result=await check(parent(panel({absolute:false,privateOverlay:true}),{safe:true,body:'<Panel/>',sheet:'.map{grid-template-columns:160px;grid-template-rows:120px}'}));
  allVerified(result);
});

test('peer separation includes exposed component roots and keeps private overlays private',async()=>{
  const result=await check(parent(panel({privateOverlay:true}),{
    body:'<div class="surface"/><Panel/><div class="control"/>',
    overlay:'overlay ".panel" within map;overlay ".control" within map;',
    sheet:'.control{left:auto;top:auto;right:16px;bottom:16px}',
  }));
  assert.equal(result.parent.status,'violated');
  assert.equal(result.parent.proof.witness.code,'E_LAYOUT_OVERLAY_OVERLAP');
});

test('a child proof also checks its parent placement transfer rather than assuming the named space',async()=>{
  const result=await check(parent(panel(),{body:'<div class="frame"><Panel/></div>',sheet:'.map{grid-template-rows:180px}.frame{position:relative;display:grid;width:220px;height:180px}'}));
  assert.equal(result.report.status,'verified');
  for(const proof of result.proofs) {
    assert.equal(proof.status,'violated');
    assert.equal(proof.proof.witness.code,'E_LAYOUT_SPACE_BINDING');
  }
});

test('deleting either contract or the caller overlay cannot silently authorize an absolute child',async()=>{
  const undeclared=panel().replace(/layout SafeGrid\{requires\{[^}]*\}\s*\}/,'');
  for(const input of [parent(undeclared),parent(panel(),{overlay:'overlay ".control" within map;',body:'<div class="control"/><Panel/>'})]) {
    const result=await check(input);
    assert.notEqual(result.parent.status,'verified');
  }
});

test('finite Show cases retain the matching child boundary and do not borrow a native fallback',async()=>{
  const input=parent(panel(),{body:'<div class="surface"/><Show when={visible}><Panel/></Show>'})
    .replace('component Map(){','client component Map(){state visible=true;event hide(e:EventSnapshot<MouseEvent>){visible=false;}')
    .replace('<main class="map"','<main on:click={hide} class="map"');
  const result=await check(input);allVerified(result);
  assert.equal(result.report.structure.variants.length,2);
  const fallback=input.replace('<Show when={visible}>','<Show when={visible} fallback={<div class="panel"/>}>');
  const bad=await check(fallback);
  assert.notEqual(bad.parent.status,'verified');
});

test('percentage allocations and responsive child sizing retain fractional counterexamples',async()=>{
  const half=panel().replace('width:160px','width:50%');
  const broken=await check(parent(half));
  assert.equal(broken.parent.status,'violated');
  assert.equal(broken.parent.proof.witness.code,'E_LAYOUT_CHILD_REQUIRES');
  assert.ok(broken.parent.proof.witness.viewport>484);
  const good=half.replace('</style>','@media(width > 484px){.panel{width:240px}}</style>');
  allVerified(await check(parent(good)));
  const hole=await check(parent(good.replace('width > 484px','width > 485px')));
  assert.equal(hole.parent.status,'violated');
  assert.ok(hole.parent.proof.witness.viewport>484 && hole.parent.proof.witness.viewport<=485);
});

test('an explicit API parent contract provides the same checked placement context as source syntax',async()=>{
  const input=parent(),authored=requireIR(compile(input));
  const root=authored.components.find(c=>c.name==='Map'),span=root.layout.source;
  const without=input.slice(0,span.start)+input.slice(span.end);
  const ir=requireIR(compile(without));
  const report=analyzeLayout(ir,{component:'Map',css:'',viewport:{min:320,max:960,height:{min:240,max:720}}});
  const layout=createLayoutIR(report),before=JSON.stringify(layout);
  const proof=await verifyObligationIR(createObligationIR(root.layout.contract,layout),api);
  assert.equal(proof.status,'verified');
  assert.equal(JSON.stringify(layout),before,'Adding an API interface must not alter CSS facts');
});
