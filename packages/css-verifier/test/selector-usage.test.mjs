import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// options.selectors: each stylesheet selector against the template's elements. A selector that matches nothing is
// W_CSS_SELECTOR_UNMATCHED (with a near class name when one exists); a complex selector whose compounds each match
// some element but whose combinator never holds is W_CSS_SELECTOR_RELATION, naming the broken link.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const html = '<html lang="en"><body><main class="page"><ul class="list"><li class="item"></li></ul><div class="card"><p class="item title"></p></div></main></body></html>';
const run = css => analyzeHTML(html, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.list,.card{${g}}.item{height:10px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, selectors: true});
const codes = report => report.selectors.warnings.map(w => [w.code, w.selector]);

test('matching selectors are listed with their counts and raise nothing', () => {
  const report = run('.list > .item{color:red}.card .title{color:blue}');
  assert.deepEqual(codes(report), []);
  const row = report.selectors.rows.find(r => r.selector === '.list > .item');
  assert.equal(row.matched, 1);
  assert.equal(row.line, 1);
});

test('a selector that matches nothing, with a near class name', () => {
  const [w] = run('.itme{color:red}').selectors.warnings;
  assert.equal(w.code, 'W_CSS_SELECTOR_UNMATCHED');
  assert.match(w.message, /\.item/);
});

test('a broken parent-child relation names the link and the actual parents', () => {
  const [w] = run('.card > .item{color:red}.list .title{color:blue}').selectors.warnings.filter(w => w.selector === '.card > .item');
  assert.equal(w, undefined); // .title.item is a child of .card: it holds
  const warnings = run('.page > .item{color:red}.list .title{color:blue}.title + .item{color:green}').selectors.warnings;
  const child = warnings.find(w => w.selector === '.page > .item');
  assert.equal(child.code, 'W_CSS_SELECTOR_RELATION');
  assert.match(child.message, /parent/);
  assert.match(child.message, /\.list/);
  assert.match(child.message, /\.card/);
  assert.equal(warnings.find(w => w.selector === '.list .title').code, 'W_CSS_SELECTOR_RELATION');
  assert.match(warnings.find(w => w.selector === '.title + .item').message, /follow/);
});

test('state and pseudo-element selectors are judged on their element; off by default', () => {
  assert.deepEqual(codes(run('.item:hover{color:red}.title::before{content:"";color:red}')), []);
  assert.equal(analyzeHTML(html, {name: 'P', css: `*{margin:0}html,body,.page,.list,.card{${g}}.item{height:10px}.nope{color:red}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}}).selectors, undefined);
});
