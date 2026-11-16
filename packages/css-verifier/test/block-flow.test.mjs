import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Block containers of block-level children (no vertical margins): a one-column grid whose rows do not stretch.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (inner, css) => analyzeHTML(`<html lang="en"><body><main class="p"><section class="box">${inner}</section></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.box{display:block;padding:7px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const rects = (report, viewport) => report.sizes.filter(s => s.rect && s.range.min <= viewport && viewport <= s.range.max && /^\.[ab]$/.test(s.box)).map(s => { const v = t => Number(String(t).split('/').map(Number).reduce((a, b) => a / b)); const at = a => v(a.coefficient) * viewport + v(a.constant); return [s.box, at(s.rect.inlineStart), at(s.rect.blockStart), at(s.rect.inlineSize), at(s.rect.blockSize)]; });

test('children stack and fill; a fixed-height container does not stretch them', () => {
  const r = run('<div class="a"></div><div class="b"></div>', '.a{height:20px}.b{height:30px;width:50%}.box{height:200px}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(r, 500), [['.a', 7, 7, 486, 20], ['.b', 7, 27, 243, 30]]);
  // A 2000px child overflows.
  assert.ok(run('<div class="a"></div>', '.a{height:20px;width:2000px}').diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE'));
});

test('auto margins with an auto width: the width fills up to max-width and the box is centered', () => {
  const r = run('<div class="a"></div>', '.a{height:10px;max-width:300px;margin:0 auto}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(r, 500)[0], ['.a', 100, 7, 300, 10]);
  // Narrower than max-width + padding: it fills and the margins are 0.
  assert.deepEqual(rects(r, 320)[0], ['.a', 10, 7, 300, 10]);
  assert.deepEqual(rects(run('<div class="a"></div>', '.a{height:10px;max-width:400px;margin:0 auto}'), 320)[0], ['.a', 7, 7, 306, 10]);
});

test('vertical margins of adjacent siblings collapse to the larger one', () => {
  const r = run('<div class="a"></div><div class="b"></div>', '.a,.b{height:10px}.a{margin-bottom:20px}.b{margin-top:12px}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(r, 500).map(x => x[2]), [7, 37]);
  assert.deepEqual(rects(run('<div class="a"></div><div class="b"></div>', '.a,.b{height:10px}.a{margin-bottom:8px}.b{margin-top:30px}'), 500).map(x => x[2]), [7, 47]);
});

test('inline content and margins collapsing through the container or an empty child stay Unknown', () => {
  assert.equal(run('<span class="a"></span>', '.a{height:10px}').status, 'unknown');
  // (.box is a grid item here, a formatting context root: its child's margin stays inside — modeled. Collapsing
  // through a plain block child is the Unknown case, tested below.)
  assert.equal(run('<div class="a"></div>', '.box{padding:0}.a{height:10px;margin-top:8px}').status, 'verified');
  assert.equal(run('<div class="a"></div><div class="b"></div>', '.a{margin:4px 0}.b{height:10px}').status, 'unknown');
});

test('a fixed-height block container keeps its scroll-container children at their size (no grid row shrink)', () => {
  const r = run('<div class="a"><div class="k"></div></div><div class="b"><div class="k"></div></div>', '.box{height:50px;padding:0}.a,.b{display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden}.k{height:40px}');
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(r.sizes.filter(s => ['.a', '.b'].includes(s.box)).map(s => s.blockSize.constant), ['40', '40']);
  // Their 80px overflow the 50px container (as in Chromium).
  assert.ok(r.diagnostics.some(d => d.code === 'E_LAYOUT_TRACKS' && d.axis === 'block'));
});

test('grid placement and align-self do nothing in block flow; justify-self (it does align there) is Unknown', () => {
  const inert = css => (run('<div class="a"></div><div class="b"></div>', `.a,.b{height:10px}${css}`).layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_DECLARATION_INERT').map(w => w.properties.join());
  assert.deepEqual(inert('.a{grid-column:2}'), ['grid-column']);
  assert.deepEqual(inert('.a{align-self:end}'), ['align-self']);
  assert.equal(run('<div class="a"></div>', '.a{height:10px;width:100px;justify-self:end}').status, 'unknown');
});

test('list items lay out as blocks (an outside marker takes no part); an inside marker is Unknown', () => {
  const list = css => analyzeHTML('<html lang="en"><body><main class="p"><ul class="l"><li class="a"></li><li class="b"></li></ul></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}ul{padding:0 0 0 20px}.a,.b{height:10px}.b{width:100px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  const r = list('');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(r, 500), [['.a', 20, 0, 480, 10], ['.b', 20, 10, 100, 10]]);
  assert.equal(list('ul{list-style:inside}').status, 'unknown');
  assert.equal(list('ul{list-style:none inside}').status, 'verified');
});

test('W_LAYOUT_MARKER_HIDDEN: outside markers of a list at the viewport edge are not seen', () => {
  const list = css => (analyzeHTML('<html lang="en"><body><div class="w"><ul class="l"><li class="a"></li><li class="b"></li></ul></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.w{${g}}.a,.b{height:10px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}}).layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_MARKER_HIDDEN').map(w => w.box);
  assert.deepEqual(list('ul{padding:0}'), ['.a', '.b']);
  // Under a clipping ancestor positions are not tracked: not reported.
  assert.deepEqual(list('.w{overflow:hidden;margin-left:30px}ul{padding:0}'), []);
  // overflow-x: clip never scrolls: positions are exact, and its edge hides the marker.
  assert.deepEqual(list('.w{overflow-x:clip;margin-left:30px}ul{padding:0}'), ['.a', '.b']);
  assert.deepEqual(list('.w{overflow-x:clip;margin-left:30px;padding-left:24px}ul{padding:0}'), []);
  assert.deepEqual(list('.w{padding-left:16px}ul{padding:0}'), []);
  assert.deepEqual(list('ul{padding:0 0 0 24px}'), []);
  assert.deepEqual(list('ul{padding:0;list-style:none}'), []);
  assert.deepEqual(list('ul{padding:0;list-style-position:inside}li{height:auto}'), []);
});

test('a block container that is a formatting context root keeps its children\'s margins inside', () => {
  const box = (outer, own) => analyzeHTML('<html lang="en"><body><div class="o"><section class="s"><div class="a"></div></section><div class="n"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.o{${outer}}.s{display:block;${own}}.a{height:10px;margin-top:12px;margin-bottom:8px}.n{height:5px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  const grid = box(g, '');
  assert.equal(grid.status, 'verified', JSON.stringify(grid.diagnostics.map(d => d.message)));
  assert.deepEqual(['.s', '.a', '.n'].map(b => grid.sizes.find(x => x.box === b).rect.blockStart.constant), ['0', '12', '30']);
  assert.equal(box('display:block', 'overflow:hidden').status, 'verified');
  // A plain block child: the margin collapses through it (see below).
  assert.equal(box('display:block', '').status, 'verified');
});

test('a child\'s first and last margins collapse through a plain block parent (the larger one wins)', () => {
  const box = own => analyzeHTML('<html lang="en"><body><div class="o"><div class="m"></div><section class="s"><div class="a"></div><div class="z"></div></section><div class="n"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.o{display:block}.m{height:4px;margin-bottom:6px}.s{display:block;${own}}.a{height:10px;margin-top:12px}.z{height:3px;margin-bottom:8px}.n{height:5px;margin-top:2px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  const at = (r, b) => r.sizes.find(x => x.box === b).rect.blockStart.constant;
  const r = box('');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  // .s's top margin is max(0, 12) = 12, collapsed with .m's 6: .s and .a start at 16. .s ends at 29, its bottom margin 8 (vs .n's 2).
  assert.deepEqual(['.s', '.a', '.z', '.n'].map(b => at(r, b)), ['16', '16', '26', '37']);
  // The parent's own margin is larger: it wins.
  assert.deepEqual(['.s', '.a', '.n'].map(b => at(box('margin-top:20px;margin-bottom:9px'), b)), ['24', '24', '46']);
  // Padding on top stops the top collapse; the bottom still collapses.
  assert.deepEqual(['.s', '.a', '.n'].map(b => at(box('padding-top:1px'), b)), ['10', '23', '44']);
  // A fixed height stops the bottom collapse.
  assert.deepEqual(['.s', '.n'].map(b => at(box('height:20px'), b)), ['16', '38']);
});

test('margins collapse through several plain block levels (Chromium positions)', () => {
  const deep = css => analyzeHTML('<html lang="en"><body><div class="o"><div class="m"></div><section class="s"><div class="t"><div class="a"></div></div></section><div class="n"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.o,.s,.t{display:block}.n{height:5px}.m{height:4px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  for (const [css, expected] of [
    ['.a{height:10px;margin-top:12px}', ['16', '16', '16', '26']],
    ['.a{height:10px;margin-top:12px;margin-bottom:7px}.t{margin-bottom:3px}', ['16', '16', '16', '33']],
    ['.s{margin-top:20px}.a{height:10px;margin-top:12px}', ['24', '24', '24', '34']],
    ['.t{padding-top:1px}.a{height:10px;margin-top:12px}', ['4', '4', '17', '27']],
  ]) {
    const r = deep(css);
    assert.equal(r.status, 'verified', `${css} ${JSON.stringify(r.diagnostics.map(d => d.message))}`);
    assert.deepEqual(['.s', '.t', '.a', '.n'].map(b => r.sizes.find(x => x.box === b).rect.blockStart.constant), expected, css);
  }
});

test('a block whose only child is an inline link with text is a text leaf (the link is its inline content)', () => {
  const doc = inner => analyzeHTML(`<html lang="en"><body><main class="p"><h1 class="h" aria-label="T"></h1>${inner}<div class="n"></div></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};background:#fff;color:#000}.h{height:10px}.t{display:block;line-height:24px}.l{color:#000}.n{height:5px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true, boxes: {'.l': {minInlineSize: 0, intrinsicBlockSize: 24}}});
  const r = doc('<p class="t"><a class="l" href="/x">Pricing</a></p>');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.equal(r.sizes.find(s => s.box === '.n' && s.rect).rect.blockStart.constant, '34');
  assert.ok(!r.diagnostics.some(d => d.code === 'E_A11Y_NAME'));
});

