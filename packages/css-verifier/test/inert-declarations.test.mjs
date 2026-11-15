import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Declarations the parent's (or the box's own) display makes inert: grid placement on a flex item, flex factors on a
// grid item, grid templates on a flex container and flex direction/wrap on a grid container (W_LAYOUT_DECLARATION_INERT).
// The layout is right either way; what the author wrote is not what happens.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = css => analyzeHTML('<html lang="en"><body><div class="p"><div class="c"></div><div class="c"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const inert = report => [...new Map((report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_DECLARATION_INERT').map(w => [`${w.box} ${w.properties.join(' ')}`, [w.box, w.properties.join(' ')]])).values()];

test('item properties the parent display ignores', () => {
  assert.deepEqual(inert(run('.p{display:flex}.c{width:100px;height:10px;grid-column:span 2}')), [['.c', 'grid-column']]);
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.c{height:10px;flex:1}')), [['.c', 'flex-grow flex-basis']]);
  // Where they apply: no warning.
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.c{height:10px;grid-column:span 2}')), []);
  assert.deepEqual(inert(run('.p{display:flex}.c{width:100px;height:10px;flex:1}')), []);
});

test('container properties the own display ignores', () => {
  assert.deepEqual(inert(run('.p{display:flex;grid-template-columns:minmax(0,1fr)}.c{width:100px;height:10px}')), [['.p', 'grid-template-columns']]);
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr);flex-direction:column}.c{height:10px}')), [['.p', 'flex-direction']]);
  // Initial values are not reported (flex-shrink: 1 in a grid does nothing either way).
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:10px;flex-shrink:1}')), []);
});

test('aspect-ratio with both sizes set, and vertical-align on a block-level box, do nothing', () => {
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{width:100px;height:50px;aspect-ratio:1}')), [['.c', 'aspect-ratio']]);
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{width:100px;aspect-ratio:1}')), []);
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:10px;vertical-align:middle}')), [['.c', 'vertical-align']]);
  assert.deepEqual(inert(run('.p{display:flex}.c{width:100px;height:10px;vertical-align:top}')), [['.c', 'vertical-align']]);
});

test('paint declarations that need another declaration: text-overflow, -webkit-line-clamp', () => {
  const p = '.p{display:grid;grid-template-columns:minmax(0,1fr)}';
  // text-overflow needs the inline overflow clipped.
  assert.deepEqual(inert(run(`${p}.c{height:10px;text-overflow:ellipsis;white-space:nowrap}`)), [['.c', 'text-overflow']]);
  assert.deepEqual(inert(run(`${p}.c{height:10px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}`)), []);
  assert.deepEqual(inert(run(`${p}.c{height:10px;text-overflow:ellipsis;white-space:nowrap;overflow-x:clip}`)), []);
  assert.deepEqual(inert(run(`${p}.c{height:10px;text-overflow:clip}`)), []);
  // -webkit-line-clamp needs display: -webkit-box.
  assert.deepEqual(inert(run(`${p}.c{height:10px;-webkit-line-clamp:2;overflow:hidden}`)), [['.c', 'line-clamp']]);
  assert.deepEqual(inert(run(`${p}.c{height:10px;-webkit-line-clamp:none}`)), []);
});

test('justify-self / justify-items in flex do nothing; in grid they stay Unknown', () => {
  assert.deepEqual(inert(run('.p{display:flex}.c{width:100px;height:10px;justify-self:end}')), [['.c', 'justify-self']]);
  assert.deepEqual(inert(run('.p{display:flex;justify-items:center}.c{width:100px;height:10px}')), [['.p', 'justify-items']]);
  assert.deepEqual(inert(run('.p{display:flex}.c{width:100px;height:10px;justify-self:auto}')), []);
  assert.equal(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{width:100px;height:10px;justify-self:end}').status, 'unknown');
  assert.equal(run('.p{display:grid;grid-template-columns:minmax(0,1fr);justify-items:center}.c{width:100px;height:10px}').status, 'unknown');
  assert.equal(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:10px;justify-self:stretch}').status, 'verified');
  assert.equal(run('.p{display:flex}.c{width:100px;height:10px;justify-self:end}').status, 'verified');
});

test('align-content on a single-line flex container and object-fit on a non-replaced box do nothing', () => {
  // (A max size below the min size is not inert: the max still caps a stretched size, which the min then raises.)
  assert.deepEqual(inert(run('.p{display:flex;height:100px;align-content:center}.c{width:100px;height:10px}')), [['.p', 'align-content']]);
  assert.deepEqual(inert(run('.p{display:flex;flex-wrap:wrap;height:100px;align-content:center}.c{width:100px;height:10px}')), []);
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:10px;object-fit:cover}')), [['.c', 'object-fit']]);
});
