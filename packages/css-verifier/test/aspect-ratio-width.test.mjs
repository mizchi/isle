import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// A grid item or block-flow child with an aspect-ratio, a px height and an auto width is not stretched: its width
// follows the ratio (justify-self: normal behaves as start for it; Grid §6.2). Column flex items still stretch.
// Expected sizes are Chromium's (measured).
const g = 'display:grid;grid-template-columns:minmax(0,1fr);align-content:start';
const run = css => analyzeHTML('<html lang="en"><body><div class="s"><div class="a"></div><div class="n"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.s{${g}}.n{height:5px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const size = (r, vw = 500) => { const a = r.sizes.find(s => s.box === '.a' && s.rect && s.range.min <= vw && vw <= s.range.max); const v = x => Number(String(x.coefficient).split('/').reduce((p, c) => p / c)) * vw + Number(String(x.constant).split('/').reduce((p, c) => p / c)); return [v(a.rect.inlineSize), v(a.rect.blockSize)]; };

test('the width follows the ratio in grid and block flow; stretch and column flex fill', () => {
  for (const [css, expected] of [
    ['.a{aspect-ratio:1;height:50px}', [50, 50]],
    ['.s{display:block}.a{aspect-ratio:1;height:50px}', [50, 50]],
    ['.a{aspect-ratio:2;height:50px;padding:5px;box-sizing:content-box}', [110, 60]],
    ['.a{aspect-ratio:2;height:50px;padding:5px}', [100, 50]],
    ['.a{aspect-ratio:2;height:50px;justify-self:stretch}', [500, 50]],
    ['.s{display:flex;flex-direction:column}.a{aspect-ratio:1;height:50px}', [500, 50]],
    ['.a{aspect-ratio:16/9}', [500, 281.25]],
  ]) {
    const r = run(css);
    assert.equal(r.status, 'verified', `${css} ${JSON.stringify(r.diagnostics.map(d => d.message))}`);
    assert.deepEqual(size(r), expected, css);
  }
  // Wider than its container: it overflows (as in Chromium).
  assert.ok(run('.a{aspect-ratio:1;height:900px}').diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.axis === 'inline'));
});
