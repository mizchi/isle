import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {compileSelector} from '../src/layout/selectors.mjs';

// Complex selectors: child (>), descendant (whitespace), next-sibling (+) and subsequent-sibling (~) combinators,
// matched against the element's ancestors and earlier siblings. Specificity adds up over the compounds.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const heights = (html, css) => {
  const report = analyzeHTML(html, {name: 'P', css: `*{box-sizing:border-box;margin:0}.page,.list,.card{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics.map(d => d.message)));
  return Object.fromEntries(report.sizes.map(row => [row.box, row.blockSize.constant]));
};

test('specificity adds up over the compounds', () => {
  assert.deepEqual(compileSelector('.list > .item').specificity, [0, 2, 0]);
  assert.deepEqual(compileSelector('main .list li.item').specificity, [0, 2, 2]);
  assert.deepEqual(compileSelector('#a ~ .b + p').specificity, [1, 1, 1]);
});

test('child and descendant combinators follow the tree', () => {
  const html = '<div class="page"><div class="list"><div class="item a"></div><div class="card"><div class="item b"></div></div></div></div>';
  const h = heights(html, '.item{height:10px}.list > .item{height:20px}.page .card .item{height:30px}');
  assert.equal(h['.item.a'], '20');
  assert.equal(h['.item.b'], '30');
  // A child combinator does not reach a grandchild; a descendant one does.
  assert.equal(heights(html, '.item{height:10px}.page > .item{height:40px}')['.item.a'], '10');
  assert.equal(heights(html, '.item{height:10px}.page .item{height:40px}')['.item.b'], '40');
});

test('sibling combinators look at earlier element siblings', () => {
  const html = '<div class="page"><div class="x"></div><div class="y"></div><div class="z"></div></div>';
  const h = heights(html, '.x,.y,.z{height:10px}.x + .y{height:20px}.x + .z{height:30px}.x ~ .z{height:40px}');
  assert.equal(h['.y'], '20');
  assert.equal(h['.z'], '40'); // .x + .z does not hold (.y is between), .x ~ .z does
});

test('a state on a non-subject compound is Unknown', () => {
  const report = analyzeHTML('<div class="page"><div class="x"></div></div>', {name: 'P', css: `.page{${g}}.page:hover > .x{height:10px}.x{height:5px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
  assert.equal(report.status, 'unknown');
});
