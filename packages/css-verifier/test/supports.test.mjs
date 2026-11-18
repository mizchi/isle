// @supports: a condition is decided only from declarations and selectors every target browser supports
// (packages/css-verifier/src/layout/supports.mjs, checked against CSS.supports in e2e/layout-supports.spec.mjs);
// anything else stays Unknown.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {supportsCondition} from '../src/layout/supports.mjs';

test('conditions over known-supported features are decided; others are undefined', () => {
  assert.equal(supportsCondition('(display: grid)'), true);
  assert.equal(supportsCondition('(display:flex) and (gap: 1rem)'), true);
  assert.equal(supportsCondition('not (display: grid)'), false);
  assert.equal(supportsCondition('(aspect-ratio: 16 / 9) or (foo: bar)'), true);
  assert.equal(supportsCondition('(foo: bar)'), undefined);
  assert.equal(supportsCondition('(display: grid) and (foo: bar)'), undefined);
  assert.equal(supportsCondition('not ((display: grid) and (position: sticky))'), false);
  assert.equal(supportsCondition('selector(:has(a))'), true);
  assert.equal(supportsCondition('selector(:focus-visible)'), true);
  assert.equal(supportsCondition('(display: grid) and'), undefined);
  // and and or are not mixed without parentheses (invalid: the whole @supports is false in the browser, but stays
  // Unknown here).
  assert.equal(supportsCondition('(display: grid) and (gap: 0) or (display: flex)'), undefined);
});

test('@supports applies its rules when the condition holds, skips them when it does not, and is Unknown otherwise', () => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const height = c => { const r = analyzeHTML('<html lang="en"><body><div class="m"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{${g}}.m{height:20px}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}); return r.status === 'unknown' ? 'unknown' : r.sizes.find(s => s.box === '.m' && s.rect).rect.blockSize.constant; };
  assert.equal(height('@supports (display: grid){.m{height:30px}}'), '30');
  assert.equal(height('@supports not (display: grid){.m{height:30px}}'), '20');
  assert.equal(height('@supports (foo: bar){.m{height:30px}}'), 'unknown');
  assert.equal(height('@media (min-width:1px){@supports (display:flex){.m{height:40px}}}'), '40');
});
