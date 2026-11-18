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
  assert.equal(infinite.assumes, 'boxes move monotonically between keyframes and the easing extremes');
  // A finite animation ends by jumping back to the box's own layout: 2 iterations, 1 wrap, and the jump back at the end.
  const twice = page('@keyframes grow{from{height:40px}to{height:80px}}.a{animation:grow .5s 2}');
  assert.ok(Math.abs(twice.window - (2 * per + per + per)) < 1e-12, JSON.stringify(twice));
  assert.ok(Math.abs(twice.endJump - per) < 1e-12);
  const alternate = page('@keyframes grow{from{height:40px}to{height:80px}}.a{animation:grow .5s infinite alternate}');
  assert.ok(Math.abs(alternate.window - 10 * per) < 1e-12); // no jumps
  // A margin keyframe is reported without a layout of its own: no bound.
  assert.equal(page('@keyframes nudge{to{margin-top:12px}}.a{animation:nudge 1s}'), undefined);
});

// Easing overshoot (easing.mjs): between keyframes a value goes as far as v0 + (v1 − v0)·y for the easing's extreme y,
// so the layout at those extremes is checked too. Here .b (pushed right by margin-left: auto) fits beside .a at 140px
// (140 + 108 ≤ 250) but wraps when the easing carries .a past it (100 + 40 × 1.0809 = 143.2).
const wrap = (animation, extra = '') => analyzeHTML('<html lang="en"><body><div class="p"><div class="a"></div><div class="b"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}body{display:grid;grid-template-columns:minmax(0,1fr)}.p{display:flex;flex-wrap:wrap;width:250px}.a{width:100px;height:20px;flex:none}.b{width:108px;height:20px;flex:none;margin-left:auto}@keyframes grow{to{width:140px}}${extra}.a{animation:${animation}}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});

test('an easing that overshoots its keyframes is checked at its extremes', () => {
  assert.equal(shifts(wrap('grow 1s linear infinite')).length, 0);
  const [over] = shifts(wrap('grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite'));
  assert.deepEqual([over?.box, over?.field], ['.b', 'blockStart']);
  assert.match(over.message, /overshoot/);
  // A keyframe's own animation-timing-function eases the interval that starts at it.
  assert.equal(shifts(wrap('grow 1s linear infinite', '@keyframes grow{from{animation-timing-function:cubic-bezier(0.5, -0.5, 0.5, 1.5)}to{width:140px}}')).length, 1);
  // ease (the default) does not overshoot.
  assert.equal(shifts(wrap('grow 1s infinite')).length, 0);
});

test('an overshoot of same-unit values and of properties that share their keyframes is checked at the shared extreme', () => {
  // rem at the keyframes with a known root font size (6.25rem → 8.75rem at 16px is 100px → 140px): converted to px.
  const rem = wrap('grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite', 'html{font-size:16px}.a{width:6.25rem}@keyframes grow{to{width:8.75rem}}');
  assert.notEqual(rem.status, 'unknown', JSON.stringify(rem.diagnostics.map(d => d.message)));
  assert.equal(shifts(rem).filter(d => d.box === '.b').length, 1);
  assert.equal(shifts(wrap('grow 1s linear infinite', 'html{font-size:16px}.a{width:6.25rem}@keyframes grow{to{width:8.75rem}}')).length, 0);
  // Two properties between the same keyframes with one easing share the progress: one frame at the extreme.
  const both = wrap('grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite', '@keyframes grow{to{width:140px;height:30px}}');
  assert.notEqual(both.status, 'unknown');
  assert.ok(shifts(both).some(d => d.box === '.b' && /overshoot/.test(d.message)));
});

// Checklist A4: properties whose keyframes (or easings) differ. Every property is placed at its value at each moment
// that matters — the keyframe offsets and every property's easing extremes — so the frames are whole states.
test('properties with different keyframes are laid out together at every keyframe and every extreme', () => {
  const joint = wrap('grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite', '@keyframes grow{50%{height:30px}to{width:140px}}');
  assert.notEqual(joint.status, 'unknown', JSON.stringify(joint.diagnostics.map(d => d.message)));
  assert.match(shifts(joint).find(d => d.box === '.b')?.message ?? '', /overshoot/);
  // Linear: width never passes 140px, so .b stays beside .a.
  assert.equal(shifts(wrap('grow 1s linear infinite', '@keyframes grow{50%{height:30px}to{width:140px}}')).filter(d => d.box === '.b').length, 0);
  // A keyframe's own easing on one property only.
  assert.notEqual(wrap('grow 1s linear infinite', '@keyframes grow{from{width:100px;animation-timing-function:cubic-bezier(0.5, -0.5, 0.5, 1.5)}50%{height:30px}to{width:140px}}').status, 'unknown');
});

test('an overshoot between mixed units is Unknown', () => {
  assert.equal(wrap('grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite', '@keyframes grow{to{width:56%}}').status, 'unknown');
  // Without an overshoot those stay as before (checked at the keyframes).
  assert.notEqual(wrap('grow 1s linear infinite', '@keyframes grow{to{width:140px;height:30px}}').status, 'unknown');
});

// A position: relative box whose keyframes move its offsets (top, left, bottom, right) shifts itself by the change:
// nothing else is laid out again (relative offsets move the box only).
test('relative offsets in keyframes shift the box itself', () => {
  const [top] = shifts(run('@keyframes nudge{to{top:12px}}.a{position:relative;animation:nudge 1s}'));
  assert.deepEqual([top?.box, top?.field, top?.delta], ['.a', 'blockStart', '12']);
  const [left] = shifts(run('@keyframes nudge{to{left:-8px}}.a{position:relative;animation:nudge 1s}'));
  assert.deepEqual([left?.box, left?.field, left?.delta], ['.a', 'inlineStart', '-8']);
  const [bottom] = shifts(run('@keyframes nudge{to{bottom:5px}}.a{position:relative;animation:nudge 1s}'));
  assert.deepEqual([bottom?.box, bottom?.field, bottom?.delta], ['.a', 'blockStart', '-5']);
  // From its own top: 0 to 0: no change (and nothing is laid out again).
  const stay = run('@keyframes stay{to{top:0}}.a{position:relative;top:0;animation:stay 1s}');
  assert.equal(stay.status, 'verified');
  // bottom does nothing while top is set.
  assert.equal(run('@keyframes nudge{to{bottom:5px}}.a{position:relative;top:0;animation:nudge 1s}').status, 'verified');
  // An overshooting easing carries the offset past 12px; the shift is reported at the extreme too.
  assert.ok(shifts(run('@keyframes nudge{to{top:12px}}.a{position:relative;animation:nudge 1s cubic-bezier(0.34, 1.56, 0.64, 1)}')).length >= 1);
});

// Several animations in one declaration (CSS Animations 1 §4): each runs; the longhand lists repeat to the length of
// animation-name. A layout animation anywhere in the list is checked.
test('every animation of a list is checked, with the other longhand lists repeated to the names', () => {
  const [second] = shifts(run('@keyframes fade{to{opacity:0}}@keyframes grow{to{height:80px}}.a{animation:fade 1s,grow 1s infinite}'));
  assert.deepEqual([second?.box, second?.animation], ['.b', 'grow']);
  // animation-duration: 1s repeats for grow; 0s for grow would run nothing.
  assert.equal(shifts(run('@keyframes fade{to{opacity:0}}@keyframes grow{to{height:80px}}.a{animation-name:fade,grow;animation-duration:1s}')).length, 1);
  assert.equal(shifts(run('@keyframes fade{to{opacity:0}}@keyframes grow{to{height:80px}}.a{animation-name:fade,grow;animation-duration:1s,0s}')).length, 0);
  // A name without @keyframes in the list runs nothing; the others still run.
  assert.equal(shifts(run('@keyframes grow{to{height:80px}}.a{animation:missing 1s,grow 1s}')).length, 1);
});

// @starting-style with a layout value (checklist A1): when the box first appears, a transition of that property runs
// from the starting value to the settled one, like a two-keyframe animation; without a transition of it the starting
// value is never drawn.
test('a transitioned starting value is checked like an animation from it; an untransitioned one changes nothing', () => {
  const [grow] = shifts(run('.a{transition:height .25s}@starting-style{.a{height:0}}'));
  assert.deepEqual([grow?.box, grow?.field], ['.b', 'blockStart']);
  assert.match(grow.message, /@starting-style/);
  assert.equal(shifts(run('.a{transition:all .3s ease-out}@starting-style{.a{height:0}}')).length, 1);
  assert.equal(shifts(run('.a{transition-property:height;transition-duration:.2s}@starting-style{.a{height:10px}}')).length, 1);
  // Not transitioned (no transition, another property, or no duration): the box appears settled.
  for (const c of ['@starting-style{.a{height:0}}', '.a{transition:opacity .3s}@starting-style{.a{height:0}}', '.a{transition:height 0s}@starting-style{.a{height:0}}']) {
    const r = run(c);
    assert.equal(r.status, 'verified', `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`);
  }
  // A starting rule for another element does not apply.
  assert.equal(shifts(run('.a{transition:height .25s}@starting-style{.b{height:0}}')).length, 0);
});

// animation-delay and animation-fill-mode (checklist A2): the box jumps from its own layout to the first keyframe only
// when a delay shows its own layout first (no backwards fill); it jumps back at the end only without a forwards fill.
test('the score bound counts the start jump only after a delay without backwards fill, and the end jump only without forwards fill', () => {
  const at = {min: 800, max: 800, height: {min: 600, max: 600}};
  const bound = css => analyzeHTML(html, {name: 'P', css: base + '@keyframes grow{from{height:60px}to{height:80px}}' + css, viewport: at}).diagnostics.find(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT')?.scoreBound;
  const plain = bound('.a{animation:grow .5s 2}');
  assert.equal(plain.startJump, undefined); // no delay: the first frame drawn is already the first keyframe
  assert.ok(plain.endJump > 0);
  const delayed = bound('.a{animation:grow .5s 1s 2}');
  assert.ok(delayed.startJump > 0);
  assert.ok(Math.abs(delayed.window - plain.window - delayed.startJump) < 1e-12);
  assert.equal(bound('.a{animation:grow .5s 1s 2 backwards}').startJump, undefined);
  const kept = bound('.a{animation:grow .5s 2 forwards}');
  assert.equal(kept.endJump, undefined);
  assert.ok(kept.window < plain.window);
  const both = bound('.a{animation:grow .5s 1s 2 both}');
  assert.deepEqual([both.startJump, both.endJump], [undefined, undefined]);
  // The longhands too.
  assert.equal(bound('.a{animation:grow .5s 2}.page .a{animation-fill-mode:forwards}').endJump, undefined);
});

// Scroll-driven animations (checklist A3): animation-timeline: scroll() / view() ties the progress to scrolling, which
// is not input for CLS, so layout keyframes shift boxes as the page scrolls. The whole progress 0..1 is checked (keyframes
// and easing extremes); there is no time window to bound the score in (the page can be scrolled back and forth).
test('a scroll-driven layout animation is checked over its whole progress, with no score bound', () => {
  const [moved] = shifts(run('@keyframes grow{to{height:80px}}.a{animation:grow linear both}.page .a{animation-timeline:scroll()}'));
  assert.deepEqual([moved?.box, moved?.scrollDriven, moved?.scoreBound], ['.b', true, undefined]);
  assert.match(moved.message, /scroll/);
  assert.equal(shifts(run('@keyframes grow{to{height:80px}}.a{animation:grow linear both}.page .a{animation-timeline:view()}')).length, 1);
  assert.equal(shifts(run('@keyframes grow{to{height:80px}}.a{animation:grow linear both}.page .a{animation-timeline:scroll(root block);animation-range:0% 50%}')).length, 1);
  // A paint-only scroll-driven animation (the usual reading progress bar) shifts nothing.
  assert.equal(run('@keyframes bar{to{transform:scaleX(1)}}.a{animation:bar linear both}.page .a{animation-timeline:scroll()}').status, 'verified');
  // A named timeline (scroll-timeline-name on some scroller) is not modeled.
  assert.equal(run('@keyframes grow{to{height:80px}}.a{animation:grow linear both}.page .a{animation-timeline:--list}').status, 'unknown');
});
