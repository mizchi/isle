import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// 100vw includes a classic scrollbar: on a page that scrolls, a 100vw box is wider than the page beside the
// scrollbar (E_LAYOUT_ITEM_SIZE, explained by W_LAYOUT_VW_SCROLLBAR). With overlay scrollbars it fits.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (css, scrollbars) => analyzeHTML('<html lang="en"><body><div class="hero"></div><div class="tall"></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html{overflow-y:auto}html,body{${g}}.hero{height:100px}.tall{height:2000px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, scrollbars});
const classic = [{name: 'classic', inlineSize: 15, blockSize: 15}], overlay = [{name: 'overlay', inlineSize: 0, blockSize: 0}];
const warned = report => (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_VW_SCROLLBAR').map(w => w.box);

test('100vw on a scrolling page with a classic scrollbar', () => {
  const report = run('.hero{width:100vw}', classic);
  assert.equal(report.status, 'violated');
  assert.ok(report.diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.box === '.hero'));
  assert.deepEqual(warned(report), ['.hero']);
  assert.equal(run('.hero{width:100vw}', overlay).status, 'verified');
  assert.deepEqual(warned(run('.hero{width:100%}', classic)), []);
  assert.equal(run('.hero{width:100%}', classic).status, 'verified');
  // overflow-y: auto is checked in both scrollbar frames whatever the content height (a conservative model), so a page
  // that fits, which has no scrollbar in a browser, is reported too: a known over-approximation.
  assert.equal(analyzeHTML('<html lang="en"><body><div class="hero"></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html{overflow-y:auto}html,body{${g}}.hero{height:100px;width:100vw}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, scrollbars: classic}).status, 'violated');
});
