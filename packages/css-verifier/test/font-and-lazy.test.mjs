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
