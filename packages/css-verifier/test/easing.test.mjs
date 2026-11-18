// Easing functions (CSS Easing 2): the range of the output progress over input progress 0..1, which can leave [0, 1]
// (an overshooting cubic-bezier, a linear() with points outside it), and the ordered interior extremes that split it
// into monotone pieces. Bounds are rationals rounded outward, so every value the browser computes is inside them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {easingRange} from '../src/layout/easing.mjs';

const n = x => Number(x);
test('keywords and in-range curves stay within [0, 1] and are monotone', () => {
  for (const e of ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier(0.25, 0.1, 0.25, 1)', 'steps(4)', 'steps(2, jump-both)', 'step-start', 'step-end']) {
    const r = easingRange(e);
    assert.deepEqual([n(r.min), n(r.max), r.extremes.length], [0, 1, 0], e);
  }
});

test('an overshooting cubic-bezier: the peak is bounded from above and below, and it is the one extreme', () => {
  // easeOutBack: y peaks at ≈1.09780 (s ≈ 0.58; checked by sampling s densely).
  const r = easingRange('cubic-bezier(0.34, 1.56, 0.64, 1)');
  assert.equal(n(r.min), 0);
  assert.ok(n(r.max) >= 1.09780 && n(r.max) <= 1.0980, r.max);
  assert.equal(r.extremes.length, 1);
  assert.ok(n(r.extremes[0].high) >= n(r.extremes[0].low));
  // easeInOutBack: dips below 0, then above 1: two extremes, the low one first.
  const both = easingRange('cubic-bezier(0.68, -0.6, 0.32, 1.6)');
  assert.ok(n(both.min) < 0 && n(both.max) > 1);
  assert.equal(both.extremes.length, 2);
  assert.ok(both.extremes[0].at < both.extremes[1].at);
  assert.ok(n(both.extremes[0].low) < 0 && n(both.extremes[1].high) > 1);
});

test('linear() takes its range from its points; malformed functions are undefined', () => {
  const r = easingRange('linear(0, 1.2 60%, 1)');
  assert.deepEqual([n(r.min), n(r.max), r.extremes.length], [0, 1.2, 1]);
  assert.equal(easingRange('cubic-bezier(1.5, 0, 0, 1)'), undefined); // x outside [0, 1] is invalid
  assert.equal(easingRange('bounce'), undefined);
});

// Checklist A4: the input progress t of each extreme, and the eased progress at any t (to put the other properties at
// their values at that moment).
import {easingAt} from '../src/layout/easing.mjs';
test('extremes carry their input progress; easingAt follows the curve', () => {
  const r = easingRange('cubic-bezier(0.34, 1.56, 0.64, 1)');
  const t = r.extremes[0].t;
  assert.ok(t > 0 && t < 1);
  assert.ok(Math.abs(easingAt('cubic-bezier(0.34, 1.56, 0.64, 1)', t) - Number(r.max)) < 2e-4);
  for (const e of ['linear', 'ease', 'ease-in-out', 'cubic-bezier(0.68, -0.6, 0.32, 1.6)']) { assert.equal(easingAt(e, 0), 0, e); assert.ok(Math.abs(easingAt(e, 1) - 1) < 1e-9, e); }
  assert.equal(easingAt('linear', 0.25), 0.25);
  // linear() with positions: the extreme of linear(0, 1.2 60%, 1) is at 60% of the input.
  const l = easingRange('linear(0, 1.2 60%, 1)');
  assert.equal(l.extremes[0].t, 0.6);
  assert.equal(easingAt('linear(0, 1.2 60%, 1)', 0.3), 0.6);
  assert.ok(Math.abs(easingAt('linear(0, 1.2 60%, 1)', 0.8) - 1.1) < 1e-12);
  // steps(4): jump-end by default.
  assert.deepEqual([0, 0.3, 0.99, 1].map(u => easingAt('steps(4)', u)), [0, 0.25, 0.75, 1]);
  assert.deepEqual([0, 0.3].map(u => easingAt('steps(4, jump-start)', u)), [0.25, 0.5]);
});
