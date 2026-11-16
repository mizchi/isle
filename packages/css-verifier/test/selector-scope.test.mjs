import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const page = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
const run = (html, css, scope) => {
  const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'C', css: `${page}\n${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, scope: {firstLine: 2, ...scope}});
  return (r.selectors?.warnings ?? []).filter(w => /^E_SCOPE/.test(w.code)).map(w => [w.code, w.selector]);
};

test('scope: a compound left of a combinator that matches no element of the component depends on the page (E_SCOPE_OUTSIDE)', () => {
  const html = `<div class="card"><p class="t">Hi</p></div>`;
  assert.deepEqual(run(html, `.card{${g}}.theme-dark .card{padding:4px}`, {mode: 'scoped'}), [['E_SCOPE_OUTSIDE', '.theme-dark .card']]);
  // body and html are the page around the component, not its elements.
  assert.deepEqual(run(html, `.card{${g}}body .card{padding:4px}`, {mode: 'scoped'}), [['E_SCOPE_OUTSIDE', 'body .card']]);
  // A relation inside the component is fine; the page CSS (before firstLine) is not the component's.
  assert.deepEqual(run(html, `.card{${g}}.card > .t{padding:4px}`, {mode: 'scoped'}), []);
});

test('scope: unscoped CSS-in-JS may not style what a child component, slot or children renders (E_SCOPE_REACHES)', () => {
  const html = `<ul class="list"><!--isle-boundary:component Item--></ul>`;
  const css = `.list{${g};padding:0}.list > li{padding:4px}.list li{margin:0}`;
  assert.deepEqual(run(html, css, {mode: 'global', owned: ['list']}), [['E_SCOPE_REACHES', '.list > li'], ['E_SCOPE_REACHES', '.list li']]);
  // Its own li (no boundary under the list) is closed in the component.
  assert.deepEqual(run(`<ul class="list"><li class="i">a</li></ul>`, css, {mode: 'global', owned: ['list', 'i']}), []);
  // A subject pinned by an owned class cannot match another component's elements.
  assert.deepEqual(run(`<ul class="list"><li class="i">a</li><!--isle-boundary:children--></ul>`, `.list{${g};padding:0}.list > .i{padding:4px}`, {mode: 'global', owned: ['list', 'i']}), []);
  // Scoped styles (Svelte, Vue) hash the styled element: no reach.
  assert.deepEqual(run(html, css, {mode: 'scoped'}), []);
});
