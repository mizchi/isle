// Easing ranges (packages/css-verifier/src/layout/easing.mjs): animating left from 0 to 100px with each easing, every
// value the browser computes over the iteration (1001 samples) lies within [min, max] × 100px, and the extremes are
// reached (the bound is within 0.05px; steps() excepted).
import {test, expect} from '@playwright/test';
import {easingRange} from '../packages/css-verifier/src/layout/easing.mjs';

const easings = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier(0.34, 1.56, 0.64, 1)', 'cubic-bezier(0.68, -0.6, 0.32, 1.6)', 'cubic-bezier(0.5, -0.5, 0.5, 1.5)', 'cubic-bezier(0, 2, 1, -1)', 'cubic-bezier(0.1, 0.9, 0.9, 0.1)', 'linear(0, 1.2 60%, 1)', 'linear(0, -0.3, 1)', 'steps(4)', 'steps(3, jump-both)'];

test('every computed value of an eased animation is inside the easing range, and the range is reached', async ({page}) => {
  await page.setContent('<!doctype html><html lang="en"><body><div class="m" style="position:relative;width:10px;height:10px"></div></body></html>');
  for (const easing of easings) {
    const r = easingRange(easing);
    const [lo, hi] = await page.evaluate(easing => {
      const el = document.querySelector('.m'), a = el.animate([{left: '0px'}, {left: '100px'}], {duration: 1000, easing, fill: 'both'});
      a.pause(); let lo = Infinity, hi = -Infinity;
      for (let i = 0; i <= 1000; i++) { a.currentTime = i; const v = parseFloat(getComputedStyle(el).left); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      a.cancel(); return [lo, hi];
    }, easing);
    expect(lo, `${easing}: min ${lo} ≥ ${Number(r.min) * 100}`).toBeGreaterThanOrEqual(Number(r.min) * 100 - 1e-9);
    expect(hi, `${easing}: max ${hi} ≤ ${Number(r.max) * 100}`).toBeLessThanOrEqual(Number(r.max) * 100 + 1e-9);
    // Tight: the sampled extremes come within 0.05px of the bound (1001 samples of a smooth curve). steps() never
    // reaches both keyframe values inside the iteration (jump-both starts at 1/(n+1)): its range is wider.
    if (easing.startsWith('steps')) continue;
    expect(Number(r.min) * 100 - lo, `${easing}: min reached`).toBeGreaterThan(-0.05);
    expect(hi - Number(r.max) * 100, `${easing}: max reached`).toBeGreaterThan(-0.05);
  }
});
