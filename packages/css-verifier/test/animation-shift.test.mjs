import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// CSS animations of layout properties: each keyframe is laid out again, and boxes whose layout start moves where the
// animation runs are layout shifts. transform and paint never shift.
const html = '<div class="page"><div class="a"></div><div class="b"></div></div>';
const base = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:40px}.b{height:40px}';
const run = css => analyzeHTML(html, {name: 'P', css: base + css, viewport: {min: 320, max: 800, height: {min: 400, max: 800}}});
const shifts = report => report.diagnostics.filter(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT');

test('layout-property keyframes that move a box are layout shifts', () => {
  const [height] = shifts(run('@keyframes grow{from{height:40px}to{height:80px}}.a{animation:grow 1s infinite}'));
  assert.deepEqual([height.box, height.animated, height.animation, height.offset, height.field, height.delta], ['.b', '.a', 'grow', 1, 'blockStart', '40']);
  const [margin] = shifts(run('@keyframes nudge{to{margin-top:12px}}.a{animation:nudge 1s}'));
  assert.deepEqual([margin.box, margin.field, margin.delta], ['.a', 'blockStart', '12']);
  assert.equal(shifts(run('@keyframes pad{50%{padding-left:8px}}.a{animation:pad 1s;display:grid;grid-template-columns:minmax(0,1fr)}')).length, 0); // no children: nothing moves
  // Only where the animation runs.
  const [wide] = shifts(run('@keyframes grow{to{height:80px}}@media (min-width:600px){.a{animation:grow 1s}}'));
  assert.ok(wide.range.min >= 600, JSON.stringify(wide.range));
});

test('animations that do not move a layout start are not shifts', () => {
  for (const css of [
    '@keyframes lift{to{transform:translateY(-8px) scale(1.1)}}.a{animation:lift 1s infinite}', // transform
    '@keyframes fade{to{opacity:0}}.a{animation:fade 1s}', // paint
    '@keyframes grow{to{height:80px}}.b{animation:grow 1s}', // the last box grows: nothing after it
    '@keyframes narrow{50%{width:50%}}.a{animation:narrow 1s}', // shrinks from its start edge
    '@keyframes grow{to{height:80px}}.a{animation:grow 1s paused}', // paused
    '@keyframes grow{to{height:80px}}.a{animation:grow 0s}', // no duration
  ]) assert.equal(run(css).status, 'verified', css);
  // A keyframe whose layout is outside the subset is Unknown, not verified.
  assert.equal(run('@keyframes m{to{margin-bottom:20px}}.a{animation:m 1s}').status, 'unknown');
});