test('a block of several inline elements with its own contract is one text leaf', () => {
  const r = analyzeHTML(`<html lang="en"><body><main class="p"><h1 class="h" aria-label="T"></h1><p class="t"><a class="l" href="/me">Alex</a> <span class="d">today</span></p><div class="n"></div></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};background:#fff;color:#000}.h{height:10px}.t{display:block;line-height:24px}.l{color:#000}.n{height:5px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true, boxes: {'.t': {minInlineSize: 0, intrinsicBlockSize: 24}, '.l': {minInlineSize: 0, intrinsicBlockSize: 24}, '.d': {minInlineSize: 0, intrinsicBlockSize: 24}}});
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.equal(r.sizes.find(s => s.box === '.n' && s.rect).rect.blockStart.constant, '34');
});

test('a block container with one display: block link is block flow, not a text leaf folding the link', () => {
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
  const boxes = {'.a': {minInlineSize: 100, intrinsicBlockSize: 24, font}};
  // nav > a { display: block }: the link is a block-level child with its own font (the nav's is medium).
  const r = analyzeHTML(`<html lang="en"><body><main class="p"><nav class="box"><a class="a" href="/s">Getting started</a></nav></main></body></html>`,
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.box{display:block;padding:7px}.a{display:block;font-family:Roboto;font-size:16px;line-height:24px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes});
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(r, 500), [['.a', 7, 7, 486, 24]]);
});

test('grid align-items center / align-self end: items keep their height and move in their area', () => {
  const r = analyzeHTML(`<html lang="en"><body><main class="p"><section class="g"><div class="a"></div><div class="b"></div><div class="c"></div></section></main></body></html>`,
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.g{display:grid;grid-template-columns:40px minmax(0,1fr) 30px;align-items:center}.a{height:20px}.b{height:60px}.c{height:10px;align-self:end}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(r, 500), [['.a', 0, 20, 40, 20], ['.b', 40, 0, 430, 60]]);
  // baseline stays Unknown.
  assert.equal(analyzeHTML(`<html lang="en"><body><main class="p"><section class="g"><div class="a"></div></section></main></body></html>`,
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.g{display:grid;grid-template-columns:minmax(0,1fr);align-items:baseline}.a{height:20px}`, viewport: {min: 320, max: 800}}).status, 'unknown');
});

