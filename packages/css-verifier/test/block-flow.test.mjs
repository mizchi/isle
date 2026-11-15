import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Block containers of block-level children (no vertical margins): a one-column grid whose rows do not stretch.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (inner, css) => analyzeHTML(`<html lang="en"><body><main class="p"><section class="box">${inner}</section></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.box{display:block;padding:7px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const rects = (report, viewport) => report.sizes.filter(s => s.rect && s.range.min <= viewport && viewport <= s.range.max && /^\.[ab]$/.test(s.box)).map(s => { const v = t => Number(String(t).split('/').map(Number).reduce((a, b) => a / b)); const at = a => v(a.coefficient) * viewport + v(a.constant); return [s.box, at(s.rect.inlineStart), at(s.rect.blockStart), at(s.rect.inlineSize), at(s.rect.blockSize)]; });

test('children stack and fill; a fixed-height container does not stretch them', () => {
  const r = run('<div class="a"></div><div class="b"></div>', '.a{height:20px}.b{height:30px;width:50%}.box{height:200px}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(r, 500), [['.a', 7, 7, 486, 20], ['.b', 7, 27, 243, 30]]);
  // A 2000px child overflows.
  assert.ok(run('<div class="a"></div>', '.a{height:20px;width:2000px}').diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE'));
});

test('auto margins with an auto width: the width fills up to max-width and the box is centered', () => {
  const r = run('<div class="a"></div>', '.a{height:10px;max-width:300px;margin:0 auto}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(r, 500)[0], ['.a', 100, 7, 300, 10]);
  // Narrower than max-width + padding: it fills and the margins are 0.
  assert.deepEqual(rects(r, 320)[0], ['.a', 10, 7, 300, 10]);
  assert.deepEqual(rects(run('<div class="a"></div>', '.a{height:10px;max-width:400px;margin:0 auto}'), 320)[0], ['.a', 7, 7, 306, 10]);
});

test('inline content, mixed text and vertical margins stay Unknown', () => {
  assert.equal(run('<span class="a"></span>', '.a{height:10px}').status, 'unknown');
  assert.equal(run('<div class="a"></div>', '.a{height:10px;margin-top:8px}').status, 'unknown');
});
