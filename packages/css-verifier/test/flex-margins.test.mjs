import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// px margins on row flex items: part of the outer main size; the item is laid out inside them on both axes.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = css => analyzeHTML('<html lang="en"><body><main class="p"><div class="row"><div class="a"></div><div class="b"></div></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.row{display:flex;height:40px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const rect = (report, box) => { const r = report.sizes.find(s => s.box === box && s.rect); return [r.rect.inlineStart.constant, r.rect.blockStart.constant, `${r.rect.inlineSize.coefficient}w${r.rect.inlineSize.constant}`, `${r.rect.blockSize.constant}`]; };

test('margins push the next item and shrink the stretched cross size', () => {
  const r = run('.a{width:100px;margin:4px 8px 6px 12px}.b{width:50px}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics));
  assert.deepEqual(rect(r, '.a'), ['12', '4', '0w100', '30']);
  assert.deepEqual(rect(r, '.b').slice(0, 1), ['120']);
});

test('a growing item shares the space left after the margins', () => {
  const r = run('.a{width:100px;margin-right:20px}.b{flex:1;min-width:0}');
  assert.deepEqual(rect(r, '.b').slice(0, 3), ['120', '0', '1w-120']);
});

test('margins count toward overflow', () => {
  const r = run('.a{width:200px;margin-right:150px;flex-shrink:0}.b{width:0}');
  assert.ok(r.diagnostics.some(d => d.code === 'E_LAYOUT_TRACKS'), JSON.stringify(r.diagnostics.map(d => d.code)));
});
