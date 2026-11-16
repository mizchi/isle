import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {compileSelector} from '../src/layout/selectors.mjs';

// Attribute selectors ([a], [a=v], ~=, |=, ^=, $=, *=, the i flag) and :not() match the element's attributes. A
// value test against an adapter's placeholder for a dynamic value ("dynamic") is Unknown.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const analyze = (inner, css) => analyzeHTML(`<html lang="en"><body><main class="page">${inner}</main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page{${g}}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const heights = (inner, css) => {
  const report = analyze(inner, css);
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics.map(d => d.message)));
  return Object.fromEntries(report.sizes.filter(r => /^\.[a-z]$/.test(r.box)).map(row => [row.box, Number(row.blockSize.constant)]));
};

test('specificity: an attribute selector counts as a class; :not() as its most specific argument', () => {
  assert.deepEqual(compileSelector('button[disabled]').specificity, [0, 1, 1]);
  assert.deepEqual(compileSelector('.a:not(.b, #c)').specificity, [1, 1, 0]);
  assert.deepEqual(compileSelector('[data-state="open"] > .x').specificity, [0, 2, 0]);
});

test('presence and value operators', () => {
  const html = '<div class="a" data-state="open"></div><div class="b" data-tags="x y-z" lang="en-US"></div><div class="c" data-href="https://ex.com/doc.pdf"></div><div class="d"></div>';
  const h = heights(html, 'div{height:1px}[data-state]{height:2px}[data-state="closed"]{height:3px}[data-tags~="y-z"]{height:4px}div[lang|="en"]{height:5px}[data-href^="https:"]{height:6px}[data-href$=".PDF" i]{height:7px}');
  assert.deepEqual(h, {'.a': 2, '.b': 5, '.c': 7, '.d': 1});
  assert.deepEqual(heights(html, 'div{height:1px}[data-href*="ex.com"]{height:8px}[data-tags~="y"]{height:9px}'), {'.a': 1, '.b': 1, '.c': 8, '.d': 1});
});

test(':not() excludes, combines with attributes and combinators', () => {
  const html = '<div class="a" aria-expanded="true"></div><div class="b" aria-expanded="false"></div><div class="c"></div>';
  assert.deepEqual(heights(html, 'div{height:1px}div:not([aria-expanded="true"]){height:2px}'), {'.a': 1, '.b': 2, '.c': 2});
  assert.deepEqual(heights(html, 'div{height:1px}[aria-expanded="true"] + div{height:3px}'), {'.a': 1, '.b': 3, '.c': 1});
  // A user-action state or a combinator inside :not() is not modeled.
  assert.equal(analyze(html, 'div{height:1px}div:not(:hover){height:2px}').status, 'unknown');
  assert.equal(analyze(html, 'div{height:1px}div:not(.x .y){height:2px}').status, 'unknown');
});

test('a value test against a dynamic placeholder is Unknown; presence is known', () => {
  const html = '<div class="a" data-state="dynamic"></div>';
  assert.equal(analyze(html, 'div{height:1px}[data-state="open"]{height:2px}').status, 'unknown');
  assert.deepEqual(heights(html, 'div{height:1px}[data-state]{height:2px}'), {'.a': 2});
});

test('dialog[open] and :not([open]) follow the open attribute', () => {
  const r = analyze('<dialog class="d"><div class="k"></div></dialog><div class="n"></div>', '.n,.k{height:10px}dialog[open]{display:flex}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.ok(!(r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DIALOG_CLOSED_SHOWN'));
});

test('a dynamic value under a state or a combinator is Unknown, never a crash', () => {
  const html = '<div class="k" data-a="dynamic"><a class="z" href="/">x</a></div>';
  for (const css of ['.k[data-a="2"]:hover{height:30px}', '.k[data-a="2"]:focus-within{height:30px}', '[data-a="2"] .z:hover{color:red}'])
    assert.equal(analyze(html, `.k{${g};height:30px}.z{display:block;height:24px}${css}`).status, 'unknown', css);
  // Another compound part that does not match: not affected.
  assert.equal(analyze('<div class="k" data-a="dynamic"></div>', '.k{height:30px}.q[data-a="2"]{height:1px}').status, 'verified');
});
