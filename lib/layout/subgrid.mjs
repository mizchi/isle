import { q, sub, div, mul } from './linear.mjs';
import { scalar, sum, diff } from './region.mjs';
import { px } from './css.mjs';

export const gapSize = (value, parent) => value === 'normal' ? parent?.gap ?? q(0) : px(value);
export const trackArea = (values, gap, start, span) =>
  sum(values.slice(start, start + span).reduce(sum, scalar(0)), scalar(mul(gap, q(Math.max(0, span - 1)))));

/** A child borrows the actual track vector, never the parent's fr definitions. */
export function trackSlice(values, gap, box, start, span) {
  return { values: values.slice(start, start + span), gap, box, startLine: start + 1 };
}

/** Insets affect outer tracks; gap differences are centered on shared lines.
 * Keep signed affine lengths here. The engine splits out negative regions as
 * unknown instead of assuming a CSS track-collapse algorithm. */
export function inheritTracks(parent, gap, before, after) {
  const half = scalar(div(sub(parent.gap, gap), q(2))), last = parent.values.length - 1;
  return parent.values.map((value, index) => {
    const leading = index === 0 ? scalar(before) : half;
    const trailing = index === last ? scalar(after) : half;
    // Internal edges expand when the new gutter is smaller than the parent's.
    return sum(value, sum(index === 0 ? diff(scalar(0), leading) : leading,
      index === last ? diff(scalar(0), trailing) : trailing));
  });
}
