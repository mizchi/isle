import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {parseLayoutCSS,computeStyle} from '../lib/layout/css.mjs';

const ir=requireIR(compile('component Panel(){<main class="panel"><p class="copy">Content</p></main>}'));
const prefix='*{box-sizing:border-box}.panel{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:24px;block-size:24px}.copy{block-size:24px;';
const run=declarations=>analyzeLayout(ir,{css:prefix+declarations+'}',viewport:{min:320,max:320,height:{min:24,max:24}},boxes:{'.copy':{minInlineSize:100,minBlockSize:24}}});

test('invalid margin shorthand arity cannot manufacture a zero-margin proof',()=>{
  for(const declaration of ['margin:0 0 0 0 0','margin-inline:0 0 0','margin-block:0 0 0','margin-top:0 0','margin-inline-start:0 0','margin:']) {
    const report=run(declaration);
    assert.equal(report.status,'unknown',declaration);
    assert.ok(report.diagnostics.some(d=>d.code==='U_LAYOUT_CSS'),declaration);
  }
  assert.equal(run('--m:0 0 0 0 0;margin:var(--m)').status,'unknown');
  for(const value of ['0','0 0','0 0 0','0 0 0 0']) assert.equal(run('margin:'+value).status,'verified',value);
});

test('supported shorthands compete per longhand in cascade order',()=>{
  for(const [css,expected] of [
    ['padding-left:24px;padding:0',{'padding-left':'0'}],
    ['padding:0;padding-left:24px',{'padding-left':'24px'}],
    ['padding-inline-start:24px;padding:0',{'padding-left':'0'}],
    ['padding-left:24px!important;padding:0',{'padding-left':'24px'}],
    ['column-gap:20px;gap:4px',{'row-gap':'4px','column-gap':'4px'}],
    ['container-type:inline-size;container:Panel',{'container-type':'normal','container-name':'Panel'}],
    ['border:4px solid red;border:0',{'border-left':'0'}],
  ]) {
    const errors=[];
    const {rules}=parseLayoutCSS([{file:'shorthand.css',css:'.box{'+css+'}'}],(...args)=>errors.push(args));
    assert.deepEqual(errors,[]);
    const style=computeStyle(rules,{tag:'div',classes:['box']},()=>true);
    for(const [property,value] of Object.entries(expected)) assert.equal(style[property],value,css);
  }
});
