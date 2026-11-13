// Flex (row, nowrap) and display: contents subsets. Outside the subset the
// result is Unknown, never verified and never a guessed violation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLayout} from '../src/index.mjs';

const status = (report, expected) => assert.equal(report.status, expected, JSON.stringify(report.diagnostics));
const reset = '* { box-sizing: border-box; margin: 0; }\n';
const card = (css, children = [{tag: 'div', classes: ['avatar']}, {tag: 'p', classes: ['name'], text: true}]) => ({tree: {tag: 'main', classes: ['row'], children}, css: reset + css});
const run = ({tree, css}, options = {}) => analyzeLayout(tree, {name: 'Card', css, viewport: {min: 100, max: 600}, boxes: {'.name': {minInlineSize: 100}}, ...options});
const base = '.row { display: flex; column-gap: 8px; padding: 0 16px; }\n.avatar { flex: none; width: 48px; }\n.name { flex: 1 1 0; min-width: 0; }\n';

test('a fixed item and a flexible item: the flexible one receives the free space', () => {
  const report = run(card(base));
  status(report, 'violated');
  const finding = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT');
  // content = V - 32; name = V - 32 - 48 - 8 must be ≥ 100
  assert.equal(finding.range.maxExact, '188');
  assert.equal(finding.range.maxInclusive, false);
  status(run(card(base), {viewport: {min: 188, max: 600}}), 'verified');
});

test('flex factors split the free space, and padding of a flexible item is outside its share', () => {
  const css = '.row { display: flex; }\n.a { flex: 1 1 0; min-width: 0; }\n.b { flex: 3 0 0; min-width: 0; padding: 0 10px; }\n';
  const children = [{tag: 'div', classes: ['a'], text: true}, {tag: 'div', classes: ['b'], text: true}];
  // free = V - 20; a = free/4 ≥ 50 ⇔ V ≥ 220; b content = 3·free/4 ≥ 150 ⇔ V ≥ 220
  const report = run(card(css, children), {boxes: {'.a': {minInlineSize: 50}, '.b': {minInlineSize: 150}}});
  status(report, 'violated');
  for (const box of ['.a', '.b']) assert.equal(report.diagnostics.find(d => d.box === box).range.maxExact, '220');
  // A factor sum below 1 leaves part of the free space unused.
  const partial = run(card('.row { display: flex; }\n.a { flex: 0.5 1 0; min-width: 0; }\n', [{tag: 'div', classes: ['a'], text: true}]), {boxes: {'.a': {minInlineSize: 100}}});
  assert.equal(partial.diagnostics.find(d => d.box === '.a').range.maxExact, '200');
});

test('fixed items overflow instead of shrinking when the line is too short', () => {
  const css = '.row { display: flex; }\n.a, .b { flex: 0 0 120px; }\n';
  const report = run(card(css, [{tag: 'div', classes: ['a']}, {tag: 'div', classes: ['b']}]), {boxes: {}});
  status(report, 'violated');
  const tracks = report.diagnostics.find(d => d.code === 'E_LAYOUT_TRACKS');
  assert.equal(tracks.range.maxExact, '240');
});

test('flex outside the modeled subset is Unknown', () => {
  for (const [extra, reason] of [
    ['.row { flex-wrap: wrap; }', /flex-wrap/],
    ['.row { flex-direction: row-reverse; }', /flex-direction/],
    ['.row { justify-content: center; }', /justify-content/],
    ['.name { min-width: auto; }', /automatic minimum/],
    ['.name { flex: 1; min-width: auto; }', /automatic minimum/],
    ['.avatar { flex: 0 1 48px; }', /shrink/],
    ['.avatar { width: auto; }', /content size/],
    ['.avatar { flex: 0 0 40px; }', /both flex-basis and width/],
    ['.avatar { order: 1; }', /order/],
    ['.name { flex: 1 1 30%; }', /flex-basis/],
  ]) {
    const report = run(card(base + extra + '\n'), {viewport: {min: 188, max: 600}});
    status(report, 'unknown');
    assert.ok(report.diagnostics.some(d => d.code === 'U_LAYOUT_FLEX' && reason.test(d.message)), `${extra}: ${JSON.stringify(report.diagnostics)}`);
  }
});

test('a definite flex container stretches its items in the cross axis', () => {
  const css = base + '.row { block-size: 60px; }\n.name { min-height: 0; }\n';
  const report = run(card(css), {viewport: {min: 188, max: 600, height: {min: 100, max: 200}}, boxes: {'.name': {minInlineSize: 100, minBlockSize: 70}}});
  status(report, 'violated');
  const block = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.axis === 'block');
  assert.equal(block.witness.available, 60);
  const sizes = report.sizes.filter(s => s.box === '.avatar');
  assert.ok(sizes.every(s => s.blockSize.constant === '60'), JSON.stringify(sizes));
});

