import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLayout} from '../src/index.mjs';
import {analyzeHTML} from '../src/html.mjs';
import {verifyLayoutReport} from '../src/layout-z3-node.mjs';

const tree = () => ({tag:'main', classes:['row'], children:Array.from({length:4}, () => ({tag:'div', classes:['cell']}))});
const css = '*{box-sizing:border-box}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.cell{min-width:40px}';
const options = {name:'Four', css, viewport:{min:160,max:1200}};
const freeze = value => {if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('a framework-independent immutable box tree verifies without compiler input', async () => {
  const input=freeze(tree()), before=JSON.stringify(input);
  const report=analyzeLayout(input,options);
  assert.equal(report.status,'verified');
  assert.equal(report.component,'Four');
  assert.equal(JSON.stringify(input),before);
  const proof=await verifyLayoutReport(report);
  assert.equal(proof.status,'verified');
  assert.equal(proof.solver.result,'unsat');
});

test('responsive analysis finds a fractional failing interval between viewport samples', () => {
  const report=analyzeLayout(tree(),{...options,viewport:{min:100,max:1200},css:css.replace('repeat(4','repeat(2')+'.row{gap:0.5px}@media(width >= 161px){.row{grid-template-columns:repeat(4,minmax(0,1fr))}}'});
  assert.equal(report.status,'violated');
  assert.ok(report.diagnostics.some(d=>d.range?.minExact==='161' && d.range?.maxExact==='323/2' && !d.range.maxInclusive));
});

test('static HTML adapter produces the same geometry as an explicitly supplied tree', () => {
  const report=analyzeHTML('<main class="row">'+ '<div class="cell"></div>'.repeat(4)+'</main>',options);
  assert.deepEqual(report,analyzeLayout(tree(),options));
});

test('unsupported CSS and HTML effects remain Unknown instead of being ignored', () => {
  assert.equal(analyzeLayout(tree(),{...options,css:css+'.cell{transform:translateX(10px)}'}).status,'unknown');
  assert.equal(analyzeLayout(tree(),{...options,css:css+'.cell{float:left}'}).status,'violated');
  // An image without explicit CSS sizes has an intrinsic size the model does not compute; width/height attributes are presentational hints.
  for(const html of ['<main style="width:1em"></main>','<main hidden="until-found"></main>','<main class="row"><img class="cell" src="x" alt=""></main>','<main class="row"><img class="cell" src="x" alt="" width="10"></main>']) {
    assert.equal(analyzeHTML(html,options).status,'unknown',html);
  }
});

test('unbounded text stays Unknown; supplied intrinsic bounds remain explicit assumptions', () => {
  const input={tag:'div',classes:['text'],text:true};
  const config={name:'Text',css:'*{box-sizing:border-box}',viewport:{min:160,max:400}};
  assert.equal(analyzeLayout(input,config).status,'unknown');
  const bounded=analyzeLayout(input,{...config,boxes:{'.text':{minInlineSize:100}}});
  assert.equal(bounded.status,'verified');
  assert.ok(bounded.assumptions.some(a=>/trusted.*content-size bound/.test(a)));
});

test('neutral input rejects graphs, ambiguous paths and unsupported fields', () => {
  const cyclic={tag:'div',children:[]};cyclic.children.push(cyclic);
  const child={tag:'div'};
  for(const input of [cyclic,{tag:'div',children:[child,child]},{tag:'div',children:[{tag:'div',path:'same'},{tag:'div',path:'same'}]},{tag:'div',style:'width:1px'},{tag:'div',text:'not a boolean'}]) {
    assert.throws(()=>analyzeLayout(input,options),TypeError);
  }
  assert.throws(()=>analyzeHTML('<div></div><div></div>',options),/single root/i);
  assert.throws(()=>analyzeLayout(tree(),{...options,props:{}}),/options/i);
  assert.throws(()=>analyzeLayout(tree(),{...options,scrollbars:[]}),/profiles/i);
});

test('HTML whitespace is discarded only under collapsing CSS semantics', () => {
  assert.equal(analyzeHTML('<main>\n  <div></div>\n</main>',{...options,css:'*{box-sizing:border-box}main{display:grid;grid-template-columns:minmax(0,1fr)}'}).status,'verified');
  assert.equal(analyzeHTML('<main>\n  <div></div>\n</main>',{...options,css:'*{box-sizing:border-box}main{display:grid;grid-template-columns:minmax(0,1fr);white-space:pre}'}).status,'unknown');
  assert.equal(analyzeHTML('<div>&nbsp;</div>',options).status,'unknown');
});

test('HTML expansion is bounded before traversing deep or large inputs', () => {
  assert.throws(()=>analyzeHTML('<div>'.repeat(10000)+'</div>'.repeat(10000),options),/tree limit/i);
  assert.throws(()=>analyzeHTML('<main>'+'<div></div>'.repeat(2100)+'</main>',options),/tree limit/i);
});

test('scrollbar profiles are checked as independent cases through the generic API', () => {
  const report=analyzeLayout(tree(),{...options,scrollbars:[{name:'overlay',inlineSize:0,blockSize:0},{name:'classic',inlineSize:15,blockSize:15}]});
  assert.equal(report.status,'verified');
  assert.deepEqual(new Set(report.sizes.map(row=>row.scrollbarProfile)),new Set(['overlay','classic']));
});
