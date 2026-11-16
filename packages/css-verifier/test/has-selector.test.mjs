import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {compileSelector} from '../src/layout/selectors.mjs';

// :has(relative selectors): descendant (default), > child, + next sibling, ~ later sibling; each argument one
// compound. States inside, complex arguments, and a component root's siblings are Unknown.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const analyze = (inner, css) => analyzeHTML(`<html lang="en"><body><main class="page">${inner}</main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.c{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const heights = (inner, css) => {
  const report = analyze(inner, css);
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics.map(d => d.message)));
  return report.sizes.filter(r => /^\.c/.test(r.box)).map(row => Number(row.blockSize.constant));
};
const html = '<div class="c a"><div class="w"><img class="m" src="data:," width="10" height="10" alt=""></div></div><div class="c b"><img class="m" src="data:," width="10" height="10" alt=""></div><div class="c d"></div><div class="c e"></div>';

test('specificity: the most specific argument', () => {
  assert.deepEqual(compileSelector('.c:has(> img, #x)').specificity, [1, 1, 0]);
});

test('descendant, child and sibling arguments', () => {
  const base = '.m{display:block}.w{display:grid;grid-template-columns:10px}.c{height:20px}';
  assert.deepEqual(heights(html, `${base}.c:has(img){height:30px}`), [30, 30, 20, 20]);
  assert.deepEqual(heights(html, `${base}.c:has(> img){height:30px}`), [20, 30, 20, 20]);
  assert.deepEqual(heights(html, `${base}.c:has(+ .d){height:30px}`), [20, 30, 20, 20]);
  assert.deepEqual(heights(html, `${base}.c:has(~ .e){height:30px}`), [30, 30, 30, 20]);
  assert.deepEqual(heights(html, `${base}.c:not(:has(img)){height:40px}`), [20, 20, 40, 40]);
  assert.deepEqual(heights(html, `${base}.c:has(.w, + .e){height:30px}`), [30, 20, 30, 20]);
});

test("states, complex arguments and a root's siblings are Unknown", () => {
  const base = '.m{display:block}.w{display:grid;grid-template-columns:10px}';
  assert.equal(analyze(html, `${base}.c:has(img:hover){padding:1px}`).status, 'unknown');
  assert.equal(analyze(html, `${base}.c:has(.w img){padding:1px}`).status, 'unknown');
  assert.equal(analyzeHTML('<div class="c"><div class="k"></div></div>', {name: 'C', css: `*{box-sizing:border-box;margin:0}.c{${g}}.k{height:1px}.c:has(+ .x){width:50%}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}}).status, 'unknown');
  assert.equal(analyzeHTML('<div class="c"><div class="k"></div></div>', {name: 'C', css: `*{box-sizing:border-box;margin:0}.c{${g}}.k{height:1px}.c:has(> .k){width:50%}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}}).status, 'verified');
});
