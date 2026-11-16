import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// min-block-size (px, %, viewport units): a leaf's content height, an explicit (or max-capped) height and a stretched
// grid item's height are raised to it (min wins over max); a block-flow container's content stays at the top.
// Where it would stretch rows or a flex line (grid and flex containers, flex items) it stays Unknown.
const g = 'display:grid;grid-template-columns:minmax(0,1fr);align-content:start';
const run = css => analyzeHTML('<html lang="en"><body><main class="p"><div class="a"></div><div class="n"></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.p{${g}}.n{height:5px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const at = (r, vh = 700) => { const a = r.sizes.find(s => s.box === '.a'), n = r.sizes.find(s => s.box === '.n'); const v = x => (x = x.constant !== undefined ? x : x, Number(String(x.constant).split('/').reduce((p, c) => p / c)) + Number(String(x.heightCoefficient ?? 0).split('/').reduce((p, c) => p / c)) * vh); return [v(a.rect?.blockSize ?? a.blockSize), v(n.rect.blockStart)]; };

test('leaves, explicit heights and units', () => {
  for (const [css, expected] of [['.a{min-height:40px}', [40, 40]], ['.a{height:20px;min-height:40px}', [40, 40]], ['.a{height:80px;max-height:30px;min-height:40px}', [40, 40]], ['.a{min-height:40px;padding:5px;box-sizing:content-box}', [50, 50]], ['.a{height:60px;min-height:40px}', [60, 60]]]) {
    const r = run(css);
    assert.equal(r.status, 'verified', `${css} ${JSON.stringify(r.diagnostics.map(d => d.message))}`);
    assert.deepEqual(at(r), expected, css);
  }
  const vh = run('.a{min-height:50vh}');
  assert.equal(vh.status, 'verified', JSON.stringify(vh.diagnostics.map(d => d.message)));
  assert.deepEqual(at(vh, 700), [350, 350]);
});

test('a fixed row smaller than min-height: the item overflows it', () => {
  const r = run('.p{grid-template-rows:20px 20px}.a{min-height:40px}');
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.equal(r.sizes.find(s => s.box === '.a').blockSize.constant, '40');
});

test('block flow: the container is raised, its children stay at the top', () => {
  const r = analyzeHTML('<html lang="en"><body><main class="p"><div class="a"><i class="k"></i></div><div class="n"></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:block}.n{height:5px}.a{min-height:40px}.k{display:block;height:10px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(['.a', '.k', '.n'].map(b => r.sizes.find(s => s.box === b)).map(s => [s.rect.blockStart.constant, s.blockSize.constant]), [['0', '40'], ['0', '10'], ['40', '5']]);
});

test('grid and flex containers and flex items stay Unknown', () => {
  assert.equal(run('.a{display:grid;grid-template-columns:minmax(0,1fr);min-height:40px}.a::before{content:"";display:block;height:10px}').status, 'unknown');
  assert.equal(run('.p{display:flex}.a{width:10px;min-height:40px}.n{width:10px}').status, 'unknown');
});

test('grid and flex containers: where the content is shorter, laid out at the minimum (rows and the line stretch)', () => {
  const g2 = 'display:grid;grid-template-columns:minmax(0,1fr);align-content:start';
  const lay = css => analyzeHTML('<html lang="en"><body><div class="s"><div class="h"></div><div class="m"></div><div class="f"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g2}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  const rect = (r, b, vh) => { const s = r.sizes.find(x => x.box === b).rect; const v = a => Number(String(a.constant).split('/').reduce((p, c) => p / c)) + Number(String(a.heightCoefficient ?? 0).split('/').reduce((p, c) => p / c)) * vh; return [v(s.blockStart), v(s.blockSize)]; };
  const cases = [
    ['.s{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto;min-height:100vh}.h{height:20px}.m{height:30px}.f{height:10px}', 600, [[0, 600], [0, 20], [20, 30], [590, 10]]],
    ['.s{display:grid;grid-template-columns:minmax(0,1fr);min-height:200px}.h{height:20px}', 600, [[0, 200], [0, 20], [80, 60], [140, 60]]],
    ['.s{display:grid;grid-template-columns:minmax(0,1fr);min-height:200px;align-content:start}.h{height:20px}', 600, [[0, 200], [0, 20], [20, 0], [20, 0]]],
    ['.s{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto;min-height:200px;padding:10px}.h{height:20px}', 600, [[0, 200], [10, 20], [30, 160], [190, 0]]],
    ['.s{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);min-height:100px;padding:10px;box-sizing:content-box}.h{height:20px}', 600, [[0, 120], [10, 20], [30, 80], [110, 0]]],
    ['.s{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto;min-height:50px}.h{height:20px}.m{height:30px}.f{height:10px}', 600, [[0, 60], [0, 20], [20, 30], [50, 10]]],
    ['.s{display:flex;flex-direction:column;min-height:200px}.h{height:20px}.m{flex:1}.f{height:10px}', 600, [[0, 200], [0, 20], [20, 170], [190, 10]]],
    ['.s{display:flex;min-height:100px}.h,.m,.f{width:30px}', 600, [[0, 100], [0, 100], [0, 100], [0, 100]]],
  ];
  for (const [css, vh, expected] of cases) {
    const r = lay(css);
    assert.equal(r.status, 'verified', `${css} ${JSON.stringify(r.diagnostics.map(d => d.message))}`);
    assert.deepEqual(['.s', '.h', '.m', '.f'].map(b => rect(r, b, vh)), expected, css);
  }
});
