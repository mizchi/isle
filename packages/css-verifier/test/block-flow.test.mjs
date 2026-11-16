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
  // A plain block child: the margin collapses through it, which is not modeled.
  assert.equal(box('display:block', '').status, 'unknown');
});

test('a block whose only child is an inline link with text is a text leaf (the link is its inline content)', () => {
  const doc = inner => analyzeHTML(`<html lang="en"><body><main class="p"><h1 class="h" aria-label="T"></h1>${inner}<div class="n"></div></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};background:#fff;color:#000}.h{height:10px}.t{display:block;line-height:24px}.l{color:#000}.n{height:5px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true, boxes: {'.l': {minInlineSize: 0, intrinsicBlockSize: 24}}});
  const r = doc('<p class="t"><a class="l" href="/x">Pricing</a></p>');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.equal(r.sizes.find(s => s.box === '.n' && s.rect).rect.blockStart.constant, '34');
  assert.ok(!r.diagnostics.some(d => d.code === 'E_A11Y_NAME'));
});
