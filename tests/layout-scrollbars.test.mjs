import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
const ir=requireIR(compile('component C(){<main class="scroll"><div class="cell"></div></main>}'));
const profiles=[{name:'overlay',inlineSize:0,blockSize:0},{name:'classic',inlineSize:15,blockSize:15}];
const base='*{box-sizing:border-box;margin:0}.scroll{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:300px;block-size:100px;overflow-y:auto;scrollbar-gutter:stable}.cell{min-width:100px}';
const run=(css='',options={})=>analyzeLayout(ir,{css:base+css,viewport:{min:100,max:200,height:{min:200,max:400}},boxes:{'.scroll':{overflowBlock:'scroll'}},scrollbars:profiles,...options});

test('scrollbar width reduces grid space, and every declared platform profile is checked',()=>{
  const report=run();
  assert.equal(report.status,'violated',JSON.stringify(report.diagnostics));
  const failure=report.diagnostics.find(d=>d.code==='E_LAYOUT_ITEM_SIZE' && d.axis==='inline');
  assert.equal(failure.scrollbarProfile,'classic');
  assert.equal(failure.range.maxExact,'115');
  assert.equal(run('',{viewport:{min:115,max:300,height:{min:200,max:400}}}).status,'verified');
  assert.equal(run('',{scrollbars:[profiles[0]]}).status,'verified');
});
test('stable both-edges reserves two inline gutters; horizontal scrollbars consume height',()=>{
  assert.equal(run('.scroll{scrollbar-gutter:stable both-edges}').diagnostics.find(d=>d.code==='E_LAYOUT_ITEM_SIZE').range.maxExact,'130');
  const report=run('.scroll{overflow:scroll;grid-template-rows:minmax(0,1fr)}.cell{block-size:90px}',{viewport:{min:200,max:200,height:{min:200,max:200}},boxes:{'.scroll':{overflow:'scroll'}}});
  assert.equal(report.status,'violated');
  assert.ok(report.diagnostics.some(d=>d.axis==='block' && d.scrollbarProfile==='classic'));
});
test('auto checks coupled horizontal and vertical visibility, not just the initial scrollbar',()=>{
  const report=run('.scroll{overflow:auto;scrollbar-gutter:auto;grid-template-rows:minmax(0,1fr)}',{viewport:{min:115,max:200,height:{min:200,max:400}},boxes:{'.scroll':{overflow:'scroll',overflowBlock:'scroll'}}});
  assert.equal(report.status,'verified',JSON.stringify(report.diagnostics));
  const states=report.scrollbars.filter(s=>s.box==='.scroll' && s.scrollbarProfile==='classic');
  assert.deepEqual(new Set(states.map(s=>`${s.inlineSize}/${s.blockSize}`)),new Set(['0/0','15/0','0/15','15/15']));
});
test('missing native metrics stay unknown; scrollbar-width none has exact zero geometry',()=>{
  assert.equal(run('',{scrollbars:undefined}).status,'unknown');
  assert.equal(run('.scroll{scrollbar-width:none}',{scrollbars:undefined}).status,'verified');
});
test('content-box edges and gutters are charged separately',()=>{
  const report=run('.scroll{box-sizing:content-box;width:100px;padding:2px;border:1px solid black}',{viewport:{min:200,max:200,height:{min:200,max:400}}});
  assert.equal(report.status,'violated');
  const size=report.sizes.find(s=>s.box==='.scroll' && s.scrollbarProfile==='classic');
  assert.equal(size.inlineSize.constant,'106');
  assert.equal(size.contentInlineSize.constant,'85');
});

test('container queries use the reduced content width, including boundaries between profiles',()=>{
  const report=run('.scroll{container:Panel / inline-size}.cell{min-width:0}@container Panel (width >= 100px){.cell{min-width:110px}}');
  assert.equal(report.status,'violated');
  const classic=report.diagnostics.find(d=>d.scrollbarProfile==='classic');
  assert.equal(classic.range.minExact,'115');assert.equal(classic.range.maxExact,'125');
});

test('thin metrics and automatic block heights remain explicit',()=>{
  assert.equal(run('.scroll{scrollbar-width:thin}').status,'unknown');
  const report=run('.scroll{scrollbar-width:thin}',{scrollbars:[{name:'thin',inlineSize:15,blockSize:15,thinInlineSize:10,thinBlockSize:10}]});
  assert.equal(report.diagnostics.find(d=>d.code==='E_LAYOUT_ITEM_SIZE').range.maxExact,'110');
  const auto=run('.scroll{block-size:auto;overflow-x:scroll}',{viewport:{min:200,max:200,height:{min:400,max:400}}});
  assert.equal(auto.sizes.find(s=>s.box==='.scroll' && s.scrollbarProfile==='classic').blockSize.constant,'315');
});

test('document-root gutters reduce the viewport once; body propagation fails closed',()=>{
  const node=tag=>({kind:'element',tag,attributes:[],children:[],handlers:[]});
  const html=node('html'),body=node('body');html.children=[body];body.children=[ir.components[0].root];
  const documentIR={...ir,components:[{...ir.components[0],root:html}]};
  const css='html,body{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);width:100%;height:100%;margin:0}'+base+'html{overflow-y:scroll}';
  const opts={css,viewport:{min:200,max:200,height:{min:400,max:400}},scrollbars:[profiles[1]],boxes:{'.scroll':{overflowBlock:'scroll'}}};
  const report=analyzeLayout(documentIR,opts);
  assert.equal(report.status,'verified',JSON.stringify(report.diagnostics));
  assert.equal(report.sizes.find(row=>row.box.startsWith('html@')).inlineSize.constant,'-15');
  const unknown=analyzeLayout(documentIR,{...opts,css:css.replace('html{overflow-y:scroll}','body{overflow:auto}')});
  assert.equal(unknown.status,'unknown');
  assert.ok(unknown.diagnostics.some(d=>d.code==='U_LAYOUT_SCROLLBAR'));
});
