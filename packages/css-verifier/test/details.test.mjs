import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// details / summary: a closed details renders only its summary; summary is a focusable list item (inside marker).
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (open, css = 'summary{list-style:none}') => analyzeHTML(`<html lang="en"><body><main class="p"><details class="d"${open}><summary class="s" aria-label="More"></summary><div class="c"></div></details><div class="n"></div></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};background:#fff}.s{height:18px}.c{height:50px;width:2000px}.n{height:5px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true});
const at = (r, box) => r.sizes.find(x => x.box === box && x.rect)?.rect.blockStart.constant;

test('a closed details hides its content; an open one lays it out', () => {
  const closed = run('');
  assert.equal(closed.status, 'verified', JSON.stringify(closed.diagnostics.map(d => d.message)));
  assert.equal(at(closed, '.n'), '18');
  const open = run(' open');
  // The 2000px content overflows only when open.
  assert.ok(open.diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.box === '.c'));
  assert.ok(!closed.diagnostics.some(d => d.box === '.c'));
});

test('summary keeps its inside disclosure marker by default (Unknown) and is focusable', () => {
  assert.equal(run('', '').status, 'unknown');
  const r = analyzeHTML('<html lang="en"><body><main class="p"><details class="d"><summary class="s"></summary></details></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};background:#fff}.s{height:18px}summary{list-style:none}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true});
  // An empty summary is a control with no name.
  assert.ok(r.diagnostics.some(d => d.code === 'E_A11Y_NAME' && d.box === '.s'), JSON.stringify(r.diagnostics.map(d => d.code)));
});
