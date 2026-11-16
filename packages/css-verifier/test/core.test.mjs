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
  // An image without explicit CSS sizes has an intrinsic size the model does not compute. (Its width/height
  // attributes are modeled as presentational hints: img width="10" is checked, see the aspect-ratio tests.)
  for(const html of ['<main style="width:1em"></main>','<main hidden="until-found"></main>','<main class="row"><img class="cell" src="x" alt=""></main>']) {
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

test('a document taller than the viewport scrolls it: decided with a scrollbar profile, unreachable when the root clips', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const page = (css, scrollbars) => analyzeHTML('<html lang="en"><body><div class="page"><div class="c"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html{${g}}body{${g}}.page{${g}}.c{height:2000px}${css}`, viewport: {min: 320, max: 800, height: {min: 400, max: 900}}, ...(scrollbars ? {scrollbars} : {})});
  const overlay = [{name: 'overlay', inlineSize: 0, blockSize: 0}], classic = [{name: 'classic', inlineSize: 15, blockSize: 15}];
  assert.equal(page('', overlay).status, 'verified');
  // Without a profile the scrollbar's width is not known: Unknown.
  assert.match(page('').diagnostics[0].message, /declare scrollbar profiles/);
  // overflow-y: visible with a classic scrollbar: the page scrolls and the scrollbar narrows it, which is laid out
  // for an explicit html overflow-y: auto (the same in a browser): Unknown here, verified there.
  assert.equal(page('', classic).status, 'unknown');
  assert.match(page('', classic).diagnostics[0].message, /overflow-y: auto or scroll/);
  assert.equal(page('html{overflow-y:auto}', classic).status, 'verified');
  // A hidden root cannot scroll: content past the viewport is unreachable.
  assert.equal(page('html{overflow:hidden}', overlay).diagnostics[0].code, 'E_LAYOUT_ITEM_SIZE');
  // A page that fits needs no profile.
  assert.equal(page('.c{height:100px}').status, 'verified');
});

test('geometry-neutral properties are accepted; values that change breaking, shaping or containing blocks stay Unknown', () => {
  const run = decl => analyzeHTML('<div class="page"><div class="x"></div></div>', {name: 'P', css: `*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{min-height:0;${decl}}`, viewport: {min: 320, max: 800}}).status;
  // hyphens: auto acts only on text (a text-less box is verified; text: see hyphens.test.mjs).
  for (const decl of ['object-fit:cover', 'hyphens:auto', 'scroll-behavior:smooth', 'user-select:none', 'accent-color:#246', 'scroll-snap-type:x mandatory', '-webkit-font-smoothing:antialiased', 'overscroll-behavior-y:contain', 'word-break:normal', 'filter:none', 'contain:style', 'will-change:scroll-position', 'text-size-adjust:100%'])
    assert.equal(run(decl), 'verified', decl);
  for (const decl of ['word-break:break-all', 'font-variant-numeric:tabular-nums', 'filter:blur(2px)', 'contain:paint', 'will-change:transform', 'content-visibility:hidden', 'resize:both', 'mix-blend-mode:multiply'])
    assert.equal(run(decl), 'unknown', decl);
});

test('text-wrap-style: balance and pretty are Unknown only on wrapping text; white-space and text-wrap share the wrap mode', () => {
  const run = css => analyzeHTML('<div class="page"><p class="t">x</p></div>', {name: 'P', css: '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.t{line-height:20px}' + css, viewport: {min: 320, max: 800}, boxes: {'.t': {minInlineSize: 10, intrinsicBlockSize: 20}}}).status;
  assert.equal(run('.page{text-wrap-style:balance}.t{white-space:nowrap}'), 'verified'); // inherited, but the text is one line
  assert.equal(run('.page{text-wrap-style:balance}'), 'unknown');
  assert.equal(run('.t{text-wrap-style:pretty}'), 'unknown');
  assert.equal(run('.t{text-wrap-style:stable}'), 'verified');
  // The shorthand also writes the wrap mode white-space sets: the later or more specific one wins.
  assert.equal(run('.t{white-space:nowrap;text-wrap:balance}'), 'unknown'); // balance wins: the text wraps, under balance
  const wraps = css => analyzeHTML('<div class="page"><p class="t">x</p></div>', {name: 'P', css: '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.t{line-height:20px}' + css, viewport: {min: 320, max: 800}, boxes: {'.t': {minInlineSize: 10, intrinsicBlockSize: 20, wrap: 'nowrap'}}}).diagnostics.some(d => d.code === 'E_LAYOUT_WRAP');
  assert.equal(wraps('.t{text-wrap:balance;white-space:nowrap}'), false);
  assert.equal(wraps('.t.t{text-wrap:wrap}.t{white-space:nowrap}'), true);
  assert.equal(wraps('.page{text-wrap:nowrap}'), false); // inherited
  assert.equal(wraps('.page{text-wrap:nowrap}.t{white-space:normal}'), true);
  assert.equal(wraps('.t{white-space:pre;text-wrap:wrap}'), true); // pre-wrap
  assert.equal(run('.t{white-space:pre-line;text-wrap-mode:nowrap}'), 'unknown'); // no white-space keyword for it
});
