import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {init,killThreads} from 'z3-solver';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compile as browserCompile,compilePreview} from '../lib/compiler-browser.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {createLayoutIR,createDeclaredObligations,verifyObligationIR} from '../lib/layout-contract.mjs';
import {declaredLayoutOptions} from '../lib/layout-declarations.mjs';

const api=await init();after(()=>killThreads(api.em));
const declaration=(min=160,height=40)=>`layout SafeGrid { requires { inline-size: ${min}px..640px; block-size: ${height}px..640px; } ensures { overflow-inline: fit; overflow-block: fit; } }`;
const style='<style>*{box-sizing:border-box;margin:0;padding:0}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:40px}.cell{min-width:40px;height:40px}</style>';
const source=`component Four(){${declaration()}<main class="row">${style}<div class="cell"/><div class="cell"/><div class="cell"/><div class="cell"/></main>}`;
async function check(input,options={}) {
  const ir=requireIR(compile(input));
  const report=analyzeLayout(ir,declaredLayoutOptions(ir,{component:ir.components.at(-1).name,css:'',...options}));
  return Promise.all(createDeclaredObligations(createLayoutIR(report)).map(o=>verifyObligationIR(o,api)));
}

test('layout declarations lower to the same ContractIR in Node and browser, with authored spans',()=>{
  const result=compile(source);assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(browserCompile(source),result);
  const component=result.ir.components[0];
  assert.equal(component.layout.contract.profile.id,'safe-grid/1');
  assert.equal(source.slice(component.layout.source.start,component.layout.source.end),declaration());
  assert.equal(component.root.layoutContracts[0].contract.component,'Four');
  const plain=compilePreview(source.replace(declaration(),'')),checked=compilePreview(source);
  assert.equal(checked.ok,true);assert.equal(checked.preview.html,plain.preview.html);
  assert.deepEqual(checked.preview.modules,plain.preview.modules);
  assert.doesNotMatch(checked.preview.html,/SafeGrid|requires|layout-contract/);
});

test('layout grammar rejects unsupported profiles, duplicate declarations, fields, bounds and effects',()=>{
  for(const text of [
    declaration().replace('SafeGrid','AnyCSS'),
    declaration()+declaration(),
    declaration().replace('block-size:','inline-size:'),
    declaration().replace('160px..640px','640px..160px'),
    declaration().replace('160px','10rem'),
    declaration().replace('overflow-inline: fit','overflow-inline: clip'),
    declaration().replace('requires {','requires { call();'),
    declaration().replace('160px','width()'),
    declaration().replace('block-size: 40px..640px;',''),
    declaration().replace('SafeGrid {','SafeGrid { /*'+'x'.repeat(16384)+'*/'),
  ]) {
    const result=compile(`component Four(){${text}<main/>}`);
    assert.equal(result.ok,false,text);assert.match(result.diagnostics[0].code,/^E_LAYOUT_/);
    assert.ok(result.diagnostics[0].start>=17);
  }
});

test('contracts coexist with state, derives, events, CSS, comments and Unicode diagnostics',()=>{
  const input=`// 日本語🌊\nclient component C(){state n=0;${declaration(40)} derive doubled=n*2;event add(e:EventSnapshot<MouseEvent>){n+=1;}<button type="button" on:click={add}>{doubled}</button>}`;
  const result=compile(input);assert.equal(result.ok,true);
  const handler=result.ir.components[0].root.handlers[0];
  assert.match(input.slice(handler.source.start,handler.source.end),/^event add/);
  assert.equal(input.slice(handler.binding.start,handler.binding.end).trim(),'on:click={add}');
  const plain=compilePreview(input.replace(declaration(40),'')),checked=compilePreview(input);
  assert.deepEqual(checked.preview.modules,plain.preview.modules);
  const bad=input.replace('inline-size: 40px','inline-size: auto'),failure=compile(bad);
  assert.equal(failure.ok,false);assert.ok(bad.slice(failure.diagnostics[0].start).startsWith('auto'));
  const omitted=source.replace(' ensures { overflow-inline: fit; overflow-block: fit; }','');
  assert.equal(compile(omitted).ok,true);
});