test('border-width: 0 (a reset, StyleX borderWidth: 0) is no border; a non-zero width without the shorthand is Unknown', () => {
  const r = run('<div class="a"></div>', '.a{height:20px;border-width:0;padding:0 4px}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(r, 500), [['.a', 7, 7, 486, 20]]);
  assert.equal(run('<div class="a"></div>', '.a{height:20px;border-top-width:0px}').status, 'verified');
  assert.equal(run('<div class="a"></div>', '.a{height:20px;border-width:2px}').status, 'unknown');
});

test('a text field with an auto width stretches in a grid column, not in block flow', () => {
  const field = (container) => analyzeHTML(`<html lang="en"><body><main class="p"><section class="${container}"><input class="a" type="email" aria-label="Email"></section></main></body></html>`,
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.grid{${g};padding:7px}.flow{display:block;padding:7px}.a{height:40px;padding:0 8px;border:1px solid #767676}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  const grid = field('grid');
  assert.equal(grid.status, 'verified', JSON.stringify(grid.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(grid, 500), [['.a', 7, 7, 486, 40]]);
  // In block flow an auto-width input keeps its intrinsic width (195px in Chromium), which is not modeled.
  assert.equal(field('flow').status, 'unknown');
});

test('minmax(0, 480px) grows to its limit and shrinks with the container; minmax(Apx, Bpx) never goes below A', () => {
  const grid = cols => analyzeHTML(`<html lang="en"><body><main class="p"><section class="box"><div class="a"></div><div class="b"></div></section></main></body></html>`,
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.box{display:grid;grid-template-columns:${cols};padding:7px}.a,.b{height:10px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  const r = grid('minmax(0, 300px) minmax(0, 1fr)');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  // 486px of content: the first track reaches 300px, the fr track takes the remaining 186px.
  assert.deepEqual(rects(r, 500), [['.a', 7, 7, 300, 10], ['.b', 307, 7, 186, 10]]);
  // 400px each at least: overflows below 814px.
  assert.ok(grid('minmax(400px, 500px) minmax(400px, 500px)').diagnostics.some(d => d.code === 'E_LAYOUT_TRACKS'));
});

test('an automatic table column whose cells each hold one px-wide block is as wide as the widest block plus the cell padding', () => {
  const r = analyzeHTML(`<html lang="en"><body><main class="p"><table class="t"><tbody><tr><td class="c"><div class="x1"></div></td><td class="c"><div class="x2"></div></td></tr><tr><td class="c"><div class="x1"></div></td><td class="c"><div class="x3"></div></td></tr></tbody></table></main></body></html>`,
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:block}.t{border-collapse:collapse}.c{padding:8px}.x1,.x2,.x3{display:block;height:24px}.x1{width:24px}.x2{width:60px}.x3{width:90px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  const cells = r.sizes.filter(s => s.box === '.c' && s.rect).slice(0, 2).map(s => Number(s.rect.inlineSize.constant));
  assert.deepEqual(cells, [40, 106]);
});

test('a date input takes the text field box: content-box with its author width, height, padding and border', () => {
  const r = analyzeHTML(`<html lang="en"><body><main class="p"><section class="box"><input class="a" type="date" aria-label="Date"></section></main></body></html>`,
    {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.box{display:block;padding:7px}.a{display:block;box-sizing:content-box;width:200px;height:40px;padding:0 8px;border:1px solid #767676}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(rects(r, 500), [['.a', 7, 7, 218, 42]]);
});

test('an absolute dropdown taller than its positioned parent hangs out of it without an error; a fixed box taller than the viewport is still one', () => {
  const page = (pos, h) => analyzeHTML(`<html lang="en"><body><main class="p"><section class="box"><div class="f"></div><ul class="list"></ul></section></main></body></html>`,
    {name: 'P', css: `*{box-sizing:border-box;margin:0;padding:0}html,body{${g}}.p{${g}}.box{position:relative;display:grid;grid-template-columns:minmax(0,1fr)}.f{height:40px}.list{position:${pos};top:44px;left:0;width:200px;height:${h}px;background:#fff}`, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], integrity: true});
  const hang = page('absolute', 120);
  assert.ok(!hang.diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE'), JSON.stringify(hang.diagnostics.map(d => d.message)));
  assert.ok(page('fixed', 1000).diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE'), 'a fixed box taller than the viewport cannot be scrolled to');
});
