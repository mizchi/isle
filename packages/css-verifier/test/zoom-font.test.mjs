import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {viewportFont, zoomShortfall} from '../src/layout/zoom-font.mjs';

test('the zoomed size of viewport-unit font sizes (measured in Chromium: 4vw stays 1×, calc(1rem + 1vw) 1.8×)', () => {
  const v = {min: 320, max: 800};
  assert.deepEqual(zoomShortfall(viewportFont('4vw'), v, 600), [[320, 800]]);
  assert.deepEqual(zoomShortfall(viewportFont('calc(1rem + 1vw)'), v, 600), [[320, 800]]);
  assert.deepEqual(zoomShortfall(viewportFont('max(4vw, 1rem)'), v, 600), [[401, 800]]);
  // clamp(1rem, 4vw, 3rem): 2× while 4vw is at the floor (W ≤ 400), short above.
  assert.deepEqual(zoomShortfall(viewportFont('clamp(1rem, 4vw, 3rem)'), v, 600), [[401, 800]]);
  assert.equal(viewportFont('16px'), null);
  assert.equal(viewportFont('calc(1em + 1vw)'), null);
});

test('W_LAYOUT_FONT_ZOOM on the declaring element', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const run = fs => (analyzeHTML('<html lang="en"><body><main class="page"><h1 class="t"></h1></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html{font-size:16px}html,body,.page{${g}}.t{height:40px;font-size:${fs}}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}}).layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_FONT_ZOOM').map(w => [w.box, w.range.min, w.range.max]);
  assert.deepEqual(run('5vw'), [['.t', 320, 800]]);
  assert.deepEqual(run('32px'), []);
  assert.deepEqual(run('clamp(1rem, 4vw, 3rem)'), [['.t', 401, 800]]);
  // rem without a px root font-size is not resolved: no judgement.
  assert.equal(viewportFont('max(4vw, 1rem)', undefined) === null, false);
});
