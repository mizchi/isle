import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Both insets of an axis on an absolute box: an auto size fills the containing block between them (inset: 0
// overlays); with an explicit size the end inset is ignored.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const rect = (overlay, card = '') => {
  const report = analyzeHTML('<html lang="en"><body><main class="page"><div class="card"><div class="o"></div></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.card{position:relative;height:200px;${card}}.o{position:absolute;${overlay}}`, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics.map(d => d.message)));
  const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
  const r = report.sizes.find(s => s.box === '.o').rect, v = x => n(x.constant) + 400 * n(x.coefficient) + 600 * n(x.heightCoefficient);
  return [v(r.inlineStart), v(r.blockStart), v(r.inlineSize), v(r.blockSize)];
};

test('inset: 0 fills the containing block; insets with an auto size leave the gaps', () => {
  assert.deepEqual(rect('inset:0'), [0, 0, 400, 200]);
  assert.deepEqual(rect('top:10px;bottom:20px;left:5%;right:15px'), [20, 10, 400 - 20 - 15, 170]);
  // content-box: the padding is inside the filled width.
  assert.deepEqual(rect('inset:0;box-sizing:content-box;padding:0 10px'), [0, 0, 400, 200]);
  // Over-constrained: width wins, right (ltr) and bottom are ignored.
  assert.deepEqual(rect('inset:0;width:100px;height:50px'), [0, 0, 100, 50]);
});

test('a stretched link (::after inset: 0 over the card) covers the other controls in the card', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const run = fix => analyzeHTML('<html lang="en"><body><main class="page"><article class="card"><a class="l" href="/item" aria-label="Item"></a><button class="b" aria-label="Save"></button></article></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.page{background:#fff}.card{${g};position:relative;grid-auto-rows:40px;row-gap:8px;background:#fff}.l{display:block;height:40px}.l::after{content:"";position:absolute;inset:0}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px;background:#246}${fix}`, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, accessibility: true});
  assert.deepEqual(run('').diagnostics.filter(d => d.code === 'E_A11Y_OCCLUDED').map(d => d.box), ['.b']);
  assert.equal(run('.l::after{pointer-events:none}').status, 'verified');
});
