// @scope (CSS Cascade 6 §2.5): rules inside apply to the root's descendants only, and at equal specificity the
// declaration whose scope root is nearer wins (unscoped ones are farthest), whatever the order of appearance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const html = '<html lang="en"><body><div class="card"><div class="k"></div><div class="card"><div class="k in"></div></div></div><div class="k out"></div></body></html>';
const heights = c => { const r = analyzeHTML(html, {name: 'P', css: `*{margin:0}html,body,.card{${g}}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}); return r.status === 'unknown' ? 'unknown' : r.sizes.filter(s => s.box.startsWith('.k') && s.rect).map(s => s.rect.blockSize.constant); };

test('@scope applies inside the root only', () => {
  assert.deepEqual(heights('.k{height:10px}@scope (.card){.k{height:30px}}'), ['30', '30', '10']);
});

test('at equal specificity the nearer scope root wins, and a scoped declaration beats a later unscoped one', () => {
  assert.deepEqual(heights('@scope (.card){.k{height:30px}}.k{height:10px}'), ['30', '30', '10']);
  // Higher specificity still wins first.
  assert.deepEqual(heights('@scope (.card){.k{height:30px}}div.k{height:10px}'), ['10', '10', '10']);
  // Two scopes: for .in the inner .card is nearer than body.
  assert.deepEqual(heights('@scope (.card){.k{height:30px}}@scope (body){.k{height:20px}}'), ['30', '30', '20']);
});

test('a scope limit (to …) excludes the limit elements and what is inside them', () => {
  // .in is a limit: the .k that is .in is outside the scope; the other .k inside .card is in it.
  assert.deepEqual(heights('.k{height:10px}@scope (.card) to (.in){.k{height:30px}}'), ['30', '10', '10']);
  // A limit that contains elements: the inner .card is a limit, so the .k inside it is out of the outer card's scope,
  // but the inner .card is a root of its own (it matches .card) — its limit is below it, so its .k is in.
  assert.deepEqual(heights('.k{height:10px}@scope (.card) to (.card){.k{height:30px}}'), ['30', '30', '10']);
  assert.deepEqual(heights('.k{height:10px}@scope (body) to (.card){.k{height:30px}}'), ['10', '10', '30']);
});

// Checklist C2: :scope is the root itself (specificity of one pseudo-class), & is :where(:scope) (no specificity, as
// measured in the three browsers); :scope > x and & x reach its children and descendants.
test(':scope and & inside @scope', () => {
  const cards = c => { const r = analyzeHTML(html, {name: 'P', css: `*{margin:0}html,body,.card{${g}}.k{height:10px}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}); return r.status === 'unknown' ? 'unknown' : r.sizes.filter(s => /\.card$/.test(s.box.split(' ').at(-1)) && s.rect).map(s => s.rect.blockSize.constant); };
  // :scope gives each .card a padding; the outer card (with its padding) grows.
  assert.notEqual(cards('@scope (.card){:scope{padding-top:5px}}'), 'unknown');
  assert.deepEqual(heights('.k{height:10px}@scope (.card){:scope > .k{height:30px}}'), ['30', '30', '10']);
  assert.deepEqual(heights('.k{height:10px}@scope (.card){& > .k{height:30px}}'), ['30', '30', '10']);
  assert.deepEqual(heights('.k{height:10px}@scope (.card){& .k{height:30px}}'), ['30', '30', '10']);
  // Specificity: :scope counts as one pseudo-class, & as nothing. Against .card > .k (0,2,0): :scope > .k (0,2,0)
  // ties and the scoped one is nearer, so it wins; & > .k (0,1,0) loses. Against .k (0,1,0), & > .k ties and wins.
  assert.deepEqual(heights('.k{height:10px}@scope (div.card){:scope > .k{height:30px}}.card > .k{height:15px}'), ['30', '30', '10']);
  assert.deepEqual(heights('.k{height:10px}@scope (div.card){& > .k{height:30px}}.card > .k{height:15px}'), ['15', '15', '10']);
  assert.deepEqual(heights('@scope (div.card){& > .k{height:30px}}.k{height:15px}'), ['30', '30', '15']);
});

test('limits, combinators after :scope or &, and nested @scope stay Unknown', () => {
  for (const c of ['@scope (.card){:scope > .card .k{height:30px}}', '@scope (.card){& + .k{height:30px}}', '@scope (.card){.card .k{height:30px}}', '@scope{.k{height:30px}}', '@scope (.card){@scope (.k){:scope{height:30px}}}']) assert.equal(heights(c), 'unknown', c);
});