test('display: contents children are laid out as items of the parent', () => {
  const grid = '.row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }\n.wrap { display: contents; padding: 50px; }\n.cell { min-width: 40px; }\n';
  const children = [{tag: 'div', classes: ['wrap'], children: Array.from({length: 4}, () => ({tag: 'div', classes: ['cell']}))}];
  status(run(card(grid, children), {viewport: {min: 160, max: 600}, boxes: {}}), 'verified');
  status(run(card(grid, children), {viewport: {min: 150, max: 600}, boxes: {}}), 'violated');
  // Inheritance still follows the element tree through the contents box.
  const inherited = '.row { display: flex; }\n.wrap { display: contents; white-space: nowrap; }\n.cell { flex: 1 1 0; min-width: 0; }\n';
  const report = run(card(inherited, [{tag: 'div', classes: ['wrap'], children: [{tag: 'p', classes: ['cell'], text: true}]}]), {viewport: {min: 160, max: 600}, boxes: {'.cell': {minInlineSize: 100, wrap: 'nowrap'}}});
  status(report, 'verified');
});

test('display: contents that would create anonymous boxes or sits at the root is Unknown', () => {
  const children = [{tag: 'div', classes: ['wrap'], text: true}];
  const report = run(card('.row { display: grid; grid-template-columns: minmax(0, 1fr); }\n.wrap { display: contents; }\n', children), {boxes: {}});
  status(report, 'unknown');
  assert.ok(report.diagnostics.some(d => /contents/.test(d.message)));
  status(analyzeLayout({tag: 'main', classes: ['row']}, {name: 'Card', css: '.row { display: contents; }', viewport: {min: 100, max: 600}}), 'unknown');
});

// ---- flex-direction: column ------------------------------------------------
const both = {min: 200, max: 600, height: {min: 300, max: 800}};
const page = (css, children, boxes = {}) => analyzeLayout({tag: 'main', classes: ['page'], children}, {name: 'Page', css: reset + css, viewport: both, boxes});
const column = '.page { display: flex; flex-direction: column; block-size: 100%; row-gap: 8px; padding: 16px 0; }\n';
const parts = [{tag: 'header', classes: ['head']}, {tag: 'section', classes: ['body'], children: [{tag: 'p', classes: ['copy'], text: true}]}, {tag: 'footer', classes: ['foot']}];

test('a column flex shares the free height: fixed header/footer, flexible body', () => {
  const css = column + '.head { flex: none; block-size: 56px; }\n.foot { flex: 0 0 40px; min-block-size: 0; }\n.body { flex: 1 1 0; min-block-size: 0; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }\n';
  const report = page(css, parts, {'.copy': {minInlineSize: 100, minBlockSize: 300}});
  status(report, 'violated');
  // body = H - 32 - 56 - 40 - 16 = H - 144 ≥ 300 ⇔ H ≥ 444
  const finding = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.axis === 'block');
  assert.equal(finding.heightRange.maxExact, '444');
  // 156px fits from the smallest height (300 - 144).
  status(page(css, parts, {'.copy': {minInlineSize: 100, minBlockSize: 156}}), 'verified');
  // Items stretch across: the body receives the full content width.
  const body = report.sizes.find(s => s.box === '.body');
  assert.deepEqual(body.inlineSize, {coefficient: '1', constant: '0'});
});

test('content-sized items take their intrinsic height and do not stretch along the main axis', () => {
  const css = column + '.head { flex: none; } .head { flex-basis: auto; }\n.body { flex: 1 1 0; min-block-size: 0; }\n.foot { flex: none; block-size: 40px; }\n';
  const children = [{tag: 'p', classes: ['head'], text: true}, {tag: 'div', classes: ['body']}, {tag: 'footer', classes: ['foot']}];
  const report = page(css, children, {'.head': {minInlineSize: 50, intrinsicBlockSize: 30}});
  status(report, 'verified');
  const head = report.sizes.find(s => s.box === '.head'), body = report.sizes.find(s => s.box === '.body');
  assert.deepEqual(head.blockSize, {coefficient: '0', constant: '30'});
  // body = H - 32 - 30 - 40 - 16
  assert.deepEqual(body.blockSize, {coefficient: '0', constant: '-118', heightCoefficient: '1'});
});

