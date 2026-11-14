import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Lengths with viewport units, rem/em and calc()/min()/max()/clamp() become affine functions of the viewport
// (splitting the region where min/max arguments cross); anything else stays Unknown.
const base = '*{box-sizing:border-box;margin:0;padding:0}html{font-size:10px}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{block-size:10px}';
const doc = '<html lang="en"><body><div class="page"><div class="x"></div></div></body></html>';
const run = (css, {html = doc, height = {min: 500, max: 900}} = {}) => analyzeHTML(html, {name: 'Page', css: base + css, viewport: {min: 320, max: 1280, ...(height ? {height} : {})}});
const value = s => { const [n, d = '1'] = String(s ?? '0').split('/'); return Number(n) / Number(d); };
const size = (report, w, h, axis = 'inlineSize') => {
  const row = report.sizes.find(r => r.box === '.x' && r.rect && w >= r.range.min && w <= r.range.max && (!r.heightRange || (h >= r.heightRange.min && h <= r.heightRange.max)));
  const a = row.rect[axis];
  return value(a.constant) + value(a.coefficient) * w + value(a.heightCoefficient) * h;
};

test('viewport units, rem, em and calc() resolve to the viewport-affine size', () => {
  const cases = [
    ['.x{inline-size:50vw}', [[320, 160], [1280, 640]]],
    ['.x{inline-size:calc(100% - 2rem)}', [[320, 300], [1000, 980]]],
    ['.x{inline-size:calc((100% - 2 * 16px) / 4)}', [[320, 72], [1280, 312]]],
    ['.x{inline-size:clamp(200px, 50vw, 500px)}', [[320, 200], [600, 300], [1280, 500]]],
    ['.x{inline-size:min(100%, 40rem)}', [[320, 320], [1280, 400]]],
    ['.x{inline-size:max(20vw, 120px)}', [[320, 120], [1280, 256]]],
    ['.x{inline-size:calc(min(50vw, 400px) + min(10vw, 50px))}', [[320, 192], [600, 350], [1280, 450]]],
    ['.x{inline-size:25rem;max-inline-size:calc(60vw - 10px)}', [[320, 182], [1280, 250]]],
    ['.x{font-size:12px;inline-size:10em}', [[320, 120]]],
    // A negative result clamps at 0.
    ['.x{inline-size:calc(50% - 400px)}', [[320, 0], [800, 0], [1280, 240]]],
    ['.x{inline-size:50%;box-sizing:content-box;padding:0 1rem}', [[320, 180], [1000, 520]]],
  ];
  for (const [css, points] of cases) {
    const report = run(css);
    assert.equal(report.status, 'verified', `${css}: ${JSON.stringify(report.diagnostics)}`);
    for (const [w, expected] of points) assert.equal(size(report, w, 600), expected, `${css} at ${w}`);
  }
  // Viewport-height units on the block axis (fixed height per run, so the size is a number at each width).
  for (const [css, h, expected] of [['.x{block-size:calc(5vh + 1rem)}', 600, 40], ['.x{block-size:20vmin}', 500, 64], ['.x{block-size:clamp(10px, 4vh, 30px)}', 900, 30], ['.x{block-size:5vmax}', 500, 25]]) {
    const report = run(css, {height: {min: h, max: h}});
    assert.equal(report.status, 'verified', `${css}: ${JSON.stringify(report.diagnostics)}`);
    assert.equal(size(report, 320, h, 'blockSize'), expected, `${css} at height ${h}`);
  }
  // A size that grows with the viewport can still violate: 50vh is 450px wide at 320 × 900.
  assert.equal(run('.x{inline-size:50vh}').diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE'), true);
});

test('lengths without a defined value stay Unknown', () => {
  const unknown = (css, options) => { const report = run(css, options); assert.equal(report.status, 'unknown', `${css}: ${report.status}`); return report.diagnostics.filter(d => d.severity === 'unknown').map(d => d.message).join(' '); };
  // rem needs the html root in the analysed tree; a fragment has none.
  assert.match(unknown('.x{inline-size:10rem}', {html: '<div class="page"><div class="x"></div></div>'}), /rem needs the html root/);
  assert.match(unknown('.x{padding:0 1rem}', {html: '<div class="page"><div class="x"></div></div>'}), /1rem/);
  // vh/vmin/vmax need a viewport height range.
  assert.match(unknown('.x{inline-size:50vmin}', {height: null}), /viewport height|block checking/);
  for (const css of ['.x{inline-size:10foo}', '.x{inline-size:calc(10px * 2px)}', '.x{inline-size:calc(100% / 0)}', '.x{inline-size:calc(10px + 2)}', '.x{inline-size:calc(10px}', '.x{inline-size:clamp(1px, 2px)}']) unknown(css);
});

test('an html document root is analysed with its head dropped', () => {
  const report = run('.x{inline-size:10rem}', {html: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body><div class="page"><div class="x"></div></div></body></html>'});
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics));
  assert.equal(size(report, 320, 600), 100);
  // A head with other elements (a style sheet) is not modeled: the css option carries the styles.
  assert.equal(run('', {html: '<html lang="en"><head><style>.x{inline-size:1px}</style></head><body><div class="page"><div class="x"></div></div></body></html>'}).status, 'unknown');
});
