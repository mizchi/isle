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
