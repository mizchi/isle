import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// :hover rules that change layout: each hovered layout is compared with the base one; a moved start position is a
// layout shift (Chromium counts it, hadRecentInput false).
const viewport = {min: 320, max: 960, height: {min: 240, max: 720}};
const html = '<main class="page"><div class="card"><div class="inner"></div></div><div class="below"></div></main>';
const base = '*{box-sizing:border-box}.page{display:grid;grid-template-columns:minmax(0,1fr);padding:8px;row-gap:8px}.card{display:grid;grid-template-columns:minmax(0,1fr);height:100px;padding:10px}.inner{height:20px}.below{height:40px}';
const run = (css, options = {}) => analyzeHTML(html, {name: 'Page', viewport, css: base + css, ...options});
const shifts = report => report.diagnostics.filter(d => d.code === 'E_LAYOUT_HOVER_SHIFT');

test(':hover that changes layout reports the boxes it moves', () => {
  const [taller] = shifts(run('.card:hover{height:120px}'));
  assert.deepEqual([taller.box, taller.hovered, taller.field, taller.delta], ['.below', '.card', 'blockStart', '20']);
  const padded = shifts(run('.card:hover{padding:14px}'));
  assert.deepEqual(padded.map(d => [d.box, d.field, d.delta]), [['.inner', 'inlineStart', '4']]);
  // A size change that moves no start position is not a shift: the last box grows, or narrows from its start.
  for (const css of ['.below:hover{height:60px}', '.below:hover{width:50%}', '.card:hover{background:#eee}']) assert.equal(run(css).status, 'verified', css);
  // A transform on hover moves only the painted box (integrity/accessibility model it).
  assert.equal(run('.card:hover{transform:translateY(-4px)}', {integrity: true}).status, 'verified');
});

test('a hovered layout that only moves in part of the viewport range is found there', () => {
  // The card grows only from 600px: the shift is reported in that region.
  const [wide] = shifts(run('@media (min-width: 600px){.card:hover{height:110px}}'));
  assert.equal(wide.box, '.below');
  assert.ok(wide.range.min >= 600, JSON.stringify(wide.range));
  assert.equal(run('@media (min-width: 2000px){.card:hover{height:110px}}').status, 'verified');
});
