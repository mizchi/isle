import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { analyzeLayout } from '../lib/layout.mjs';

const source = `component Board() {
  <main class="board"><aside class="side">Navigation</aside><section class="body">Content</section></main>
}`;
const css = `
  * { box-sizing: border-box; }
  .board { display: grid; grid-template-columns: minmax(0, 1fr); padding: 16px; gap: 16px; }
  .body { overflow-wrap: anywhere; }
  @media (min-width: 600px) { .board { grid-template-columns: 240px minmax(0, 1fr); } }
`;
const options = {
  component: 'Board', css, viewport: { min: 320, max: 1280 },
  boxes: { '.side': { minInlineSize: 120 }, '.body': { minInlineSize: 320, wrap: 'anywhere' } },
};
const run = (changes = {}, text = source) => analyzeLayout(requireIR(compile(text)), { ...options, ...changes });
const failure = report => report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT');

test('symbolic widths find the narrow media regime missed by desktop/phone samples', () => {
  const report = run({ viewport: { min: 400, max: 1280 } });
  assert.equal(report.status, 'violated');
  assert.equal(report.ok, false);
  const diagnostic = failure(report);
  assert.equal(diagnostic.box, '.body');
  assert.deepEqual(diagnostic.range, { min: 600, max: 608, minInclusive: true, maxInclusive: false, minExact: '600', maxExact: '608' });
  assert.ok(diagnostic.witness.viewport >= 600 && diagnostic.witness.viewport < 608);
  assert.equal(diagnostic.witness.required, 320);
  assert.ok(diagnostic.witness.available < 320);
  assert.match(diagnostic.message, /320/);
});

test('corrected breakpoints satisfy the contract across the entire declared interval', () => {
  const report = run({ css: css.replace('600px', '608px'), viewport: { min: 352, max: 1280 } });
  assert.equal(report.status, 'verified');
  assert.equal(report.ok, true);
  assert.equal(report.scope.axis, 'inline');
  assert.ok(report.assumptions.some(a => a.includes('minInlineSize')));
});

test('media overlap at a single boundary is checked, including important and specificity', () => {
  const report = run({
    viewport: { min: 400, max: 800 },
    css: css.replace('600px', '608px') + `
      @media (min-width: 700px) { .body { width: 100px !important; } }
      @media (width > 700px) { .body { width: auto !important; } }
      .board .body { color: blue; }
    `,
  });
  // Unsupported combinators are never silently ignored, even for decorative rules.
  assert.equal(report.status, 'unknown');
  const supported = run({ viewport: { min: 400, max: 800 }, css: css.replace('600px', '608px') + `
    @media (width >= 700px) { .body { inline-size: 100px !important; } }
    @media (width > 700px) { .body { width: auto !important; } }
  ` });
  assert.equal(supported.status, 'violated');
  assert.equal(failure(supported).range.min, 700);
  assert.equal(failure(supported).range.max, 700);
  assert.equal(failure(supported).range.maxInclusive, true);
});

test('parent padding, border, gaps and nested grids consume real available width', () => {
  const report = run({
    css: css.replace('600px', '700px').replace('padding: 16px', 'padding: 16px; border: 4px solid black'),
    viewport: { min: 352, max: 500 },
  });
  assert.equal(failure(report).range.max, 360);
  const nested = run({ viewport: { min: 400, max: 700 }, css: `
    * { box-sizing: border-box; }
    .board { display: grid; grid-template-columns: minmax(0, 1fr); padding: 16px; }
    .body { display: grid; grid-template-columns: minmax(0, 1fr); padding: 8px; }
    .text { overflow-wrap: anywhere; }
  `, boxes: { '.side': { minInlineSize: 120 }, '.text': { minInlineSize: 400 } } }, source.replace('Content', '<p class="text">Content</p>'));
  assert.equal(failure(nested).box, '.text');
  assert.equal(failure(nested).range.max, 448);
});

test('explicit numeric spans and row packing use the sum of tracks and internal gaps', () => {
  const report = run({ viewport: { min: 500, max: 500 }, css: `
    * { box-sizing: border-box; }
    .board { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 20px; }
    .body { grid-column: 1 / span 2; grid-row: 2; }
  `, boxes: { '.side': { minInlineSize: 100 }, '.body': { minInlineSize: 500 } } });
  assert.equal(report.status, 'verified');
});

test('scroll and clipping are explicit policies, not automatic ways to hide violations', () => {
  for (const [overflow, value] of [['scroll', 'auto'], ['clip', 'clip'], ['visible', 'visible']]) {
    const report = run({ css: css + `.body { overflow-x: ${value}; }`, boxes: {
      '.side': { minInlineSize: 120 }, '.body': { overflow, wrap: 'anywhere' },
    } });
    assert.equal(report.status, 'verified', overflow);
    assert.ok(report.policies.some(p => p.box === '.body' && p.overflow === overflow));
  }
  assert.equal(run({ css: css + '.body { overflow: hidden; }' }).status, 'violated');
  assert.ok(run({ boxes: { ...options.boxes, '.body': { overflow: 'scroll' } } }).diagnostics.some(d => d.code === 'E_LAYOUT_OVERFLOW_POLICY'));
  assert.ok(run({ css: css + '.body { overflow-x: visible; overflow-y: auto; }', boxes: { ...options.boxes, '.body': { overflow: 'visible' } } }).diagnostics.some(d => d.code === 'E_LAYOUT_OVERFLOW_POLICY'));
});

