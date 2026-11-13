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

// Wrapping text: a hand-written line profile (3 lines below 100px, 2 below 160px, 1 from 160px).
const profile = [{atLeastInlineSize: 0, lines: 3}, {atLeastInlineSize: 100, lines: 2}, {atLeastInlineSize: 160, lines: 1}];
const lines = (overflowWrap = 'normal') => ({minInlineSize: 40, wrap: 'normal', font, intrinsicBlockSize: profile.map(e => ({atLeastInlineSize: e.atLeastInlineSize, blockSize: e.lines * 24})),
  textMetrics: {kind: 'lines', text: 'あいう', width: 159.5, minContent: 40, overflowWrap, profile}});
const wrapCSS = (extra = '') => `* { box-sizing: border-box; margin: 0; }
.row { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 48px; padding: 0 8px; }
.name { font-family: "Noto Sans JP"; font-size: 16px; line-height: 24px; }
${extra}`;
const wrapRun = (contract, extra, viewport = {min: 60, max: 400, height: {min: 100, max: 400}}) => analyzeLayout(tree(), {name: 'Card', css: wrapCSS(extra), viewport, ancestors: [{tag: 'html'}], boxes: {'.name': {...lines(), ...contract}}});

test('wrapping text needs as many line boxes as the profile gives at its content width', () => {
  const report = wrapRun({});
  status(report, 'violated');
  // Three lines (72px) do not fit the 48px row while the content box is below 100px: V < 116.
  const finding = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.axis === 'block');
  assert.equal(finding.range.max, 116);
  assert.deepEqual(finding.text, {lines: 3, fitsLines: 2});
  assert.equal(finding.range.maxInclusive, false);
  status(wrapRun({}, '', {min: 116, max: 400, height: {min: 100, max: 400}}), 'verified');
});

test('a line profile applies only to the white-space and overflow-wrap it was measured for', () => {
  const viewport = {min: 116, max: 400, height: {min: 100, max: 400}};
  for (const [extra, reason] of [['.name { overflow-wrap: anywhere; }', /overflow-wrap anywhere differs from the measured normal/], ['.name { white-space: pre-line; }', /white-space/]]) {
    const report = wrapRun({}, extra, viewport);
    status(report, 'unknown');
    assert.ok(report.diagnostics.some(d => reason.test(d.message)), JSON.stringify(report.diagnostics));
  }
  status(wrapRun({...lines('anywhere'), wrap: 'anywhere'}, '.name { overflow-wrap: anywhere; }', viewport), 'verified');
});

test('UA heading fonts are not inherited: a measured h1 needs author font longhands', () => {
  const heading = () => ({tag: 'main', classes: ['row'], children: [{tag: 'h1', classes: ['name'], text: true}]});
  const run = extra => analyzeLayout(heading(), {name: 'Card', css: css(extra), viewport: {min: 300, max: 400}, ancestors: [{tag: 'html'}],
    boxes: {'.name': {minInlineSize: bounds[10], intrinsicBlockSize: 24, wrap: 'nowrap', font, textMetrics: domain}}});
  const report = run('');
  status(report, 'unknown');
  assert.ok(report.diagnostics.some(d => d.code === 'U_LAYOUT_TEXT_FONT' && /font-weight ua must be absolute/.test(d.message)), JSON.stringify(report.diagnostics));
  status(run('h1 { font-weight: 400; }'), 'verified');
});

// Content language (lang attribute): a contract measured for one language applies only there.
test('a measured lang must equal the element language, inherited from the lang attribute', () => {
  const contract = {...lines(), textMetrics: {...lines().textMetrics, lang: 'ja'}};
  const viewport = {min: 116, max: 400, height: {min: 100, max: 400}};
  const run = (tree, ancestors = [{tag: 'html'}]) => analyzeLayout(tree, {name: 'Card', css: wrapCSS(), viewport, ancestors, boxes: {'.name': contract}});
  const card = lang => ({tag: 'main', classes: ['row'], ...(lang !== undefined ? {lang} : {}), children: [{tag: 'p', classes: ['name'], text: true}]});
  status(run(card('ja')), 'verified');
  status(run(card(), [{tag: 'html', lang: 'JA'}]), 'verified'); // inherited; language tags compare case-insensitively
  for (const [tree, ancestors, reason] of [[card(), [{tag: 'html'}], /lang is not declared/], [card('en'), [{tag: 'html'}], /lang en differs from the measured ja/], [card('ja-JP'), [{tag: 'html'}], /lang ja-JP differs/]]) {
    const report = run(tree, ancestors);
    status(report, 'unknown');
    assert.ok(report.diagnostics.some(d => d.code === 'U_LAYOUT_TEXT_FONT' && reason.test(d.message)), JSON.stringify(report.diagnostics));
  }
  // Without a measured lang the element language is not consulted.
  status(analyzeLayout(card('en'), {name: 'Card', css: wrapCSS(), viewport, ancestors: [{tag: 'html'}], boxes: {'.name': lines()}}), 'verified');
});

test('without a measured lang, a declared language must use the modeled break rules', () => {
  const viewport = {min: 116, max: 400, height: {min: 100, max: 400}};
  const run = lang => analyzeLayout({tag: 'main', classes: ['row'], lang, children: [{tag: 'p', classes: ['name'], text: true}]}, {name: 'Card', css: wrapCSS(), viewport, ancestors: [{tag: 'html'}], boxes: {'.name': lines()}});
  for (const lang of ['en', 'ja', 'ko-KR', '']) status(run(lang), 'verified');
  const report = run('zh-Hans');
  status(report, 'unknown');
  assert.ok(report.diagnostics.some(d => /lang zh-Hans: line breaking is modeled for en, ja, ko/.test(d.message)), JSON.stringify(report.diagnostics));
});