test('an auto-height column is the sum of its fixed and content-sized items', () => {
  const css = '.page { display: flex; flex-direction: column; row-gap: 4px; }\n.a { flex: none; block-size: 20px; }\n.b { flex: none; }\n';
  const report = analyzeLayout({tag: 'main', classes: ['page'], children: [{tag: 'div', classes: ['a']}, {tag: 'p', classes: ['b'], text: true}]},
    {name: 'Stack', css: reset + css, viewport: both, boxes: {'.b': {minInlineSize: 10, intrinsicBlockSize: 18}}});
  status(report, 'verified');
  assert.deepEqual(report.sizes.find(s => s.box === '.page').blockSize, {coefficient: '0', constant: '42'});
});

test('column flex outside the subset is Unknown', () => {
  const ok = column + '.head { flex: none; block-size: 56px; }\n.foot { flex: none; block-size: 40px; }\n.body { flex: 1 1 0; min-block-size: 0; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }\n';
  for (const [extra, reason] of [
    ['.page { block-size: auto; }', /indefinite/],
    ['.page { align-items: center; }', /align/],
    ['.body { align-self: flex-start; }', /align/],
    ['.page { justify-content: space-between; }', /justify-content/],
    ['.page { flex-direction: column-reverse; }', /flex-direction/],
    ['.body { min-block-size: auto; }', /automatic minimum|min-block-size|min-height/],
    ['.head { flex: 0 1 56px; block-size: auto; min-block-size: 0; }', /shrink/],
    ['.head { flex: 1 1 0; block-size: 56px; min-block-size: 0; }', /height/],
  ]) {
    const report = page(ok + extra + '\n', parts, {'.copy': {minInlineSize: 100, minBlockSize: 10}});
    status(report, 'unknown');
    // Cross-axis alignment is also rejected by the general both-axis alignment check.
    assert.ok(report.diagnostics.some(d => (d.code === 'U_LAYOUT_FLEX' || /alignment/.test(d.message)) && reason.test(d.message.replace('content alignment', 'align'))), `${extra}: ${JSON.stringify(report.diagnostics)}`);
  }
});

test('width-only analysis of a column flex gives every item the content width', () => {
  const css = '.page { display: flex; flex-direction: column; padding: 0 10px; }\n.a, .b { flex: none; }\n';
  const report = analyzeLayout({tag: 'main', classes: ['page'], children: [{tag: 'p', classes: ['a'], text: true}, {tag: 'p', classes: ['b'], text: true}]},
    {name: 'Stack', css: reset + css, viewport: {min: 100, max: 400}, boxes: {'.a': {minInlineSize: 150}, '.b': {minInlineSize: 50}}});
  status(report, 'violated');
  assert.equal(report.diagnostics.find(d => d.box === '.a').range.maxExact, '170');
  assert.ok(!report.diagnostics.some(d => d.box === '.b'));
});

// ---- positive minimums on flexible items, and overflow -------------------
const line = (css, children, options = {}) => analyzeLayout({tag: 'main', classes: ['row'], children}, {name: 'Line', css: reset + css, viewport: {min: 100, max: 1000}, ...options});
const size = (report, box) => report.sizes.filter(s => s.box === box);

test('a flexible item whose share falls below its min-width is frozen there and the rest is redistributed', () => {
  const css = '.row { display: flex; }\n.a { flex: 1 1 0; min-width: 120px; }\n.b { flex: 1 1 0; min-width: 0; }\n';
  const report = line(css, [{tag: 'div', classes: ['a']}, {tag: 'div', classes: ['b']}]);
  status(report, 'violated'); // below 120px the line overflows
  // V ≥ 240: equal halves; 120 ≤ V < 240: a frozen at 120, b = V - 120.
  const a = size(report, '.a'), b = size(report, '.b');
  const at = (rows, v) => rows.find(r => r.range.min <= v && v <= r.range.max && (v < r.range.max || r.range.maxInclusive));
  assert.deepEqual(at(a, 300).inlineSize, {coefficient: '1/2', constant: '0'});
  assert.deepEqual(at(a, 200).inlineSize, {coefficient: '0', constant: '120'});
  assert.deepEqual(at(b, 200).inlineSize, {coefficient: '1', constant: '-120'});
  const tracks = report.diagnostics.find(d => d.code === 'E_LAYOUT_TRACKS');
  assert.equal(tracks.range.maxExact, '120');
});

