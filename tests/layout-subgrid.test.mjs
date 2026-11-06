import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { analyzeLayout } from '../lib/layout.mjs';

const source = `component Board() { <main class="board"><section class="group"><div class="a"></div><div class="b"></div></section><div class="peer"></div></main> }`;
const css = `* { box-sizing: border-box; margin: 0; }
  .board { display: grid; grid-template-columns: 100px minmax(0, 1fr) 180px; gap: 20px; }
  .group { display: grid; grid-template-columns: subgrid; grid-column: 1 / span 2; }
  .peer { grid-column: 3; grid-row: 1; }`;
const run = (extra = '', options = {}, text = source) => analyzeLayout(requireIR(compile(text)), { component: 'Board', css: css + extra, viewport: { min: 500, max: 500 }, ...options });
const size = (report, box, axis = 'inline') => report.sizes.find(row => row.box === box)?.[`${axis}Size`];
const verified = report => assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics));

test('subgrid selects its parent tracks rather than redistributing its own width', () => {
  const report = run(); verified(report);
  assert.deepEqual(size(report, '.a'), { coefficient: '0', constant: '100' });
  assert.deepEqual(size(report, '.b'), { coefficient: '1', constant: '-320' });
  assert.deepEqual(size(report, '.group'), { coefficient: '1', constant: '-200' });
  const axis = report.subgrids.find(row => row.box === '.group');
  assert.equal(axis.parent, '.board'); assert.equal(axis.axis, 'inline');
  assert.equal(axis.startLine, 1); assert.equal(axis.span, 2); assert.equal(axis.gap, '20');
});

test('numeric local lines and nested subgrids keep the inherited track identity', () => {
  const text = source.replace('<div class="a"></div><div class="b"></div>', '<section class="inner"><div class="a"></div><div class="b"></div></section>');
  const report = run('.group { grid-column: 2 / 4; padding: 10px; border: 2px solid black; } .inner { display: grid; grid-template-columns: subgrid; grid-column: 1 / 3; padding: 4px; }', {}, text);
  verified(report);
  assert.deepEqual(size(report, '.a'), { coefficient: '1', constant: '-336' });
  assert.deepEqual(size(report, '.b'), { coefficient: '0', constant: '164' });
  assert.equal(report.subgrids.find(row => row.box === '.inner').parent, '.group');
});

test('normal inherits the parent gap; explicit gaps are centered on parent grid lines', () => {
  for (const [gap, a, b] of [['normal', '88', '-332'], ['4px', '96', '-324'], ['36px', '80', '-340']]) {
    const report = run(`.group { padding: 10px; border: 2px solid black; column-gap: ${gap}; }`); verified(report);
    assert.equal(size(report, '.a').constant, a);
    assert.equal(size(report, '.b').constant, b);
  }
  const single = run('.group { grid-column: 2; gap: 100px; } .b { display: none; }'); verified(single);
  assert.deepEqual(size(single, '.a'), { coefficient: '1', constant: '-320' });
});

test('subgrid constraints retain exact rational media and container-query boundaries', () => {
  const report = run('.board { container: Board / inline-size; } @container Board (width >= 600px) { .group { column-gap: 4px; } }', {
    viewport: { min: 500, max: 700 }, boxes: { '.b': { minInlineSize: 300 } },
  });
  assert.equal(report.status, 'violated');
  const failures = report.diagnostics.filter(row => row.code === 'E_LAYOUT_CONTENT');
  assert.equal(failures.length, 2);
  assert.ok(failures.some(row => row.range.minExact === '500' && row.range.maxExact === '600'));
  assert.ok(failures.some(row => row.range.minExact === '600' && row.range.maxExact === '612'));
  assert.equal(run('.board { column-gap: 0.5px; } .group { column-gap: 1px; }').subgrids[0].tracks[0].constant, '399/4');
});

const both = `.board { block-size: 300px; grid-template-rows: 100px minmax(0, 1fr); }
  .group { grid-template-rows: subgrid; grid-row: 1 / span 2; padding: 10px; }
  .a { grid-column: 1; grid-row: 1; } .b { grid-column: 2; grid-row: 2; }`;
const block = { viewport: { min: 500, max: 700, height: { min: 400, max: 800 } } };
test('both axes share definite parent rows, including spans and edge insets', () => {
  const report = run(both, block); verified(report);
  assert.equal(size(report, '.a', 'block').constant, '90');
  assert.equal(size(report, '.b', 'block').constant, '170');
  assert.deepEqual(report.subgrids.filter(row => row.box === '.group').map(row => row.axis).sort(), ['block', 'inline']);
});