test('wrapping must agree with CSS and is not itself a font-metric guarantee', () => {
  assert.ok(run({ css: css + '.body { white-space: nowrap; }' }).diagnostics.some(d => d.code === 'E_LAYOUT_WRAP'));
  assert.equal(run({ boxes: {} }).status, 'unknown');
  assert.equal(run({ css: css.replace('anywhere', 'break-word') }).diagnostics.some(d => d.code === 'E_LAYOUT_WRAP'), true);
});

test('float, non-grid containers, overlapping/outside placement are rejected', () => {
  assert.ok(run({ css: css + '.side { float: left; }' }).diagnostics.some(d => d.code === 'E_LAYOUT_FLOAT'));
  assert.ok(run({ css: css.replace('display: grid', 'display: flex') }).diagnostics.some(d => d.code === 'E_LAYOUT_CONTAINER'));
  assert.ok(run({ css: css + '.body { grid-column: 3; }' }).diagnostics.some(d => d.code === 'E_LAYOUT_PLACEMENT'));
  assert.ok(run({ css: css + '.side, .body { grid-column: 1; grid-row: 1; }' }).diagnostics.some(d => d.code === 'E_LAYOUT_OVERLAP'));
});

test('unsupported CSS, external dependencies, dynamic structure and replaced elements stay unknown', () => {
  for (const extra of [
    '.body { width: var(--size); }', '.body { transform: scale(2); }',
    '@supports (display: grid) { .body { width: 900px; } }',
    '@media (hover: hover) { .body { width: 900px; } }',
    '@import "foreign.css";', '.body:hover { width: 900px; }',
    '.body { margin: -4px; }', '.body { position: absolute; }',
  ]) assert.equal(run({ css: css + extra }).status, 'unknown', extra);
  assert.equal(run({ css: css.replace('minmax(0, 1fr)', '1fr') }).status, 'unknown');
  assert.equal(run({}, source.replace('Content', '<input type="text" aria-label="Content" />')).status, 'unknown');
  assert.equal(run({}, source.replace('Board()', 'Board(show: boolean)').replace('Content', '@if (show) { <span>Content</span> }')).status, 'unknown');
});

test('unreachable media branches and display:none subtrees do not create spurious requirements', () => {
  const report = run({ viewport: { min: 400, max: 500 }, css: css + `
    @media (min-width: 900px) { .body { width: 9999px; } }
    .body { display: none; }
  `, boxes: { '.side': { minInlineSize: 120 } } });
  assert.equal(report.status, 'verified');
});

test('decimal arithmetic preserves an exact rational failure endpoint', () => {
  const report = run({ viewport: { min: 400, max: 1000 }, css: `
    * { box-sizing: border-box; }
    .board { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 0.5px; }
  `, boxes: { '.side': { minInlineSize: 200.25 }, '.body': { minInlineSize: 0 } } });
  assert.equal(failure(report).range.maxExact, '2405/4');
  assert.equal(failure(report).range.maxInclusive, false);
});

test('fractional tracks with a total weight below one leave their specified free-space fraction', () => {
  const report = run({ viewport: { min: 500, max: 500 }, css: `
    * { box-sizing: border-box; }
    .board { display: grid; grid-template-columns: minmax(0, 0.5fr); }
  `, boxes: { '.side': { minInlineSize: 300 }, '.body': { minInlineSize: 0 } } });
  assert.equal(report.status, 'violated');
  assert.equal(failure(report).witness.available, 250);
});

test('input contracts reject malformed, unmatched and ambiguous annotations', () => {
  for (const viewport of [{ min: 1000, max: 400 }, { min: NaN, max: 800 }, { min: -1, max: 100 }]) {
    assert.throws(() => run({ viewport }), /viewport/i);
  }
  assert.throws(() => run({ boxes: { '.missing': { minInlineSize: 2 } } }), /match/i);
  assert.throws(() => run({ boxes: { '.body': { minInlineSize: -1 } } }), /minInlineSize/i);
  assert.throws(() => run({ boxes: { '.body': { surprise: true } } }), /contract/i);
});

test('pure nested components are analyzed after compiler composition lowering', () => {
  assert.equal(run({ viewport: { min: 352, max: 1280 }, css: css.replace('600px', '608px') }, `
    component Body() { <section class="body">Content</section> }
    component Board() { <main class="board"><aside class="side">Navigation</aside><Body /></main> }
  `).status, 'verified');
});
