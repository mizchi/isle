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
  assert.deepEqual(inert(run('.p{display:flex}.c{width:100px;height:10px;flex-grow:1}')), []);
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

test('justify-self / justify-items in flex do nothing; in grid a px-wide item is aligned, an auto-width box (not a text leaf) stays Unknown', () => {
  assert.deepEqual(inert(run('.p{display:flex}.c{width:100px;height:10px;justify-self:end}')), [['.c', 'justify-self']]);
  assert.deepEqual(inert(run('.p{display:flex;justify-items:center}.c{width:100px;height:10px}')), [['.p', 'justify-items']]);
  assert.deepEqual(inert(run('.p{display:flex}.c{width:100px;height:10px;justify-self:auto}')), []);
  assert.equal(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{width:100px;height:10px;justify-self:end}').status, 'verified');
  assert.equal(run('.p{display:grid;grid-template-columns:minmax(0,1fr);justify-items:center}.c{width:100px;height:10px}').status, 'verified');
  assert.equal(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:10px;justify-self:end}').status, 'unknown');
  assert.equal(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:10px;justify-self:stretch}').status, 'verified');
  assert.equal(run('.p{display:flex}.c{width:100px;height:10px;justify-self:end}').status, 'verified');
});

test('align-content on a single-line flex container and object-fit on a non-replaced box do nothing', () => {
  // (A max size below the min size is not inert: the max still caps a stretched size, which the min then raises.)
  assert.deepEqual(inert(run('.p{display:flex;height:100px;align-content:center}.c{width:100px;height:10px}')), [['.p', 'align-content']]);
  assert.deepEqual(inert(run('.p{display:flex;flex-wrap:wrap;height:100px;align-content:center}.c{width:100px;height:10px}')), []);
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:10px;object-fit:cover}')), [['.c', 'object-fit']]);
});

test('a main size under a non-auto flex-basis does nothing once the automatic minimum is out of the way', () => {
  const f = '.p{display:flex}';
  assert.deepEqual(inert(run(`${f}.c{height:10px;flex:1;width:200px}`)), [['.c', 'inline-size']]);
  assert.deepEqual(inert(run(`${f}.c{height:10px;flex:1 1 50px;width:200px;min-width:0}`)), [['.c', 'inline-size']]);
  assert.deepEqual(inert(run('.p{display:flex;flex-direction:column;height:300px}.c{flex:1;height:50px}')), [['.c', 'block-size']]);
  // flex-basis auto uses the width; the width of a column item is its cross size.
  assert.deepEqual(inert(run(`${f}.c{height:10px;flex:1 1 auto;width:200px}`)), []);
  assert.deepEqual(inert(run(`${f}.c{height:10px;flex-grow:1;width:200px}`)), []);
  assert.deepEqual(inert(run('.p{display:flex;flex-direction:column;height:300px}.c{flex:1;width:50px}')), []);
});

test('offsets on a static box, z-index outside a stacking context, gap and flex factors in block flow do nothing', () => {
  // top/left/right/bottom position only a positioned box.
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:10px;top:8px;left:4px}')), [['.c', 'top left']]);
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:10px;position:relative;top:8px}')), []);
  // z-index on a static box: applies to grid and flex items, not to a block-level box in block flow.
  assert.deepEqual(inert(run('.p{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:10px;z-index:2}')), []);
  assert.deepEqual(inert(run('.p{display:block}.c{height:10px;z-index:2}')), [['.c', 'z-index']]);
  assert.deepEqual(inert(run('.p{display:block}.c{height:10px;z-index:2;position:relative}')), []);
  // gap spaces grid and flex items; a block container has none.
  assert.deepEqual(inert(run('.p{display:block;gap:12px}.c{height:10px}')), [['.p', 'row-gap column-gap']]);
  // Flex factors and grid templates of a block child of a block container: its parent is display: block.
  const r = inert(run('.p{display:block}.c{height:10px;flex:1}'));
  assert.deepEqual(r, [['.c', 'flex-grow flex-basis']]);
  assert.deepEqual(inert(run('.p{display:block}.c{height:10px;vertical-align:middle}')), [['.c', 'vertical-align']]);
  assert.match(run('.p{display:block}.c{height:10px;flex:1}').layoutWarnings.find(w => w.code === 'W_LAYOUT_DECLARATION_INERT').message, /display: block/);
});

