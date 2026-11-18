// Checklist F: CSS that the browser accepts but that does nothing — mistakes a static check can point at.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const run = (css, html = '<div class="a"></div>') => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
const codes = (r, code) => (r.layoutWarnings ?? []).filter(w => w.code === code);

test('F1: an animation whose name has no @keyframes does nothing', () => {
  const [w] = codes(run('.a{animation:spin 1s infinite}'), 'W_CSS_KEYFRAMES_MISSING');
  assert.ok(w); assert.equal(w.keyframes, 'spin'); assert.match(w.message, /@keyframes spin/);
  assert.equal(codes(run('.a{animation:spin 1s infinite}@keyframes spin{to{opacity:.5}}'), 'W_CSS_KEYFRAMES_MISSING').length, 0);
  // A typo in a list: only the missing one.
  assert.deepEqual(codes(run('.a{animation:fade 1s,spn 2s}@keyframes fade{to{opacity:.5}}'), 'W_CSS_KEYFRAMES_MISSING').map(w => w.keyframes), ['spn']);
  assert.equal(codes(run('.a{animation:none}'), 'W_CSS_KEYFRAMES_MISSING').length, 0);
});

test('F2: an animation with no duration runs for 0s', () => {
  assert.equal(codes(run('.a{animation:spin infinite}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 1);
  assert.equal(codes(run('.a{animation:spin 1s infinite}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 0);
  // 0s with fill-mode forwards or both applies the end state on purpose.
  assert.equal(codes(run('.a{animation:spin 0s forwards}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 0);
  // A scroll-driven animation has no time duration.
  assert.equal(codes(run('.a{animation:spin linear;animation-timeline:scroll()}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 0);
});

test('F3: a var() with no value and no fallback makes the declaration unset', () => {
  const [w] = codes(run('.a{color:var(--brand)}'), 'W_CSS_VAR_INVALID');
  assert.ok(w); assert.equal(w.property, 'color'); assert.match(w.message, /--brand/);
  assert.equal(codes(run('.a{color:var(--brand, red)}'), 'W_CSS_VAR_INVALID').length, 0);
  assert.equal(codes(run(':root{--brand:red}.a{color:var(--brand)}'), 'W_CSS_VAR_INVALID').length, 0);
});

test('F4: a max size below the min size fixes the box at the min', () => {
  const [w] = codes(run('.a{min-width:50px;max-width:10px}'), 'W_LAYOUT_MIN_ABOVE_MAX');
  assert.ok(w); assert.match(w.message, /always 50px wide/);
  assert.equal(codes(run('.a{min-width:10px;max-width:50px}'), 'W_LAYOUT_MIN_ABOVE_MAX').length, 0);
  assert.equal(codes(run('.a{min-height:50px;max-height:30px;height:auto}'), 'W_LAYOUT_MIN_ABOVE_MAX').length, 1);
});

test('F5: a media query that no viewport matches', () => {
  const [w] = codes(run('@media (min-width:900px) and (max-width:600px){.a{color:red}}'), 'W_CSS_MEDIA_NEVER');
  assert.ok(w); assert.match(w.message, /900/);
  assert.equal(codes(run('@media (min-width:600px) and (max-width:900px){.a{color:red}}'), 'W_CSS_MEDIA_NEVER').length, 0);
  assert.equal(codes(run('@media (width > 600px) and (width < 600px){.a{color:red}}'), 'W_CSS_MEDIA_NEVER').length, 1);
  // A list matches when any query does.
  assert.equal(codes(run('@media (min-width:900px) and (max-width:600px), print{.a{color:red}}'), 'W_CSS_MEDIA_NEVER').length, 0);
});
