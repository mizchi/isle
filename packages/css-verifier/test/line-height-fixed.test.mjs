import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// A px line-height under a font-size that follows the user's default font size (rem, em, % or a keyword, with no px
// font-size on the root): a larger default grows the text but not the line, so wrapped lines overlap.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = css => (analyzeHTML('<html lang="en"><body><main class="page"><p class="t">Text</p></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.t{display:block}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.t': {minInlineSize: 40, intrinsicBlockSize: 20}}}).layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_LINE_HEIGHT_FIXED').map(w => w.box);

test('a px line-height on text that grows with the default font size', () => {
  assert.deepEqual(run('.t{font-size:1rem;line-height:20px}'), ['.t']);
  assert.deepEqual(run('.t{line-height:20px}'), ['.t']); // medium: the default itself
  // A unitless or em line-height grows with the text; a px font-size does not grow either.
  assert.deepEqual(run('.t{font-size:1rem;line-height:1.25}'), []);
  assert.deepEqual(run('.t{font-size:1rem;line-height:1.25em}'), []);
  assert.deepEqual(run('.t{font-size:16px;line-height:20px}'), []);
  // A px root font-size fixes rem and em against the default.
  assert.deepEqual(run('html{font-size:16px}.t{font-size:1rem;line-height:20px}'), []);
});
