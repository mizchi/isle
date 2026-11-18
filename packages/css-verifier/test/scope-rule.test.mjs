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

test('limits, :scope, & and combinators inside @scope stay Unknown', () => {
  for (const c of ['@scope (.card) to (.in){.k{height:30px}}', '@scope (.card){:scope{height:30px}}', '@scope (.card){& .k{height:30px}}', '@scope (.card){.card .k{height:30px}}', '@scope{.k{height:30px}}']) assert.equal(heights(c), 'unknown', c);
});
