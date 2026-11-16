import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Content-sized columns: auto (minmax(auto, auto)), min-content, max-content and fit-content(L). The free space
// goes to them equally up to their max-content limits (Grid §12.6), then to fr tracks, or, without fr tracks, it
// stretches the auto tracks (justify-content: normal). Expected values are Chromium's (measured).
const g = 'display:grid;grid-template-columns:minmax(0,1fr);align-content:start';
const w = '<div class="w"><i></i><i></i><i></i></div>'; // min-content 60px, max-content 190px
const run = (css, html) => analyzeHTML(`<html lang="en"><body><div class="s">${html}</div></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.s{display:grid;column-gap:10px}.a,.b,.c{height:5px}.w{display:flex;flex-wrap:wrap;column-gap:5px}.w i{display:block;width:60px;height:2px}${css}`, viewport: {min: 100, max: 800, height: {min: 600, max: 900}}});
const columns = (r, vw) => { const v = a => Number(String(a.coefficient).split('/').reduce((p, c) => p / c)) * vw + Number(String(a.constant).split('/').reduce((p, c) => p / c)); return r.sizes.filter(s => /^\.[abc]$/.test(s.box) && s.rect && s.range.min <= vw && vw <= s.range.max).map(s => [v(s.rect.inlineStart), v(s.rect.inlineSize)]); };
const cases = {
  'auto 1fr': ['.s{grid-template-columns:auto 1fr}', `<div class="a">${w}</div><div class="b"></div>`, {500: [[0, 190], [200, 300]], 230: [[0, 190], [200, 30]], 120: [[0, 110], [120, 0]]}],
  'auto auto': ['.s{grid-template-columns:auto auto}', `<div class="a">${w}</div><div class="b"></div>`, {500: [[0, 340], [350, 150]], 230: [[0, 205], [215, 15]], 120: [[0, 110], [120, 0]]}],
  'auto 1fr auto': ['.s{grid-template-columns:auto 1fr auto}', `<div class="a">${w}</div><div class="b"></div><div class="c">${w}</div>`, {500: [[0, 190], [200, 100], [310, 190]], 230: [[0, 105], [115, 0], [125, 105]], 120: [[0, 60], [70, 0], [80, 60]]}],
  'min-content 1fr': ['.s{grid-template-columns:min-content 1fr}', `<div class="a">${w}</div><div class="b"></div>`, {500: [[0, 60], [70, 430]], 120: [[0, 60], [70, 50]]}],
  'max-content 1fr': ['.s{grid-template-columns:max-content 1fr}', `<div class="a">${w}</div><div class="b"></div>`, {500: [[0, 190], [200, 300]], 120: [[0, 190], [200, 0]]}],
  'fit-content(100px) 1fr': ['.s{grid-template-columns:fit-content(100px) 1fr}', `<div class="a">${w}</div><div class="b"></div>`, {500: [[0, 100], [110, 390]], 120: [[0, 100], [110, 10]]}],
  'auto auto, justify-content: start': ['.s{grid-template-columns:auto auto;justify-content:start}', `<div class="a">${w}</div><div class="b"></div>`, {500: [[0, 190], [200, 0]], 120: [[0, 110], [120, 0]]}],
};

for (const [name, [css, html, widths]] of Object.entries(cases)) test(name, () => {
  const r = run(css, html);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  for (const [vw, expected] of Object.entries(widths)) assert.deepEqual(columns(r, Number(vw)), expected, `${name} at ${vw}px`);
});

test('content-sized columns overflow where their minimum does not fit; unknown contributions stay Unknown', () => {
  // max-content 190px at 120px: the grid overflows its container.
  assert.equal(run('.s{grid-template-columns:max-content 1fr}', `<div class="a">${w}</div><div class="b"></div>`).status, 'violated');
  // Text without a max-content contract, and a flex item sized by flex-basis.
  assert.equal(run('.s{grid-template-columns:auto 1fr}', '<div class="a">text</div><div class="b"></div>').status, 'unknown');
  assert.equal(run('.s{grid-template-columns:auto 1fr}.w i{flex-basis:30px}', `<div class="a">${w}</div><div class="b"></div>`).status, 'unknown');
});
