import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// container-type: inline-size (or size) applies inline-size containment: the box's width ignores its content
// (CSS Containment §3.2). A flex item with an auto width and flex-basis that does not grow collapses to its padding
// and border, and its content overflows (W_LAYOUT_CONTAINER_COLLAPSE).
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = css => analyzeHTML('<html lang="en"><body><div class="p"><div class="c"><div class="k"></div></div><div class="o"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:flex}.c{${g}}.k{width:150px;height:20px}.o{width:50px;height:10px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const collapsed = report => (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_CONTAINER_COLLAPSE').map(w => w.box);

test('a non-growing flex item with container-type and no width collapses', () => {
  const report = run('.c{container-type:inline-size}');
  assert.deepEqual(collapsed(report), ['.c']);
  assert.equal(report.sizes.find(r => r.box === '.c').inlineSize.constant, '0');
  // Its 150px child does not fit in it.
  assert.ok(report.diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.box === '.k'), JSON.stringify(report.diagnostics));
  assert.equal(run('.c{container-type:inline-size;padding:0 8px}').sizes.find(r => r.box === '.c').inlineSize.constant, '16');
});

test('a width, a growing item or no containment: no collapse', () => {
  assert.deepEqual(collapsed(run('.c{container-type:inline-size;width:200px}')), []);
  assert.deepEqual(collapsed(run('.c{container-type:inline-size;flex-grow:1}')), []);
  assert.equal(run('.c{container-type:inline-size;flex-grow:1}').status, 'verified');
  // Without containment the width is the content's, which is outside the subset.
  assert.equal(run('').status, 'unknown');
});

test('an absolute box with container-type and an auto width collapses to its padding and border', () => {
  const abs = css => analyzeHTML('<html lang="en"><body><div class="p"><div class="c"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};position:relative;height:100px}.c{position:absolute;top:0;left:0;height:20px;container-type:inline-size}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  const a = abs('.c{padding:0 6px}');
  assert.equal(a.status, 'verified', JSON.stringify(a.diagnostics));
  assert.equal(a.sizes.find(r => r.box === '.c').inlineSize.constant, '12');
  assert.deepEqual(collapsed(a), ['.c']);
  assert.equal(abs('.c{box-sizing:content-box;padding:0 7px}').sizes.find(r => r.box === '.c').inlineSize.constant, '14');
  // Both insets size it: no collapse.
  assert.deepEqual(collapsed(abs('.c{right:0}')), []);
});
