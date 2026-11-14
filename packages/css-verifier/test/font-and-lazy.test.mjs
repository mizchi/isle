import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
const page = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.b{height:40px}';
const face = display => `@font-face{font-family:"Web Sans";src:url(/web.woff2);font-display:${display}}`;
const text = (css, html = '<div class="page"><p class="t">Hello</p><div class="b"></div></div>') => analyzeHTML(html, {name: 'P', css: page + css, viewport, boxes: {'.t': {minInlineSize: 40, intrinsicBlockSize: 20}}});
const swaps = report => (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_FONT_SWAP');

test('@font-face is accepted, and web-font text whose box follows the font is a font-swap warning', () => {
  const swapped = text(face('swap') + '.t{font-family:"Web Sans",sans-serif}');
  assert.notEqual(swapped.status, 'unknown', JSON.stringify(swapped.diagnostics));
  const [warning] = swaps(swapped);
  assert.deepEqual([warning.box, warning.family, warning.display], ['.t', 'Web Sans', 'swap']);
  // No warning: optional fonts, a px line-height on one line, a fixed height, a system font.
  for (const css of [face('optional') + '.t{font-family:"Web Sans"}', face('swap') + '.t{font-family:"Web Sans";line-height:20px;white-space:nowrap}', face('swap') + '.t{font-family:"Web Sans";height:20px}', face('swap') + '.t{font-family:sans-serif}'])
    assert.equal(swaps(text(css)).length, 0, css);
  // A metric-matched fallback face is named (it reduces the change; it does not remove the warning).
  const matched = swaps(text(face('swap') + '@font-face{font-family:"Web Fallback";src:local(Arial);size-adjust:105%;ascent-override:90%}.t{font-family:"Web Sans","Web Fallback"}'));
  assert.equal(matched[0].fallback, 'Web Fallback');
  // Warnings do not change the status.
  assert.equal(swapped.status, text('.t{font-family:sans-serif}').status);
});

test('a lazy image in the initial viewport is a warning with its region', () => {
  const css = page + 'img{display:block;width:100%;height:auto}.sp{height:700px}';
  const run = html => analyzeHTML(`<div class="page">${html}</div>`, {name: 'P', css, viewport});
  const lazy = img => (run(img).layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_LAZY_IN_VIEWPORT');
  assert.equal(lazy('<img src="/a.png" width="400" height="200" loading="lazy" alt="">').length, 1);
  assert.equal(lazy('<img src="/a.png" width="400" height="200" alt="">').length, 0);
  // Below 700px of content: in view only where the viewport is taller than 700px.
  const [deep] = lazy('<div class="sp"></div><img src="/a.png" width="400" height="200" loading="lazy" alt="">');
  assert.ok(deep.heightRange.min >= 700, JSON.stringify(deep.heightRange));
});

test('-webkit-line-clamp caps a text leaf at N lines and warns where text is cut', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const profile = [{atLeastInlineSize: 0, blockSize: 100}, {atLeastInlineSize: 300, blockSize: 60}, {atLeastInlineSize: 600, blockSize: 20}];
  const run = css => analyzeHTML('<div class="page"><p class="t">long text</p></div>', {name: 'P', css: `*{box-sizing:border-box;margin:0}.page{${g}}.t{line-height:20px;${css}}`, viewport: {min: 320, max: 800, height: {min: 400, max: 900}}, boxes: {'.t': {minInlineSize: 10, intrinsicBlockSize: profile}}});
  const clamped = run('display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden');
  assert.equal(clamped.status, 'verified', JSON.stringify(clamped.diagnostics));
  assert.deepEqual(clamped.sizes.filter(r => r.box === '.t').map(r => [r.range.min, r.blockSize.constant]).sort((a, b) => a[0] - b[0]), [[320, '40'], [600, '20']]);
  const [cut] = clamped.layoutWarnings;
  assert.deepEqual([cut.code, cut.lines, cut.range.min, cut.range.max], ['W_LAYOUT_LINE_CLAMPED', 2, 320, 600]);
  // Enough lines: nothing is cut.
  assert.equal(run('display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5;overflow:hidden').layoutWarnings, undefined);
  // Outside the legacy clamp (no vertical orient, the unprefixed property): Unknown.
  assert.equal(run('display:-webkit-box;-webkit-line-clamp:2').status, 'unknown');
  assert.equal(run('line-clamp:2').status, 'unknown');
});

test('a sticky box whose parent ends at its bottom cannot stick (W_LAYOUT_STICKY_INERT)', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const css = `*{box-sizing:border-box;margin:0}html,body{${g}}.page{${g}}.h{position:sticky;top:0;height:50px}.w{${g}}.w2{${g};padding-bottom:20px}.c{height:2000px}`;
  const run = body => analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 400, max: 900}}, integrity: true});
  const inert = report => (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_STICKY_INERT').map(w => [w.box, w.parent]);
  assert.deepEqual(inert(run('<div class="page"><div class="w"><header class="h"></header></div><div class="c"></div></div>')), [['.h', '.w']]);
  assert.deepEqual(inert(run('<div class="page"><header class="h"></header><div class="c"></div></div>')), []);
  // The parent's padding is outside its content box: no room either.
  assert.deepEqual(inert(run('<div class="page"><div class="w2"><header class="h"></header></div><div class="c"></div></div>')), [['.h', '.w2']]);
});

test('a sticky box inside an overflow: hidden ancestor never sticks to the page (W_LAYOUT_STICKY_SCROLLER)', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const css = `*{box-sizing:border-box;margin:0}html,body{${g}}.page{${g}}.h{position:sticky;top:0;height:50px}.c{height:2000px}.x{overflow:hidden}.y{overflow:clip}`;
  const run = cls => analyzeHTML(`<html lang="en"><body><div class="page ${cls}"><header class="h"></header><div class="c"></div></div></body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 400, max: 900}}, integrity: true, boxes: {[`.${cls}`]: {overflow: 'clip', overflowBlock: 'clip'}}});
  const hidden = run('x');
  assert.notEqual(hidden.status, 'unknown');
  assert.deepEqual(hidden.layoutWarnings.map(w => [w.code, w.box, w.scroller]), [['W_LAYOUT_STICKY_SCROLLER', '.h', '.page.x']]);
  // overflow: clip is not a scroll container: the box sticks to the page through it (not modeled: Unknown).
  assert.equal(run('y').status, 'unknown');
});
