import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { analyzeLayout } from '../lib/layout.mjs';

const ir = requireIR(compile('component Four() { <main class="row"><div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div></main> }'));
const tracks = n => Array(n).fill('minmax(0, 1fr)').join(' ');
const base = `* {box-sizing:border-box;margin:0} .row {display:grid;grid-template-columns:${tracks(4)}} .cell {min-width:40px}`;
const run = (css = '', options = {}) => analyzeLayout(ir, { component:'Four', css:base + css, viewport:{min:100,max:300}, ...options });
const itemFailure = report => report.diagnostics.find(row => row.code === 'E_LAYOUT_ITEM_SIZE' && row.axis === 'inline');

test('four CSS min-width 40px boxes reject exactly the domain below 160px', () => {
  const report = run();
  assert.equal(report.status, 'violated', JSON.stringify(report.diagnostics));
  assert.equal(report.diagnostics.length, 4);
  for (const failure of report.diagnostics) {
    assert.equal(failure.code, 'E_LAYOUT_ITEM_SIZE');
    assert.equal(failure.range.minExact, '100');
    assert.equal(failure.range.maxExact, '160');
    assert.equal(failure.range.maxInclusive, false);
    assert.equal(failure.witness.required, 40);
  }
  assert.equal(run('', {viewport:{min:160,max:1000}}).status, 'verified');
  assert.equal(run('', {viewport:{min:159.999999,max:159.999999}}).status, 'violated');
  assert.equal(run('', {viewport:{min:160,max:160}}).status, 'verified');
});

test('parent gap/padding/border and child content-box edges increase the minimum separately', () => {
  const report = run('.row {gap:8px;padding:12px;border:2px solid black}');
  assert.equal(itemFailure(report).range.maxExact, '212'); // 160 + 3*8 + 2*12 + 2*2
  assert.equal(run('.row {gap:8px;padding:12px;border:2px solid black}', {viewport:{min:212,max:300}}).status, 'verified');
  const child = run('.cell {box-sizing:content-box;padding:2px;border:1px solid black}');
  assert.equal(itemFailure(child).range.maxExact, '184'); // (40 + 2*2 + 2*1)*4
});

test('a 160px total is necessary but unequal track allocations still have to fit each child', () => {
  const report = run('.row {grid-template-columns:20px 20px 20px 100px}', {viewport:{min:160,max:160}});
  assert.equal(report.status, 'violated');
  assert.equal(report.diagnostics.length, 3);
  assert.ok(report.diagnostics.every(row => row.code === 'E_LAYOUT_ITEM_SIZE' && row.witness.available === 20));
});

test('responsive switching must happen at the required boundary, including fractional widths', () => {
  const two = `.row {grid-template-columns:${tracks(2)}}`;
  const fixed = run(`@media (width < 160px) {${two}}`, {viewport:{min:80,max:300}});
  assert.equal(fixed.status, 'verified', JSON.stringify(fixed.diagnostics));
  const broken = run(`@media (width < 159px) {${two}}`, {viewport:{min:80,max:300}});
  assert.equal(broken.status, 'violated');
  assert.equal(itemFailure(broken).range.minExact, '159');
  assert.equal(itemFailure(broken).range.maxExact, '160');
  assert.equal(itemFailure(broken).range.maxInclusive, false);
});

test('only reachable combinations of media height and container width are accepted', () => {
  const css = `.row {container: Row / inline-size;block-size:100px;grid-template-columns:${tracks(2)}}
    @media (height >= 400px) { @container Row (width >= 150px) { .cell {min-width:80px} } }`;
  const report = run(css, {viewport:{min:100,max:300,height:{min:300,max:500}}});
  assert.equal(report.status, 'violated');
  const failure = itemFailure(report);
  assert.equal(failure.range.minExact, '150'); assert.equal(failure.range.maxExact, '160');
  assert.equal(failure.heightRange.minExact, '400'); assert.equal(failure.heightRange.maxExact, '500');
  assert.ok(failure.region.constraints.length);
  const safe = run(css.replace('width >= 150px', 'width >= 160px'), {viewport:{min:100,max:300,height:{min:300,max:500}}});
  assert.equal(safe.status, 'verified', JSON.stringify(safe.diagnostics));
  const unreachable = run(`.row {grid-template-columns:${tracks(2)}} @media (width < 120px) { @media (width >= 160px) { .cell {min-width:900px} } }`, {viewport:{min:80,max:300}});
  assert.equal(unreachable.status, 'verified');
});

test('unsupported min/max semantics remain unknown, and min-width never proves text fit', () => {
  // A px or percentage max-width is modeled (it caps the preferred width); other max forms are not.
  for (const css of ['.cell {min-width:20%}', '.cell {max-width:min-content}', '.cell {min-width:min-content}', '.cell {min-height:40px}']) {
    assert.equal(run(css, {viewport:{min:160,max:300,height:{min:300,max:500}}}).status, 'unknown', css);
  }
  for (const css of ['.cell {max-width:40px}', '.cell {max-width:40%}']) assert.notEqual(run(css, {viewport:{min:160,max:300,height:{min:300,max:500}}}).status, 'unknown', css);
  const text = requireIR(compile('component Text() {<p class="cell">Unbounded content</p>}'));
  assert.equal(analyzeLayout(text, {component:'Text',css:base,viewport:{min:160,max:300}}).status, 'unknown');
});

test('uniform-row thresholds agree with an independent bounded sum-of-outer-minima oracle', () => {
  let cases = 0;
  for (const count of [1,2,3,4]) {
    const program = requireIR(compile(`component Row() {<main class="row">${'<div class="cell"></div>'.repeat(count)}</main>}`));
    for (const minimum of [0,1,40]) for (const gap of [0,3]) for (const padding of [0,2]) for (const border of [0,1]) for (const boxSizing of ['border-box','content-box']) {
      const childEdges = 6, required = count * (boxSizing === 'content-box' ? minimum + childEdges : Math.max(minimum, childEdges)) + (count - 1) * gap + 2 * padding + 2 * border;
      const css = `*{box-sizing:border-box;margin:0}.row{display:grid;grid-template-columns:${tracks(count)};gap:${gap}px;padding:${padding}px;border:${border}px solid black}.cell{min-width:${minimum}px;box-sizing:${boxSizing};padding:2px;border:1px solid black}`;
      const below = analyzeLayout(program, {component:'Row',css,viewport:{min:required-1,max:required-1}});
      const at = analyzeLayout(program, {component:'Row',css,viewport:{min:required,max:required+100}});
      assert.equal(below.status, 'violated', `${count}/${minimum}/${gap}/${padding}/${border}/${boxSizing}`);
      assert.equal(at.status, 'verified', JSON.stringify(at.diagnostics));
      cases++;
    }
  }
  assert.equal(cases, 192);
});
