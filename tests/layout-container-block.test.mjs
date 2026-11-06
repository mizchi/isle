import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { analyzeLayout } from '../lib/layout.mjs';

const source = `component Panel() {
  <main class="shell"><section class="panel"><p class="a">A</p><p class="b">B</p></section></main>
}`;
const base = `* { box-sizing: border-box; margin: 0; }
  .shell { display: grid; grid-template-columns: minmax(0, 1fr); container: Shell / inline-size; padding: 16px; }
  .panel { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
`;
const options = { component: 'Panel', viewport: { min: 432, max: 1000 }, boxes: {
  '.a': { minInlineSize: 200 }, '.b': { minInlineSize: 400 },
} };
const run = (css, extra = {}, input = source) => analyzeLayout(requireIR(compile(input)), { ...options, ...extra, css });

test('named container width queries use ancestor content size and preserve exact breakpoints', () => {
  const css = base + '@container Shell (width >= 600px) { .panel { grid-template-columns: 200px minmax(0, 1fr); } }';
  const report = run(css);
  assert.equal(report.status, 'violated');
  const violation = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.b');
  assert.equal(violation.range.minExact, '632');
  assert.equal(violation.range.maxExact, '648');
  assert.equal(violation.range.maxInclusive, false);
  assert.equal(run(css.replace('600px', '616px')).status, 'verified');
  assert.ok(report.queries.some(q => q.target === '.shell' && q.name === 'Shell'));
});

test('nearest eligible ancestor and case-sensitive names differ from viewport and self', () => {
  const css = base + '.shell { inline-size: 500px; } .panel { container: Inner / inline-size; }' +
    '@container Shell (width > 400px) { .b { inline-size: 600px; } }' +
    '@container shell (width > 0px) { .a { float: left; } }';
  const report = run(css, { viewport: { min: 1000, max: 1000 } });
  assert.equal(report.status, 'violated');
  assert.ok(report.diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.box === '.b'));
  assert.ok(!report.diagnostics.some(d => d.code === 'E_LAYOUT_FLOAT'));
  const self = run(base + '@container Shell (width > 0px) { .shell { float: left; } }');
  assert.equal(self.status, 'verified');
});

const verticalCSS = `* { box-sizing: border-box; margin: 0; }
  .shell { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); block-size: 100%; padding: 16px; }
  .panel { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 80px minmax(0, 1fr); row-gap: 8px; }
`;
const vertical = { block: true, viewport: { min: 432, max: 1000, height: { min: 200, max: 500 } }, boxes: {
  '.a': { minInlineSize: 200, minBlockSize: 40, intrinsicBlockSize: 40 },
  '.b': { minInlineSize: 400, minBlockSize: 200, intrinsicBlockSize: 200 },
} };

test('block rows, padding and gaps are solved over the entire independent height interval', () => {
  const report = run(verticalCSS, vertical);
  assert.equal(report.status, 'violated');
  assert.equal(report.scope.axis, 'both');
  assert.equal(report.scope.blockSizing, true);
  const violation = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.axis === 'block' && d.box === '.b');
  assert.equal(violation.heightRange.maxExact, '320');
  assert.equal(violation.heightRange.maxInclusive, false);
  assert.ok(violation.witness.viewportHeight < 320);
  assert.equal(run(verticalCSS, { ...vertical, viewport: { ...vertical.viewport, height: { min: 320, max: 500 } } }).status, 'verified');
});

test('container height queries skip inline-size ancestors and obey full size containment', () => {
  const css = verticalCSS.replace('.shell {', '.shell { container: Outer / size;') +
    '.panel { container: Inner / inline-size; }' +
    '@container (height >= 300px) { .b { block-size: 600px; } }';
  const report = run(css, { ...vertical, viewport: { min: 500, max: 500, height: { min: 350, max: 400 } } });
  assert.equal(report.status, 'violated');
  assert.ok(report.queries.some(q => q.box === '.b' && q.target === '.shell'));
  const contained = run(base.replace('Shell / inline-size', 'Shell / size'), { ...vertical, viewport: { min: 500, max: 500, height: { min: 400, max: 400 } } });
  assert.ok(contained.diagnostics.some(d => d.axis === 'block' && d.severity === 'error'));
});

