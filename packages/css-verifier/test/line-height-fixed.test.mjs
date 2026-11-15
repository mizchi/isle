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

test('a px height on text that grows with the default font size (W_LAYOUT_HEIGHT_FIXED_TEXT)', () => {
  const warned = css => (analyzeHTML('<html lang="en"><body><main class="page"><p class="t">Text</p></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.t{display:block;line-height:1.25}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.t': {minInlineSize: 40, intrinsicBlockSize: 20}}}).layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_HEIGHT_FIXED_TEXT').map(w => w.box);
  assert.deepEqual(warned('.t{height:24px;font-size:1rem}'), ['.t']);
  assert.deepEqual(warned('.t{min-height:24px;font-size:1rem}'), []);
  assert.deepEqual(warned('.t{height:24px;font-size:16px}'), []);
  assert.deepEqual(warned('html{font-size:16px}.t{height:24px;font-size:1rem}'), []);
});

test('a form control keeps the UA font size, not the page font size it seems to inherit (W_LAYOUT_CONTROL_FONT)', () => {
  const warned = css => (analyzeHTML('<html lang="en"><body><main class="page"><button class="b" aria-label="Go"></button></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}}).layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_CONTROL_FONT').map(w => [w.box, w.inheritedFrom]);
  assert.deepEqual(warned('body{font-size:18px}'), [['.b', 'body@P/0']]);
  assert.deepEqual(warned('body{font-size:18px}.b{font:inherit}'), []);
  assert.deepEqual(warned('body{font-size:18px}.b{font-size:1em}'), []);
  assert.deepEqual(warned(''), []); // no page font size: both are the default
});
