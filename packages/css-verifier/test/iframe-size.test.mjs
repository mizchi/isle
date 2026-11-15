import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// iframes: 300×150 by default, width/height attributes as hints, no natural aspect ratio (W_LAYOUT_EMBED_NO_RATIO).
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (css, attrs = '') => analyzeHTML(`<html lang="en"><body><div class="p"><iframe src="https://example.com/embed" title="Video" ${attrs}></iframe></div></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}iframe{display:block;border:0}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const size = report => { const r = report.sizes.find(s => s.box.startsWith('iframe')); return [r.inlineSize.coefficient, r.inlineSize.constant, r.blockSize.coefficient, r.blockSize.constant]; };
const warned = report => (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_EMBED_NO_RATIO');

test('default and attribute sizes', () => {
  assert.deepEqual(size(run('.p{grid-template-columns:310px}')), ['0', '300', '0', '150']);
  assert.deepEqual(size(run('.p{grid-template-columns:310px}', 'width="320" height="180"')), ['0', '320', '0', '180']);
});

test('a width without a height stays 150px tall; aspect-ratio sizes it', () => {
  const r = run('iframe{width:100%}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics));
  assert.deepEqual(size(r), ['1', '0', '0', '150']);
  assert.ok(warned(r));
  const ratio = run('iframe{width:100%;aspect-ratio:16/9}');
  assert.equal(ratio.status, 'verified', JSON.stringify(ratio.diagnostics));
  assert.deepEqual(size(ratio).slice(2), ['9/16', '0']);
  assert.ok(!warned(ratio));
  assert.ok(!warned(run('iframe{width:100%}', 'height="400"')));
});
