import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// An absolute font-size (px, pt, …) on html or body replaces the user's default font size setting (Chromium's
// standard font size), so text no longer follows it (W_A11Y_ROOT_FONT_FIXED); %, em, rem and keywords follow it.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = css => analyzeHTML('<html lang="en"><body><main class="page"><div class="b"></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.page{${g}}.b{height:20px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const warned = report => (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_ROOT_FONT_FIXED').map(w => w.box);

test('an absolute font-size on html or body ignores the user default font size', () => {
  assert.deepEqual(warned(run('html{font-size:16px}')), ['html@P']);
  assert.deepEqual(warned(run('body{font-size:12pt}')), ['body@P/0']);
  assert.deepEqual(warned(run('html{font-size:62.5%}')), []);
  assert.deepEqual(warned(run('html{font-size:100%}body{font-size:1rem}')), []);
  assert.deepEqual(warned(run('')), []);
  // Only the root and body: a px size on a component is not a page-wide override.
  assert.deepEqual(warned(run('.page{font-size:14px}')), []);
});
