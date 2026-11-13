// Static counterparts of the box-model rules of `vlmkit check integrity`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLayout} from '../src/index.mjs';

const reset = '* { box-sizing: border-box; margin: 0; }\n';
const domain = {min: 320, max: 1280, height: {min: 400, max: 900}};
const run = (tree, css, options = {}) => analyzeLayout(tree, {name: 'Page', css: reset + css, viewport: domain, integrity: true, ...options});
const codes = report => report.diagnostics.map(d => d.code);
const find = (report, code) => report.diagnostics.find(d => d.code === code);

test('integrity rules are opt-in and leave existing results unchanged', () => {
  const tree = {tag: 'main', classes: ['row'], children: [{tag: 'div', classes: ['a']}]};
  const css = '.row { display: flex; }\n.a { flex: none; width: 900px; }\n';
  const plain = analyzeLayout(tree, {name: 'Page', css: reset + css, viewport: domain});
  assert.ok(!codes(plain).some(c => /PAGE_OVERFLOW|PROTRUSION/.test(c)));
  assert.equal(plain.integrity, undefined);
  const checked = run(tree, css);
  assert.deepEqual(checked.integrity.rules, ['page-overflow-x', 'container-protrusion', 'text-collision', 'target-undersized', 'clipped-content', 'nested-scroll']);
});

test('page-overflow-x and container-protrusion find a rigid row even when its overflow is allowed', () => {
  const tree = {tag: 'main', classes: ['row'], children: [{tag: 'div', classes: ['a']}, {tag: 'div', classes: ['b']}]};
  const css = '.row { display: flex; padding: 0 16px; column-gap: 8px; }\n.a { flex: none; width: 700px; }\n.b { flex: none; width: 100px; }\n';
  // The contract allows the line to overflow, so only the integrity rules speak.
  const report = run(tree, css, {boxes: {'.row': {overflow: 'visible'}}});
  assert.equal(report.status, 'violated');
  assert.ok(!codes(report).includes('E_LAYOUT_TRACKS'));
  const page = report.diagnostics.filter(d => d.code === 'E_LAYOUT_PAGE_OVERFLOW');
  // .b ends at 16 + 700 + 8 + 100 = 824
  assert.equal(page.find(d => d.box === '.b').range.maxExact, '824');
  const protrusion = report.diagnostics.find(d => d.code === 'E_LAYOUT_PROTRUSION' && d.box === '.b');
  assert.equal(protrusion.range.maxExact, '824'); // the padding box (padding included) ends at V
  assert.equal(protrusion.parent, 'Page');
  assert.equal(run(tree, css, {boxes: {'.row': {overflow: 'visible'}}, viewport: {...domain, min: 824}}).status, 'verified');
});

test('text-collision finds an absolutely positioned label over a text leaf', () => {
  const tree = {tag: 'main', classes: ['card'], children: [{tag: 'p', classes: ['title'], text: true}, {tag: 'span', classes: ['badge'], text: true}]};
  const css = '.card { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 40px; position: relative; block-size: 40px; }\n.title { white-space: nowrap; }\n.badge { display: block; position: absolute; top: 0; right: 0; inline-size: 60px; block-size: 20px; white-space: nowrap; }\n';
  const boxes = {'.title': {minInlineSize: 10, overflow: 'clip', overflowBlock: 'clip'}, '.badge': {minInlineSize: 10, overflow: 'clip', overflowBlock: 'clip'}};
  const report = run(tree, css, {boxes});
  const collision = find(report, 'E_LAYOUT_TEXT_COLLISION');
  assert.ok(collision, JSON.stringify(report.diagnostics));
  assert.equal(collision.other, 'Page/1');
});

test('target-undersized requires 24px buttons in both axes', () => {
  const tree = size => ({tag: 'main', classes: ['bar'], children: [{tag: 'button', classes: ['b'], text: true}]});
  const css = size => `.bar { display: grid; grid-template-columns: ${size}px; grid-template-rows: ${size}px; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n`;
  const boxes = {'.b': {minInlineSize: 1, overflow: 'clip', overflowBlock: 'clip'}};
  const small = run(tree(), css(20), {boxes});
  assert.equal(find(small, 'E_LAYOUT_TARGET_SIZE').axis, 'inline');
  assert.ok(!codes(run(tree(), css(24), {boxes})).includes('E_LAYOUT_TARGET_SIZE'));
  assert.ok(!codes(run(tree(), css(20), {boxes, integrity: {targetSize: 16}})).includes('E_LAYOUT_TARGET_SIZE'));
});

test('clipped-content and nested-scroll are warnings that do not change the status', () => {
  const clipped = run({tag: 'main', classes: ['frame'], children: [{tag: 'div', classes: ['wide']}]},
    '.frame { display: grid; grid-template-columns: minmax(0, 1fr); overflow: hidden; }\n.wide { inline-size: 900px; }\n',
    {boxes: {'.frame': {overflow: 'clip'}}});
  assert.equal(clipped.status, 'verified', JSON.stringify(clipped.diagnostics));
  const warning = clipped.integrity.warnings.find(w => w.code === 'W_LAYOUT_CLIPPED');
  assert.equal(warning.range.maxExact, '900');
  const scrollbars = [{name: 'overlay', inlineSize: 0, blockSize: 0}];
  const nested = run({tag: 'main', classes: ['outer'], children: [{tag: 'div', classes: ['inner'], children: [{tag: 'div', classes: ['content']}]}]},
    '.outer { display: grid; grid-template-columns: 1200px; overflow: auto; }\n.inner { display: grid; grid-template-columns: 1400px; overflow: auto; }\n.content { min-width: 0; }\n',
    {boxes: {'.outer': {overflow: 'scroll'}, '.inner': {overflow: 'scroll'}}, scrollbars});
  assert.equal(nested.status, 'verified', JSON.stringify(nested.diagnostics));
  assert.ok(nested.integrity.warnings.some(w => w.code === 'W_LAYOUT_NESTED_SCROLL' && w.path === 'Page/0'), JSON.stringify(nested.integrity.warnings));
});
