import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// A bare Nfr column (minmax(auto, Nfr)): its minimum is the largest minimum contribution of its items (Grid §6.6:
// min-width, 0 for a scroll container, a px width, else the min-content width, clamped by max-width, plus margins).
// Where that minimum is a known constant it is minmax(Cpx, Nfr); otherwise Unknown.
const g = 'display:grid;grid-template-columns:minmax(0,1fr);align-content:start';
const run = (css, html) => analyzeHTML(`<html lang="en"><body><div class="s">${html}</div></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.s{display:grid;column-gap:10px}.a,.b,.c{height:5px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const columns = (r, at = 500) => r.sizes.filter(s => /^\.[abc]$/.test(s.box) && s.rect && s.range.min <= at && at <= s.range.max).map(s => { const v = a => Number(String(a.coefficient).split('/').reduce((p, c) => p / c)) * at + Number(String(a.constant).split('/').reduce((p, c) => p / c)); return [Math.round(v(s.rect.inlineStart) * 1000) / 1000, Math.round(v(s.rect.inlineSize) * 1000) / 1000]; });

test('Chromium column positions at 500px', () => {
  const cases = [
    ['.s{grid-template-columns:1fr 1fr}', '<div class="a"></div><div class="b"></div>', [[0, 245], [255, 245]]],
    ['.s{grid-template-columns:1fr 2fr}', '<div class="a"></div><div class="b"></div>', [[0, 163.333], [173.333, 326.667]]],
    ['.s{grid-template-columns:1fr 1fr}.a{width:400px}', '<div class="a"></div><div class="b"></div>', [[0, 400], [410, 90]]],
    ['.s{grid-template-columns:1fr 1fr}.k{width:350px;height:2px}', '<div class="a"><div class="k"></div></div><div class="b"></div>', [[0, 350], [360, 140]]],
    ['.s{grid-template-columns:1fr 1fr}.a{min-width:0}.k{width:350px;height:2px}', '<div class="a"><div class="k"></div></div><div class="b"></div>', [[0, 245], [255, 245]]],
    // (A scroll container's own rectangle is not reported; .b's column shows the split.)
    ['.s{grid-template-columns:1fr 1fr}.a{overflow:hidden}.k{width:350px;height:2px}', '<div class="a"><div class="k"></div></div><div class="b"></div>', [[255, 245]]],
    ['.s{grid-template-columns:1fr 1fr}.a{display:grid;grid-template-columns:200px 220px;column-gap:10px;padding:0 5px}', '<div class="a"></div><div class="b"></div>', [[0, 440], [450, 50]]],
    ['.s{grid-template-columns:1fr 1fr}.c{width:300px}', '<div class="a"></div><div class="b"></div><div class="c"></div>', [[0, 300], [310, 190], [0, 300]]],
    ['.s{grid-template-columns:1fr 1fr}.a{width:400px;max-width:300px}', '<div class="a"></div><div class="b"></div>', [[0, 300], [310, 190]]],
    ['.s{grid-template-columns:minmax(auto,1fr) 1fr}.k{width:350px;height:2px}', '<div class="a"><div class="k"></div></div><div class="b"></div>', [[0, 350], [360, 140]]],
    ['.s{grid-template-columns:repeat(2,1fr)}', '<div class="a"></div><div class="b"></div>', [[0, 245], [255, 245]]],
  ];
  for (const [css, html, expected] of cases) {
    const r = run(css, html);
    assert.notEqual(r.status, 'unknown', `${css} ${JSON.stringify(r.diagnostics.map(d => d.message))}`);
    assert.deepEqual(columns(r), expected, css);
  }
});

test('a 200px + 1fr grid whose fr item needs 350px overflows the page', () => {
  const r = run('.s{grid-template-columns:200px 1fr}.k{width:350px;height:2px}', '<div class="a"></div><div class="b"><div class="k"></div></div>');
  assert.equal(r.status, 'violated');
});

test('an unknown minimum stays Unknown: text without a contract, a % width, spans, rows', () => {
  assert.equal(run('.s{grid-template-columns:1fr 1fr}.a{width:50%}', '<div class="a"></div><div class="b"></div>').status, 'unknown');
  assert.equal(run('.s{grid-template-columns:1fr 1fr}.a{grid-column:span 2}', '<div class="a"></div><div class="b"></div>').status, 'unknown');
  assert.equal(run('.s{grid-template-columns:1fr 1fr}', '<div class="a">text</div><div class="b"></div>').status, 'unknown');
});
