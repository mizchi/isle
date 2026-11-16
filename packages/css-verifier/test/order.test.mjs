import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// order: flex items and auto-placed grid items are laid out in order-modified document order (a stable sort);
// Tab order still follows the DOM, so visual-order reports the difference.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (parent, extra = '') => analyzeHTML('<html lang="en"><body><div class="p"><button class="a" aria-label="A"></button><button class="b" aria-label="B"></button><button class="c" aria-label="C"></button></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${parent}}.a,.b,.c{appearance:none;display:block;padding:0;border:0;height:30px;width:100px}${extra}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true});
const starts = r => ['.a', '.b', '.c'].map(b => r.sizes.find(s => s.box === b && s.rect).rect.inlineStart.constant);

test('flex and auto-placed grid items follow order (stable for equal values)', () => {
  for (const parent of ['display:flex', 'display:grid;grid-template-columns:100px 100px 100px']) {
    const r = run(parent, '.c{order:-1}.a{order:2}');
    assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
    assert.deepEqual(starts(r), ['200', '100', '0'], parent);
    assert.ok((r.accessibility.warnings ?? []).some(w => w.code === 'W_A11Y_ORDER'), parent);
    assert.deepEqual(starts(run(parent, '.a,.b,.c{order:1}')), ['0', '100', '200']);
  }
});

test('order with explicitly placed grid items or transformed items stays Unknown', () => {
  assert.equal(run('display:grid;grid-template-columns:100px 100px 100px', '.c{order:-1}.a{grid-column:3}').status, 'unknown');
  assert.equal(run('display:flex', '.c{order:-1;transform:translateX(4px)}').status, 'unknown');
});
