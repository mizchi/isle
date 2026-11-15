import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Inline svg as a replaced box: the sizes Chromium gives it (W_LAYOUT_SVG_UNSIZED for no size at all).
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (svg, css = '') => analyzeHTML(`<html lang="en"><body><div class="p">${svg}<path d="M0 0h1"/></svg></div></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}svg{display:block}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const size = report => { const r = report.sizes.find(s => s.box.startsWith('svg') || s.box === '.s'); return [r.inlineSize.coefficient, r.inlineSize.constant, r.blockSize.coefficient, r.blockSize.constant]; };
const unsized = report => (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_SVG_UNSIZED');

test('sizes from attributes, viewBox and CSS', () => {
  for (const [svg, css, expected] of [
    ['<svg width="24" viewBox="0 0 24 12" aria-hidden="true">', '', ['0', '24', '0', '12']],
    ['<svg width="24" height="30" aria-hidden="true">', '', ['0', '24', '0', '30']],
    ['<svg width="24" aria-hidden="true">', '', ['0', '24', '0', '150']],
    ['<svg height="30" viewBox="0 0 24 12" aria-hidden="true">', '', ['0', '60', '0', '30']],
    ['<svg class="s" viewBox="0 0 24 12" aria-hidden="true">', '.s{width:40px}', ['0', '40', '0', '20']],
  ]) {
    const r = run(svg, css);
    assert.equal(r.status, 'verified', `${svg} ${JSON.stringify(r.diagnostics)}`);
    assert.deepEqual(size(r), expected, svg);
    assert.ok(!unsized(r), svg);
  }
});

test('no size: a viewBox fills the grid area, no viewBox is 300×150; both are warned', () => {
  const fills = run('<svg viewBox="0 0 24 12" aria-hidden="true">');
  assert.equal(fills.status, 'verified', JSON.stringify(fills.diagnostics));
  assert.deepEqual(size(fills), ['1', '0', '1/2', '0']);
  assert.ok(unsized(fills));
  const none = run('<svg aria-hidden="true">', '.p{grid-template-columns:310px}');
  assert.deepEqual(size(none), ['0', '300', '0', '150']);
  assert.ok(unsized(none));
  // In a flex container the unsized svg is Unknown.
  assert.equal(run('<svg viewBox="0 0 24 12" aria-hidden="true">', '.p{display:flex}').status, 'unknown');
});

test('a link named only by its svg: aria-label or <title> names it, aria-hidden does not', () => {
  const css = `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};background:#fff}.t{height:10px}.l{display:grid;grid-template-columns:24px}svg{display:block}`;
  const unnamed = svg => analyzeHTML(`<html lang="en"><body><main class="p"><h1 class="t" aria-label="T"></h1><a class="l" href="/">${svg}</a></main></body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true}).diagnostics.some(d => d.code === 'E_A11Y_NAME');
  assert.equal(unnamed('<svg width="24" height="24" aria-label="Home" role="img"></svg>'), false);
  assert.equal(unnamed('<svg width="24" height="24"><title>Home</title></svg>'), false);
  assert.equal(unnamed('<svg width="24" height="24" aria-hidden="true"><title>Home</title></svg>'), true);
  assert.equal(unnamed('<svg width="24" height="24"></svg>'), true);
});