test('freezing proceeds in rounds and min-width applies to the content box of content-box items', () => {
  // a: weight 1, min 100 (content-box, padding 10 → outer 120); b: weight 2, min 300; c: weight 1, min 0
  const css = '.row { display: flex; }\n.a { flex: 1 1 0; min-width: 100px; padding: 0 10px; box-sizing: content-box; }\n.b { flex: 2 1 0; min-width: 300px; }\n.c { flex: 1 1 0; min-width: 0; }\n';
  const report = line(css, [{tag: 'div', classes: ['a']}, {tag: 'div', classes: ['b']}, {tag: 'div', classes: ['c']}]);
  const at = (box, v) => size(report, box).find(r => r.range.min <= v && v <= r.range.max);
  // V = 500: shares (V-20)/4 → b = 240 < 300 → frozen; then a: 10+... recompute free = 500-300-20 = 180 → a 20+90=110 < 120 → frozen next round; c = 500-300-120 = 80.
  assert.equal(at('.b', 500).inlineSize.constant, '300');
  assert.equal(at('.a', 500).inlineSize.constant, '120');
  assert.deepEqual(at('.c', 500).inlineSize, {coefficient: '1', constant: '-420'});
});

test('positive minimums with flex factors below one are Unknown', () => {
  const report = line('.row { display: flex; }\n.a { flex: 0.5 1 0; min-width: 50px; }\n.b { flex: 1 1 0; min-width: 0; }\n', [{tag: 'div', classes: ['a']}, {tag: 'div', classes: ['b']}]);
  status(report, 'unknown');
  assert.ok(report.diagnostics.some(d => d.code === 'U_LAYOUT_FLEX' && /factor/.test(d.message)));
});

test('a column freezes flexible items at a positive min-height', () => {
  const css = '.row { display: flex; flex-direction: column; block-size: 100%; }\n.a { flex: 1 1 0; min-block-size: 250px; }\n.b { flex: 1 1 0; min-block-size: 0; }\n';
  const report = line(css, [{tag: 'div', classes: ['a']}, {tag: 'div', classes: ['b']}], {viewport: {min: 100, max: 400, height: {min: 300, max: 900}}});
  status(report, 'verified');
  const at = (box, h) => size(report, box).find(r => r.heightRange.min <= h && h <= r.heightRange.max);
  assert.equal(at('.a', 400).blockSize.constant, '250');
  assert.deepEqual(at('.b', 400).blockSize, {coefficient: '0', constant: '-250', heightCoefficient: '1'});
  assert.deepEqual(at('.a', 800).blockSize, {coefficient: '0', constant: '0', heightCoefficient: '1/2'});
});

test('a scroll container item has a zero automatic minimum; clip does not', () => {
  const base = '.row { display: flex; }\n.a { flex: 1 1 0; }\n';
  const children = [{tag: 'div', classes: ['a'], children: [{tag: 'p', classes: ['t'], text: true}]}];
  const run = extra => line(base + extra + '\n.a { display: grid; grid-template-columns: minmax(0, 1fr); }\n', children, {boxes: {'.t': {minInlineSize: 50}}});
  status(run('.a { overflow: hidden; }'), 'verified');
  status(run('.a { overflow: auto; }'), 'unknown'); // scrollbars need a declared platform profile
  const clip = run('.a { overflow: clip; }');
  status(clip, 'unknown');
  assert.ok(clip.diagnostics.some(d => /automatic minimum/.test(d.message)));
  const visible = run('');
  status(visible, 'unknown');
});

test('flex line overflow follows the container overflow policy', () => {
  const css = '.row { display: flex; overflow-x: auto; overflow-y: hidden; }\n.a, .b { flex: 0 0 300px; }\n';
  const children = [{tag: 'div', classes: ['a']}, {tag: 'div', classes: ['b']}];
  const scrollbars = [{name: 'overlay', inlineSize: 0, blockSize: 0}];
  const scroll = line(css, children, {boxes: {'.row': {overflow: 'scroll'}}, scrollbars});
  status(scroll, 'verified');
  const fit = line(css, children, {scrollbars});
  status(fit, 'violated');
  assert.equal(fit.diagnostics.find(d => d.code === 'E_LAYOUT_TRACKS').range.maxExact, '600');
  // overflow-x: visible with overflow-y: hidden computes to auto, so it still scrolls.
  status(line(css.replace('overflow-x: auto', 'overflow-x: visible'), children, {boxes: {'.row': {overflow: 'scroll'}}, scrollbars}), 'verified');
  const policy = line(css.replace('overflow-x: auto; overflow-y: hidden;', ''), children, {boxes: {'.row': {overflow: 'scroll'}}, scrollbars});
  assert.ok(policy.diagnostics.some(d => d.code === 'E_LAYOUT_OVERFLOW_POLICY'));
});