test('declared instances validate actual input ranges rather than assuming requires',async()=>{
  assert.ok((await check(source)).every(p=>p.status==='verified'));
  const tooSmall=await check(source,{viewport:{min:120,max:640,height:{min:40,max:640}}});
  assert.ok(tooSmall.some(p=>p.status==='violated'));
  assert.ok(tooSmall.some(p=>p.proof.witness.code==='E_LAYOUT_CHILD_REQUIRES'));
  const fitting=`component Four(){${declaration()}<main class="row">${style.replace('repeat(4,','repeat(1,')}<div class="cell"/></main>}`;
  const invalidInput=await check(fitting,{viewport:{min:120,max:640,height:{min:40,max:640}}});
  assert.equal(invalidInput[0].status,'violated');assert.equal(invalidInput[0].proof.witness.code,'E_LAYOUT_CHILD_REQUIRES');
  const broken=await check(source.replace('min-width:40px','min-width:41px'));
  assert.ok(broken.some(p=>p.status==='violated'));
});

test('pure, alias and client component roots retain automatic child contracts',async()=>{
  for(const side of ['', 'client ']) {
    const child=`${side}component Cell(){${declaration(48)}<div class="cell"><style>*{box-sizing:border-box;margin:0;padding:0}.cell{min-width:40px;height:40px}</style></div>}`;
    const alias=`${side}component Alias(){<Cell/>}`;
    const parent=`server component Parent(){${declaration()}<main class="row">${style}<Alias/><Alias/><Alias/><Alias/></main>}`;
    const input=child+alias+parent,compiled=requireIR(compile(input));
    const report=analyzeLayout(compiled,declaredLayoutOptions(compiled,{component:'Parent',css:''}));
    assert.ok(report.layoutBindings.some(b=>b.declaration.contract.component==='Cell'));
    const proofs=await check(input);
    assert.ok(proofs.some(p=>p.contract.component==='Cell' && p.status==='violated'));
    const wider=await check(input,{viewport:{min:192,max:640,height:{min:40,max:640}}});
    assert.ok(wider.every(p=>p.status==='verified'),JSON.stringify(wider));
  }
});

test('conditional component calls at the same path are checked only in their own cases',async()=>{
  const child=name=>`component ${name}(){${declaration(name==='Wide' ? 80 : 40)}<div class="cell"><style>*{box-sizing:border-box;margin:0;padding:0}.cell{height:40px;min-width:40px}</style></div>}`;
  const input=child('Wide')+child('Small')+`client component Parent(){state wide=false;${declaration(320)}<main class="row" on:click={flip}>${style}<Show when={wide} fallback={<Small/>}><Wide/></Show></main>}`.replace('<main','event flip(e:EventSnapshot<MouseEvent>){wide=!wide;}<main');
  assert.ok((await check(input)).every(p=>p.status==='verified'));
});

test('bounded repeated declarations keep only cases where each native instance exists',async()=>{
  const child=`component Cell(){${declaration(40)}<div class="cell"><style>*{box-sizing:border-box;margin:0;padding:0}.cell{height:40px;min-width:40px}</style></div>}`;
  const input=child+`client component Parent(){state items=[0];${declaration(160,160)}
    event add(e:EventSnapshot<MouseEvent>){items=items.length<4 ? items.concat([items.length]) : items;}
    event clear(e:EventSnapshot<MouseEvent>){items=[];}
    <main class="row" on:click={add} on:dblclick={clear}>${style}<For each={items}>{(item)=><Fragment key={item}><Cell/></Fragment>}</For></main>}`;
  const proofs=await check(input);
  assert.equal(proofs.filter(p=>p.contract.component==='Cell').length,4);
  assert.ok(proofs.every(p=>p.status==='verified'),JSON.stringify(proofs));
});
