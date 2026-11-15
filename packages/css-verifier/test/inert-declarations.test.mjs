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