test('shared row heights remain affine in the independent viewport-height domain', () => {
  const report = run(both.replace('block-size: 300px', 'block-size: 100%'), {
    ...block, boxes: { '.b': { minBlockSize: 300 } },
  });
  assert.equal(report.status, 'violated');
  assert.deepEqual(size(report, '.b', 'block'), { coefficient: '0', constant: '-130', heightCoefficient: '1' });
  const failure = report.diagnostics.find(row => row.code === 'E_LAYOUT_CONTENT');
  assert.equal(failure.heightRange.minExact, '400');
  assert.equal(failure.heightRange.maxExact, '430');
  assert.equal(failure.heightRange.maxInclusive, false);
});

test('row spans on an independent axis use the full grid area and reject unmodeled intrinsic spanning', () => {
  const report = run(both.replace('grid-template-rows: subgrid;', 'grid-template-rows: minmax(0, 1fr);').replace('grid-row: 2;', 'grid-row: 1;'), block);
  verified(report);
  assert.equal(size(report, '.a', 'block').constant, '280');
  const intrinsic = run(both.replace('100px minmax(0, 1fr)', 'auto auto'), block);
  assert.equal(intrinsic.status, 'unknown');
  assert.ok(intrinsic.diagnostics.some(row => row.code === 'U_LAYOUT_SUBGRID' && /intrinsic/i.test(row.message)));
});

test('subgridded axes cannot silently grow implicit tracks or overlap', () => {
  for (const extra of ['.b { grid-column: 3; }', '.a, .b { grid-column: 1; grid-row: 1; }']) {
    const report = run(extra);
    assert.equal(report.status, 'violated', JSON.stringify(report.diagnostics));
    assert.ok(report.diagnostics.some(row => ['E_LAYOUT_SUBGRID_PLACEMENT', 'E_LAYOUT_OVERLAP'].includes(row.code)));
  }
  const rows = run(both + '.b { grid-row: 3; }', block);
  assert.equal(rows.status, 'violated');
  assert.ok(rows.diagnostics.some(row => row.code === 'E_LAYOUT_SUBGRID_PLACEMENT'));
  const conditional = run('@media (width >= 600px) { .b { grid-column:3; } }', { viewport: { min:500, max:700 } });
  const failure = conditional.diagnostics.find(row => row.code === 'E_LAYOUT_SUBGRID_PLACEMENT');
  assert.equal(failure.axis, 'inline'); assert.equal(failure.range.minExact, '600');
});

test('orphan subgrids, line names, non-auto sizes and negative effective tracks stay unknown', () => {
  for (const extra of ['.board { grid-template-columns: subgrid; }', '.group { grid-template-columns: subgrid [a] [b]; }', '.group { width: 100px; }', '.group { column-gap: 1000px; }', '.group { container-type:inline-size; }', '.group { container-type:size; }']) {
    assert.equal(run(extra).status, 'unknown', extra);
  }
  const empty = run('.board { grid-template-columns: subgrid; }', {}, 'component Board() { <main class="board"></main> }');
  assert.equal(empty.status, 'unknown');
});

test('CSS reset and responsive standalone/subgrid switching are evaluated per region', () => {
  const report = run('@media (width < 600px) { .group { grid-template-columns: minmax(0, 1fr); } }', {
    viewport: { min: 500, max: 700 }, reset: [{ css: 'html { box-sizing: border-box; } * { box-sizing: inherit; }' }], ancestors: [{ tag: 'html' }],
  }); verified(report);
  assert.ok(report.subgrids.length);
  assert.ok(report.subgrids.every(row => row.range.min >= 600));
});

test('an empty subgrid still contributes its explicit standalone rows to parent auto height', () => {
  const report = run('.group { grid-template-rows:100px; }', block,
    'component Board() { <main class="board"><section class="group"></section></main> }');
  verified(report);
  assert.equal(size(report, '.group', 'block').constant, '100');
  assert.equal(size(report, '.board', 'block').constant, '100');
});

test('empty grids check explicit track overflow and can have no standalone columns', () => {
  const text = 'component Board() { <main class="board"><section class="group"></section></main> }';
  const exceeded = run('.group { grid-template-columns:800px; grid-template-rows:100px; }', block, text);
  assert.equal(exceeded.status, 'violated');
  assert.ok(exceeded.diagnostics.some(row => row.code === 'E_LAYOUT_TRACKS' && row.axis === 'inline'));
  const rowsOnly = run('.board { block-size:100px; grid-template-rows:100px; } .group { grid-column:1; grid-template-columns:none; grid-template-rows:subgrid; }', block, text);
  verified(rowsOnly);
  assert.equal(size(rowsOnly, '.group', 'block').constant, '100');
});
