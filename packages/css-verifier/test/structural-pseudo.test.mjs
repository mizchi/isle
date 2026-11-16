import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {compileSelector} from '../src/layout/selectors.mjs';

// Structural pseudo-classes: :first-child, :last-child, :only-child, :nth-child(An+B), :nth-last-child, the *-of-type
// forms and :empty, over the element siblings. A component root's siblings are not known: Unknown there.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const analyze = (inner, css) => analyzeHTML(`<html lang="en"><body><main class="page">${inner}</main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const heights = (inner, css) => {
  const report = analyze(inner, css);
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics.map(d => d.message)));
  return report.sizes.filter(r => /^\.i/.test(r.box)).map(row => Number(row.blockSize.constant));
};
const five = '<div class="i1"></div><p class="i2"></p><div class="i3"></div><p class="i4"></p><div class="i5"></div>';

test('specificity: a structural pseudo-class counts as a class', () => {
  assert.deepEqual(compileSelector('li:nth-child(2n+1)').specificity, [0, 1, 1]);
  assert.deepEqual(compileSelector('.a:not(:last-child)').specificity, [0, 2, 0]);
});

test('child positions', () => {
  assert.deepEqual(heights(five, '.page>*{height:1px}.page>:first-child{height:2px}.page>:last-child{height:3px}'), [2, 1, 1, 1, 3]);
  assert.deepEqual(heights(five, '.page>*{height:1px}.page>:nth-child(odd){height:2px}'), [2, 1, 2, 1, 2]);
  assert.deepEqual(heights(five, '.page>*{height:1px}.page>:nth-child(2n){height:2px}'), [1, 2, 1, 2, 1]);
  assert.deepEqual(heights(five, '.page>*{height:1px}.page>:nth-child(-n+2){height:2px}'), [2, 2, 1, 1, 1]);
  assert.deepEqual(heights(five, '.page>*{height:1px}.page>:nth-child(3){height:2px}.page>:nth-last-child(2){height:4px}'), [1, 1, 2, 4, 1]);
  assert.deepEqual(heights(five, '.page>*{height:1px}.page>:not(:last-child){height:5px}'), [5, 5, 5, 5, 1]);
  assert.deepEqual(heights('<div class="i1"></div>', '.i1{height:1px}.i1:only-child{height:2px}'), [2]);
});

test('of-type positions', () => {
  assert.deepEqual(heights(five, '.page>*{height:1px}p:first-of-type{height:2px}div:last-of-type{height:3px}div:nth-of-type(2){height:4px}p:nth-last-of-type(1){height:6px}'), [1, 2, 4, 6, 3]);
  assert.deepEqual(heights('<div class="i1"></div><p class="i2"></p>', '.page>*{height:1px}.page>:only-of-type{height:2px}'), [2, 2]);
});

test(':empty: no element children and no text, not even whitespace', () => {
  assert.deepEqual(heights('<div class="i1"></div><div class="i2"> </div><div class="i3"><!-- c --></div>', '.page>*{height:1px}.page>:empty{height:2px}'), [2, 1, 2]);
});

test('a component root\'s siblings are not known', () => {
  const r = analyzeHTML('<div class="c"><div class="k"></div></div>', {name: 'C', css: `*{box-sizing:border-box;margin:0}.c{${g}}.k{height:1px}.c:first-child{padding:4px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  assert.equal(r.status, 'unknown');
  assert.equal(analyzeHTML('<div class="c"><div class="k"></div></div>', {name: 'C', css: `*{box-sizing:border-box;margin:0}.c{${g}}.k{height:1px}.k:first-child{width:50%}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}}).status, 'verified');
  // of S, and unparsable arguments, are not modeled.
  assert.equal(analyze(five, '.page>*{height:1px}:nth-child(2 of .i2){height:2px}').status, 'unknown');
});
