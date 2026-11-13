// Core checks for font-derived text contracts. Measurement lives in `/text`;
// these contracts are written by hand so the core is tested on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLayout} from '../src/index.mjs';

const tree = () => ({tag: 'main', classes: ['row'], children: [{tag: 'p', classes: ['name'], text: true}]});
const css = (extra = '') => `* { box-sizing: border-box; margin: 0; }
.row { display: grid; grid-template-columns: minmax(0, 1fr); padding: 0 8px; }
.name { white-space: nowrap; font-family: "Noto Sans JP", sans-serif; font-size: 16px; line-height: 24px; }
${extra}`;
const font = {family: 'Noto Sans JP', size: 16, lineHeight: 24, weight: 400};
// Hand-written bound table: 16px per character plus the rounding allowance.
const bounds = Array.from({length: 11}, (_, n) => n === 0 ? 0 : 16 * n + 0.015625);
const domain = {kind: 'domain', characters: 'あいう', maxLength: 10, perCharacter: 16, pairAdjustment: 0, bounds, widest: 'あ'};
const run = (contract, extra, viewport = {min: 100, max: 400}) => analyzeLayout(tree(), {name: 'Card', css: css(extra), viewport, ancestors: [{tag: 'html'}],
  boxes: {'.name': {minInlineSize: bounds[10], intrinsicBlockSize: 24, wrap: 'nowrap', font, textMetrics: domain, ...contract}}});
const status = (report, expected) => assert.equal(report.status, expected, JSON.stringify(report.diagnostics));

test('a ten-character domain overflows below its bound and reports how many characters still fit', () => {
  const report = run({});
  status(report, 'violated');
  const finding = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT');
  // content box = V - 16; 10 × 16 + 1/64 needs V ≥ 176.015625
  assert.equal(finding.range.maxExact, '11265/64');
  assert.equal(finding.range.maxInclusive, false);
  const available = finding.witness.available;
  assert.deepEqual(finding.text, {maxLength: 10, fitsUpTo: Math.floor((available - 0.015625) / 16), widest: 'あ'});
  status(run({}, '', {min: 177, max: 400}), 'verified');
});

test('the computed font must equal the measured font, otherwise the bound does not apply', () => {
  for (const [extra, reason] of [
    ['.name { font-size: 17px; }', /font-size 17px differs/],
    ['.name { font-family: serif; }', /fallback fonts are not modeled/],
    ['.name { font-weight: bold; }', /font-weight 700 differs/],
    ['.name { line-height: normal; }', /line-height normal must be/],
    ['.name { line-height: 1.5; }', null],
    ['.name { font: 16px/24px "Noto Sans JP"; }', /font shorthand is not modeled/],
    ['.name { text-transform: uppercase; }', /text-transform uppercase/],
    ['.name { letter-spacing: 1px; }', /Unsupported letter-spacing/],
    ['@media (width < 200px) { .name { font-size: 20px; } }', /font-size 20px differs/],
  ]) {
    const report = run({}, extra, {min: 177, max: 400});
    if (!reason) { status(report, 'verified'); continue; }
    status(report, 'unknown');
    assert.ok(report.diagnostics.some(d => reason.test(d.message)), `${extra}: ${JSON.stringify(report.diagnostics)}`);
  }
});

test('font settings inherit, and an unknown default size stays unknown', () => {
  const inherited = css().replace('.name { white-space: nowrap; font-family: "Noto Sans JP", sans-serif; font-size: 16px; line-height: 24px; }',
    '.row { font-family: "Noto Sans JP"; font-size: 16px; line-height: 24px; } .name { white-space: nowrap; }');
  const ok = analyzeLayout(tree(), {name: 'Card', css: inherited, viewport: {min: 177, max: 400}, ancestors: [{tag: 'html'}],
    boxes: {'.name': {minInlineSize: bounds[10], intrinsicBlockSize: 24, wrap: 'nowrap', font, textMetrics: domain}}});
  status(ok, 'verified');
  const medium = analyzeLayout(tree(), {name: 'Card', css: inherited.replace('font-size: 16px; ', ''), viewport: {min: 177, max: 400}, ancestors: [{tag: 'html'}],
    boxes: {'.name': {minInlineSize: bounds[10], intrinsicBlockSize: 24, wrap: 'nowrap', font, textMetrics: domain}}});
  status(medium, 'unknown');
});

test('derived metrics are validated and require the font they came from', () => {
  assert.throws(() => run({font: undefined}), /require the font contract/);
  assert.throws(() => run({textMetrics: {...domain, bounds: [0, 16, 8]}}), /Invalid text domain bounds|non-decreasing/);
  assert.throws(() => run({font: {...font, style: 'italic'}}), /normal font-style/);
});

test('wrapping CSS disagrees with a single-line measurement', () => {
  const report = run({}, '.name { white-space: normal; }', {min: 177, max: 400});
  status(report, 'violated');
  assert.ok(report.diagnostics.some(d => d.code === 'E_LAYOUT_WRAP'));
});