test('automatic rows and automatic container height propagate child heights bottom up', () => {
  const css = base + '.a { block-size: 40px; } .b { block-size: 60px; }';
  const report = run(css, { ...vertical, boxes: {
    '.a': { minInlineSize: 200, minBlockSize: 40 }, '.b': { minInlineSize: 400, minBlockSize: 60 },
  } });
  assert.equal(report.status, 'verified');
  assert.ok(report.sizes.some(size => size.box === '.shell' && size.blockSize.constant === '148'));
});

test('width-dependent intrinsic text heights are explicit and select all reachable branches', () => {
  const css = base + '.panel { block-size: 60px; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }';
  const report = run(css, { ...vertical, boxes: {
    '.a': { minInlineSize: 200, intrinsicBlockSize: 20 },
    '.b': { minInlineSize: 400, intrinsicBlockSize: [
      { atLeastInlineSize: 400, blockSize: 40 }, { atLeastInlineSize: 600, blockSize: 20 },
    ] },
  } });
  assert.equal(report.status, 'violated');
  const violation = report.diagnostics.find(d => d.axis === 'block' && d.box === '.b' && d.code === 'E_LAYOUT_CONTENT');
  assert.equal(violation.range.maxExact, '632');
  assert.equal(violation.range.maxInclusive, false);
  // The intrinsic root is 320px high, so the host must offer at least that height.
  assert.equal(run(base, { ...vertical, viewport: { ...vertical.viewport, height: { min: 320, max: 500 } } }).status, 'verified');
  assert.equal(run(base, { ...vertical, boxes: options.boxes }).status, 'unknown');
});

test('media height and container width conditions form reachable two-dimensional regions', () => {
  const css = verticalCSS.replace('.shell {', '.shell { container: Shell / inline-size;') + `
    @media (height >= 350px) { @container Shell (width >= 600px) { .b { block-size: 500px; } } }
  `;
  const report = run(css, { ...vertical, viewport: { min: 700, max: 900, height: { min: 320, max: 500 } } });
  assert.equal(report.status, 'violated');
  const violation = report.diagnostics.find(d => d.axis === 'block' && d.code === 'E_LAYOUT_ITEM_SIZE');
  assert.equal(violation.heightRange.minExact, '350');
  assert.ok(violation.region.constraints.length > 0);
});

test('unresolved percentage heights, unsupported query features and incomplete profiles fail closed', () => {
  assert.equal(run(base + '@container style(--mode: wide) { .b { float: left; } }').status, 'unknown');
  assert.equal(run(base + '.a { block-size: 50%; }', vertical).status, 'unknown');
  assert.equal(run(base, { ...vertical, boxes: { ...vertical.boxes, '.b': { minInlineSize: 400, intrinsicBlockSize: [{ atLeastInlineSize: 800, blockSize: 20 }] } } }).status, 'unknown');
  assert.throws(() => run(base, { ...vertical, boxes: { '.a': { intrinsicBlockSize: [
    { atLeastInlineSize: 500, blockSize: 20 }, { atLeastInlineSize: 400, blockSize: 40 },
  ] } } }), /profile/i);
});

test('axis-specific overflow contracts require matching computed block policy', () => {
  const opts = { ...vertical, scrollbars:[{name:'overlay',inlineSize:0,blockSize:0}],boxes: { ...vertical.boxes, '.b': { ...vertical.boxes['.b'], overflowBlock: 'scroll' } } };
  assert.ok(run(verticalCSS, opts).diagnostics.some(d => d.code === 'E_LAYOUT_OVERFLOW_POLICY' && d.axis === 'block'));
  assert.equal(run(verticalCSS + '.b { overflow-y: auto; }', opts).status, 'verified');
});

test('native block margins and anonymous grid text never inherit an implicit zero-size proof', () => {
  assert.equal(run(base.replace('margin: 0;', ''), vertical).status, 'unknown');
  assert.equal(run(base.replace('margin: 0;', 'margin-inline: 0; margin-block-start: 0; margin-block-end: 0;'), vertical).status, 'violated');
  assert.equal(run(base + '.b { display: grid; grid-template-columns: 10px; }').status, 'unknown');
});

test('reserved query names and malformed height domains are explicit input failures', () => {
  assert.equal(run(base + '@container none (width > 1px) { .b { float: left; } }').status, 'unknown');
  assert.throws(() => run(base, { block: true }), /height/i);
  assert.throws(() => run(base, { ...vertical, viewport: { min: 400, max: 800, height: { min: 500, max: 200 } } }), /height/i);
  assert.throws(() => run(base, { ...vertical, block: false }), /height/i);
});
