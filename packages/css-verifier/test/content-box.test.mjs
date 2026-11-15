import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// width: 100% under content-box: padding and border come on top (the overflow is E_LAYOUT_ITEM_SIZE; the warning
// names the cause).
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (c, html = '<div class="f"></div>') => analyzeHTML(`<html lang="en"><body><main class="page">${html}</main></body></html>`, {name: 'P', css: `html,body,.page{${g}}body{margin:0}.f{height:20px}${c}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const warned = report => (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_CONTENT_BOX_FULL').map(w => [w.box, w.properties.join(' ')]);

test('width: 100% with padding under content-box', () => {
  const bad = run('.f{width:100%;padding:0 12px}');
  assert.equal(bad.status, 'violated');
  assert.deepEqual(warned(bad), [['.f', 'padding-left padding-right']]);
  assert.deepEqual(warned(run('.f{width:100%;border:2px solid #000}')), [['.f', 'border-left border-right']]);
  assert.deepEqual(warned(run('.f{width:100%;padding:0 12px;box-sizing:border-box}')), []);
  assert.deepEqual(warned(run('.f{padding:0 12px}')), []);
});

test('an img sized by its width attribute with no max-width overflows (W_LAYOUT_MEDIA_NO_MAX)', () => {
  const img = (css, attrs = 'width="1200" height="800"') => analyzeHTML(`<html lang="en"><body><main class="page"><img src="/a.jpg" ${attrs} alt="A"></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}img{display:block}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  const codes = r => (r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_MEDIA_NO_MAX').map(w => w.width);
  assert.deepEqual(codes(img('')), [1200]);
  assert.deepEqual(codes(img('img{max-width:100%;height:auto}')), []);
  assert.deepEqual(codes(img('img{width:100%;height:auto}')), []);
  assert.deepEqual(codes(img('', 'width="200" height="100"')), []); // fits: no overflow to explain
});

test('a wrapping text whose longest word does not fit (W_LAYOUT_LONG_WORD)', () => {
  const text = (css, contract = {minInlineSize: 300, intrinsicBlockSize: 20}) => analyzeHTML('<html lang="en"><body><main class="page"><p class="t">https://example.com/a/very/long/path</p></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.page{display:grid;grid-template-columns:200px}.t{display:block}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.t': contract}});
  const warned = r => (r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_LONG_WORD').map(w => w.box);
  assert.deepEqual(warned(text('')), ['.t']);
  // nowrap text does not wrap at all: another cause, not reported here.
  assert.deepEqual(warned(text('.t{white-space:nowrap}')), []);
  assert.deepEqual(warned(text('', {minInlineSize: 150, intrinsicBlockSize: 20})), []);
});
