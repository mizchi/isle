// CSS Nesting: nested rules are flattened (& is the parent selector; a selector without & is relative to it; a nested
// @media wraps the parent), and declarations after a nested rule form a rule of their own after it, in order.
// Checked against Chromium, Firefox and WebKit by e2e/layout-nesting.spec.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const html = '<html lang="en"><body><div class="card"><div class="k"></div><div class="card"><div class="k in"></div></div></div><div class="k out"></div></body></html>';
const heights = c => { const r = analyzeHTML(html, {name: 'P', css: `*{margin:0}html,body,.card{${g}}.k{height:10px}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}); return r.status === 'unknown' ? 'unknown' : r.sizes.filter(s => /^\.k/.test(s.box.split(' ').at(-1)) && s.rect).map(s => s.rect.blockSize.constant); };

test('& and relative selectors, combinators and deeper nesting', () => {
  assert.deepEqual(heights('.card{& .k{height:30px}}'), ['30', '30', '10']);
  assert.deepEqual(heights('.card{.k{height:30px}}'), ['30', '30', '10']);
  assert.deepEqual(heights('.card{> .k{height:30px}}'), ['30', '30', '10']);
  assert.deepEqual(heights('.card{.card{.k{height:35px}}}'), ['10', '35', '10']);
  assert.deepEqual(heights('.k{.card &{height:25px}}'), ['25', '25', '10']);
  assert.deepEqual(heights('.k{&.in{height:15px}}'), ['10', '15', '10']);
});

test('a nested @media wraps the parent; declarations after a nested rule come after it', () => {
  assert.deepEqual(heights('.k{@media (min-width:300px){height:40px}}'), ['40', '40', '40']);
  assert.deepEqual(heights('.k{@media (min-width:600px){height:40px}}'), ['10', '10', '10']);
  // height:50px after the nested @media is a later rule of the same specificity: it wins.
  assert.deepEqual(heights('.k{height:20px;@media (min-width:1px){height:40px}height:50px}'), ['50', '50', '50']);
  // The nested rule keeps its place in the order: a later plain rule of the same specificity wins over it.
  assert.deepEqual(heights('.card{& .k{height:30px}}.card .k{height:20px}'), ['20', '20', '10']);
});

test('a parent list of one specificity expands; of several, & (:is) is Unknown', () => {
  assert.deepEqual(heights('.out,.card{& .k{height:30px}}'), ['30', '30', '10']);
  assert.equal(heights('.out,div.card{& .k{height:30px}}'), 'unknown');
  // & after another selector, with a parent that has combinators: :is() of a complex selector, not written out.
  assert.equal(heights('.card .k{body &{height:30px}}'), 'unknown');
  assert.deepEqual(heights('.card .k{&.in{height:15px}}'), ['10', '15', '10']);
});
