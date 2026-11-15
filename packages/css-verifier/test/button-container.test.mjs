import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// A button that is a grid or flex container of an icon and a label (measured: laid out as a div with the same CSS).
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const reset = 'appearance:none;padding:0 8px;border:0;min-width:0;min-height:0;background:#246;color:#fff';
const run = (inner, css = '') => analyzeHTML(`<html lang="en"><body><main class="p"><h1 class="t" aria-label="T"></h1><button class="b" type="button">${inner}</button></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};background:#fff}.t{height:10px}.b{${reset};display:grid;grid-template-columns:24px minmax(0,1fr);column-gap:8px;height:40px}.i{display:block}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true});

test('an icon button with a grid of an svg and an aria-labelled svg is checked', () => {
  const r = run('<svg class="i" width="24" height="24" fill="currentColor" aria-hidden="true"></svg><svg class="i" width="24" height="24" fill="currentColor" aria-label="Close" role="img"></svg>');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics));
  const icon = r.sizes.find(s => s.box === '.i');
  assert.deepEqual([icon.rect.inlineStart.constant, icon.rect.inlineSize.constant], ['8', '24']);
});

test('an icon-only button whose svg is aria-hidden has no name', () => {
  const r = run('<svg class="i" width="24" height="24" aria-hidden="true"></svg><span class="i"></span>');
  assert.ok(r.diagnostics.some(d => d.code === 'E_A11Y_NAME' && d.box === '.b'), JSON.stringify(r.diagnostics.map(d => d.code)));
});

test('a block button with children is still a layout container error, and a leaf button keeps display: block', () => {
  assert.equal(run('<span class="i"></span>', '.b{display:block}').status, 'violated');
});

test('icon-contrast: the svg of an icon-only button needs 3:1 against the button background', () => {
  const icon = (svg, css = '') => run(svg, `.b{grid-template-columns:24px}${css}`).diagnostics.filter(d => d.code === 'E_A11Y_ICON_CONTRAST').map(d => d.ratio.toFixed(2));
  // currentColor: the button's color (#fff on #246 passes; #456 on #246 fails).
  assert.deepEqual(icon('<svg class="i" width="24" height="24" fill="currentColor" aria-label="Close" role="img"><path d="M0 0h1"/></svg>'), []);
  assert.deepEqual(icon('<svg class="i" width="24" height="24" fill="currentColor" aria-label="Close" role="img"><path d="M0 0h1"/></svg>', '.b{color:#456}').length, 1);
  // A stroke icon (fill none), and the shapes' own attribute.
  assert.equal(icon('<svg class="i" width="24" height="24" fill="none" stroke="#357" aria-label="Close" role="img"><path d="M0 0h1"/></svg>').length, 1);
  assert.equal(icon('<svg class="i" width="24" height="24" aria-label="Close" role="img"><path fill="#fff" d="M0 0h1"/></svg>').length, 0);
  // The initial fill is black: black on #246 fails.
  assert.equal(icon('<svg class="i" width="24" height="24" aria-label="Close" role="img"><path d="M0 0h1"/></svg>').length, 1);
  // CSS fill on the svg beats its attribute.
  assert.equal(icon('<svg class="i" width="24" height="24" fill="#000" aria-label="Close" role="img"><path d="M0 0h1"/></svg>', '.i{fill:#fff}').length, 0);
  // With visible text in the button the icon is not the only content: not judged.
  assert.equal(run('<svg class="i" width="24" height="24" aria-hidden="true"><path d="M0 0h1"/></svg><span class="i">Close</span>', '.b{color:#456}').diagnostics.filter(d => d.code === 'E_A11Y_ICON_CONTRAST').length, 0);
});
