import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// minmax(px, fr) tracks and repeat(auto-fill, …): the responsive card grid.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const cards = n => Array.from({length: n}, () => '<div class="c"></div>').join('');
const run = (cols, n = 4, extra = '') => analyzeHTML(`<html lang="en"><body><div class="p"><div class="grid">${cards(n)}</div></div></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};padding:0 10px}.grid{display:grid;grid-template-columns:${cols};column-gap:16px;grid-auto-rows:40px}${extra}`, viewport: {min: 320, max: 1280, height: {min: 600, max: 900}}});
const widths = (report, viewport) => report.sizes.filter(r => r.box === '.c' && r.rect && r.range.min <= viewport && viewport <= r.range.max).map(r => Number(r.inlineSize.coefficient.split('/').reduce((a, b) => a / b)) * viewport + Number(r.inlineSize.constant.split('/').reduce((a, b) => a / b)));

test('minmax(px, fr): tracks share the space down to their minimum, then the grid overflows', () => {
  const r = run('minmax(200px,1fr) minmax(200px,1fr)', 2);
  assert.equal(r.status, 'violated');
  const overflow = r.diagnostics.find(d => d.code === 'E_LAYOUT_TRACKS');
  // 2·200 + 16 = 416 needs a 436px viewport (20px padding).
  assert.deepEqual([overflow.range.min, overflow.range.max], [320, 436]);
  assert.deepEqual(widths(r, 800), [382, 382]);
  // Unequal minimums: the larger one freezes first.
  const u = run('minmax(100px,1fr) minmax(500px,1fr)', 2);
  assert.deepEqual(widths(u, 800), [264, 500]);
});

test('repeat(auto-fill, minmax(200px, 1fr)) has as many columns as fit', () => {
  const r = run('repeat(auto-fill,minmax(200px,1fr))', 4);
  // At 1000px: content 980, (980+16)/(216) = 4.6 → 4 columns of (980 − 48)/4 = 233.
  assert.deepEqual(widths(r, 1000), [233, 233, 233, 233]);
  // At 500px: content 480 → 2 columns of 232.
  assert.deepEqual(widths(r, 500).slice(0, 2), [232, 232]);
  // Below one 200px track (content < 200) it overflows: not in this range (content ≥ 300).
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.slice(0, 2)));
  // A 400px minimum overflows below 420px.
  const wide = run('repeat(auto-fill,minmax(400px,1fr))', 2);
  const overflow = wide.diagnostics.find(d => d.code === 'E_LAYOUT_TRACKS');
  assert.deepEqual([overflow.range.min, overflow.range.max], [320, 420]);
  // The min(400px, 100%) idiom never overflows.
  assert.equal(run('repeat(auto-fill,minmax(min(400px,100%),1fr))', 2).status, 'verified');
});

test('auto-fit: with fewer items than tracks the items share the width', () => {
  // At 1000px (content 980): 4 tracks fit; 2 items take (980 − 16) / 2 = 482 each.
  assert.deepEqual(widths(run('repeat(auto-fit,minmax(200px,1fr))', 2), 1000), [482, 482]);
  assert.deepEqual(widths(run('repeat(auto-fit,minmax(200px,1fr))', 6), 1000), [233, 233, 233, 233, 233, 233]);
  // An item that may not render, or is placed explicitly: Unknown.
  assert.equal(run('repeat(auto-fit,minmax(200px,1fr))', 2, '@media (max-width:500px){.c{display:none}}').status, 'unknown');
  assert.equal(run('repeat(auto-fit,minmax(200px,1fr))', 2, '.c{grid-column:span 2}').status, 'unknown');
});