test('flex and grid container properties on a block container do nothing', () => {
  assert.deepEqual(inert(run('.p{display:block;justify-content:center;align-items:center}.c{height:10px}')), [['.p', 'justify-content align-items']]);
  assert.deepEqual(inert(run('.p{display:block;flex-direction:column;grid-template-columns:1fr 1fr}.c{height:10px}')), [['.p', 'flex-direction grid-template-columns']]);
  // Initial values, align-content and justify-items (they apply to block containers) are not reported.
  assert.deepEqual(inert(run('.p{display:block;justify-content:normal;align-content:center;height:50px}.c{height:10px}')), []);
  assert.match(run('.p{display:block;align-items:center}.c{height:10px}').layoutWarnings.find(w => w.code === 'W_LAYOUT_DECLARATION_INERT').message, /align-items: center has no effect \(it is display: block/);
});

test('object-fit on an img whose height (or width) follows its own ratio does nothing', () => {
  const img = css => analyzeHTML('<html lang="en"><body><main class="p"><img class="i" src="/a.png" width="400" height="300" alt=""></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.p{${g}}.i{display:block;max-width:300px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  assert.deepEqual(inert(img('.i{width:100%;height:auto;object-fit:cover}')), [['.i', 'object-fit']]);
  // A box of another shape: object-fit crops or letterboxes.
  assert.deepEqual(inert(img('.i{width:100%;height:120px;object-fit:cover}')), []);
  assert.deepEqual(inert(img('.i{width:100%;height:auto;max-height:100px;object-fit:cover}')), []);
  assert.deepEqual(inert(img('.i{width:100%;height:auto;aspect-ratio:1;object-fit:cover}')), []);
});

test('order in block flow, table-layout off a table, list-style-type off a list, and scroll properties off a scroller do nothing', () => {
  assert.deepEqual(inert(run('.p{display:block}.c{height:10px;order:2}')), [['.c', 'order']]);
  assert.deepEqual(inert(run('.p{display:flex}.c{width:10px;height:10px;order:2}')), []);
  assert.deepEqual(inert(run('.p{display:block;table-layout:fixed}.c{height:10px}')), [['.p', 'table-layout']]);
  assert.deepEqual(inert(run('.p{display:block}.c{height:10px;list-style-type:square}')), [['.c', 'list-style-type']]);
  // On a box with items in it, list-style-type is inherited by them: not reported.
  assert.deepEqual(inert(run('.p{display:block;list-style-type:square}.c{height:10px}')), []);
  assert.deepEqual(inert(run('.p{display:block}.c{height:10px;display:list-item;list-style-type:square}')), []);
  assert.deepEqual(inert(run('.p{display:block;overscroll-behavior:contain}.c{height:10px}')), [['.p', 'overscroll-behavior-x overscroll-behavior-y']]);
  assert.deepEqual(inert(run('.p{display:block;overflow:auto;height:15px;overscroll-behavior:contain}.c{height:10px}')), []);
  assert.deepEqual(inert(run('.p{display:block;scroll-snap-type:y mandatory}.c{height:10px}')), [['.p', 'scroll-snap-type']]);
  assert.deepEqual(inert(run('.p{display:block;overflow-y:auto;height:15px;scroll-snap-type:y mandatory}.c{height:10px}')), []);
  // The root's apply to the viewport.
  assert.deepEqual(inert(analyzeHTML('<html lang="en"><body><div class="c"></div></body></html>', {name: 'P', css: `*{margin:0}html{scroll-snap-type:y proximity;overscroll-behavior:none}html,body{${g}}.c{height:10px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}})), []);
  // A named grid area on a flex item: the message names the area as written.
  assert.match(run('.p{display:flex}.c{width:10px;height:10px;grid-area:a}').layoutWarnings.find(w => w.code === 'W_LAYOUT_DECLARATION_INERT').message, /grid-column: a has no effect/);
});
