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
  assert.equal(run('@keyframes m{to{margin-bottom:-20px}}.a{animation:m 1s}').status, 'unknown');
  // A px margin of a grid item is modeled: animating it moves what follows.
  assert.ok(run('@keyframes m{to{margin-bottom:20px}}.a{animation:m 1s}').diagnostics.some(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT'));
});

test('an animation shift carries a session-window score bound under the monotone-motion premise', () => {
  const at = {min: 800, max: 800, height: {min: 600, max: 600}};
  const page = css => analyzeHTML(html, {name: 'P', css: base + '.a{background:#ccc}.b{background:#444}' + css, viewport: at}).diagnostics.find(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT')?.scoreBound;
  // .b moves 40px each way: the hull of its two places (800 × 80) over 800 × 600, times 40 / 800, per iteration.
  const per = (800 * 80 / 480000) * (40 / 800);
  const infinite = page('@keyframes grow{from{height:40px}to{height:80px}}.a{animation:grow .5s infinite}');
  assert.ok(Math.abs(infinite.perIteration - per) < 1e-12);
  assert.equal(infinite.iterations, 10); // a 5 s window holds 10 iterations of 0.5 s
  assert.ok(Math.abs(infinite.window - (10 * per + 9 * per)) < 1e-12); // plus 9 jumps back from 100% to 0%
  assert.equal(infinite.assumes, 'boxes move monotonically between keyframes');
  const alternate = page('@keyframes grow{from{height:40px}to{height:80px}}.a{animation:grow .5s infinite alternate}');
  assert.ok(Math.abs(alternate.window - 10 * per) < 1e-12); // no jumps
  // A margin keyframe is reported without a layout of its own: no bound.
  assert.equal(page('@keyframes nudge{to{margin-top:12px}}.a{animation:nudge 1s}'), undefined);
});
