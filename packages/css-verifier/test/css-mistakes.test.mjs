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

test('F6: a property declared twice in one rule: the earlier one never applies', () => {
  const [w] = codes(run('.a{color:red;color:blue}'), 'W_CSS_DUPLICATE_DECLARATION');
  assert.ok(w); assert.equal(w.property, 'color'); assert.match(w.message, /color: red never applies/);
  // !important keeps the earlier: the later never applies.
  assert.match(codes(run('.a{color:red !important;color:blue}'), 'W_CSS_DUPLICATE_DECLARATION')[0].message, /color: blue never applies/);
  // The fallback pattern: a later value in a newer function or unit is left alone.
  for (const css of ['.a{height:100vh;height:100dvh}', '.a{width:100%;width:calc(100% - 10px)}', '.a{display:block;display:-webkit-box}', '.a{color:red}.a{color:blue}']) assert.equal(codes(run(css), 'W_CSS_DUPLICATE_DECLARATION').length, 0, css);
});

test('F7: z-index on a box that is neither positioned nor a flex or grid item', () => {
  const html = '<div class="p"><div class="a"></div></div>';
  const inert = css => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('z-index'));
  assert.equal(inert('.p{display:block}.a{z-index:5}'), true);
  assert.equal(inert('.p{display:block}.a{z-index:5;position:relative}'), false);
  assert.equal(inert('.p{display:flex}.a{z-index:5;flex:none;width:10px}'), false);
  assert.equal(inert('.p{display:grid;grid-template-columns:minmax(0,1fr)}.a{z-index:5}'), false);
});

test('F8: a transition between auto (or none) and a length jumps', () => {
  const jump = css => codes(run(`.a{width:100px}${css}`), 'W_CSS_TRANSITION_AUTO');
  const [w] = jump('.a{height:auto;transition:height .3s}.a:hover{height:100px}');
  assert.ok(w); assert.equal(w.property, 'block-size'); assert.match(w.message, /auto/);
  assert.equal(jump('.a{max-height:none;transition:max-height .3s}.a:hover{max-height:10px}').length, 1);
  assert.equal(jump('.a{height:20px;transition:height .3s}.a:hover{height:100px}').length, 0);
  // all covers it; no transition, no warning.
  assert.equal(jump('.a{height:auto;transition:all .3s}.a:hover{height:100px}').length, 1);
  assert.equal(jump('.a{height:auto}.a:hover{height:100px}').length, 0);
});

test('F9: a ::before or ::after with no content is never generated', () => {
  const [w] = codes(run('.a::before{display:block;width:10px;height:10px;background:red}'), 'W_CSS_PSEUDO_NO_CONTENT');
  assert.ok(w); assert.match(w.message, /content/);
  assert.equal(codes(run('.a::before{content:"";display:block;height:10px}'), 'W_CSS_PSEUDO_NO_CONTENT').length, 0);
  // Content from another rule counts.
  assert.equal(codes(run('.a::after{content:""}.a::after{display:block;height:4px}'), 'W_CSS_PSEUDO_NO_CONTENT').length, 0);
});

test('F10: content on an element (not a pseudo-element) does nothing, unless it is an image', () => {
  assert.ok(codes(run('.a{content:"hi"}'), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('content')));
  assert.equal(codes(run('.a{content:normal}'), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('content')).length, 0);
});

test('the mistakes are reported where the layout is Unknown too', () => {
  // A :focus rule that changes the layout keeps the layout Unknown before it runs; a style walk still reports them.
  const r = run('.a{color:var(--x);min-width:50px;max-width:10px;z-index:2}.a:focus{height:30px}', '<div class="p"><div class="a"></div></div>');
  assert.equal(r.status, 'unknown');
  assert.deepEqual(['W_CSS_VAR_INVALID', 'W_LAYOUT_MIN_ABOVE_MAX'].map(code => codes(r, code).length), [1, 1]);
});
