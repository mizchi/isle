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
  const report = run(tree, css.replace('.title { white-space: nowrap; }', '.title { white-space: nowrap; overflow: hidden; }').replace('white-space: nowrap; }\n', 'white-space: nowrap; overflow: hidden; }\n'), {boxes});
  // A positioned box is an authored overlay: recorded, not an error (as vlmkit exempts it).
  assert.ok(!find(report, 'E_LAYOUT_TEXT_COLLISION'), JSON.stringify(report.diagnostics));
  const exemption = report.integrity.exempted.find(e => e.code === 'E_LAYOUT_TEXT_COLLISION');
  assert.equal(exemption.other, 'Page/1');
  assert.match(exemption.reason, /overlay/);
});

// Hand-written font-derived contracts (ADR-0010): a single line `width` px wide.
const font = {family: 'Roboto', size: 16, lineHeight: 20, weight: 400};
const line = width => ({minInlineSize: width, intrinsicBlockSize: 20, wrap: 'nowrap', font, textMetrics: {kind: 'content', text: 'x', width}});
const textCSS = '.t { white-space: nowrap; font-family: Roboto; font-size: 16px; line-height: 20px; }\n';

test('font-derived text extents find text that spills into its neighbour', () => {
  const tree = {tag: 'main', classes: ['row'], children: [{tag: 'p', classes: ['t', 'a'], text: true}, {tag: 'p', classes: ['t', 'b'], text: true}]};
  const css = textCSS + '.row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }\n';
  // a's 400px line overflows its half (overflow allowed) and reaches b's 100px line below V = 800.
  const report = run(tree, css, {boxes: {'.a': {...line(400), overflow: 'visible'}, '.b': line(100)}});
  const collision = find(report, 'E_LAYOUT_TEXT_COLLISION');
  assert.deepEqual(collision.basis, ['text', 'text']);
  assert.equal(collision.range.maxExact, '800');
  // The same boxes with border-box extents never overlap: grid cells are disjoint.
  const boxes = run(tree, css, {boxes: {'.a': {minInlineSize: 10, intrinsicBlockSize: 20, overflow: 'visible'}, '.b': {minInlineSize: 10, intrinsicBlockSize: 20}}});
  assert.ok(!find(boxes, 'E_LAYOUT_TEXT_COLLISION'));
});

test('text-align places the line, and an overflowing line is start-aligned', () => {
  const tree = {tag: 'main', classes: ['stack'], children: [{tag: 'p', classes: ['t', 'a'], text: true}, {tag: 'p', classes: ['t', 'b'], text: true}]};
  // Two rows overlapped on purpose by a negative-free trick is not possible in-flow, so
  // place b absolutely over a and read the exempted overlap regions.
  const css = textCSS + '.stack { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 20px; position: relative; block-size: 20px; }\n.b { display: block; position: absolute; top: 0; left: 0; inline-size: 100px; block-size: 20px; }\n';
  const exempted = align => run(tree, css + `.a { text-align: ${align}; }\n`, {boxes: {'.a': line(200), '.b': line(50)}}).integrity.exempted.filter(e => e.code === 'E_LAYOUT_TEXT_COLLISION');
  // start: a's line [0, 200) meets b's [0, 50) everywhere.
  assert.equal(exempted('start')[0].range.minExact, '320');
  // end: a's line [V-200, V) meets b only while V - 200 < 50.
  assert.equal(exempted('end').length, 0);
  // center: [(V-200)/2, (V+200)/2) meets [0, 50) while (V-200)/2 < 50, i.e. V < 300 — outside the domain.
  assert.equal(exempted('center').length, 0);
  const narrow = align => run(tree, css + `.a { text-align: ${align}; }\n`, {viewport: {...domain, min: 100}, boxes: {'.a': line(200), '.b': line(50)}}).integrity.exempted.filter(e => e.code === 'E_LAYOUT_TEXT_COLLISION');
  // Below 200px the 200px line overflows and is start-aligned, so it meets b again.
  assert.equal(narrow('end')[0].range.maxExact, '250');
  assert.equal(narrow('center')[0].range.maxExact, '300');
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
