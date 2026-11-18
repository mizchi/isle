// Easing functions (CSS Easing 2) as the range of their output progress: over input progress t in [0, 1] an easing
// gives y(t), which a cubic-bezier with y1 or y2 outside [0, 1], or a linear() with points outside it, carries past
// the keyframe values (an overshoot). The animated value between two keyframes is v0 + (v1 − v0)·y, so the extremes of
// y are the extremes of the value.
//
//   easingRange('cubic-bezier(0.34, 1.56, 0.64, 1)')
//     → { min: '0', max: '1.099951', extremes: [{ at: 0.79…, low: '1.099949', high: '1.099951' }] }
//
// min and max bound y over t in [0, 1] (they include 0 and 1, the keyframe values). extremes are the interior local
// extremes in input order (kind: 'max' or 'min'), each bounded by [low, high]: between consecutive extremes (and the
// ends) y is monotone.
// Bounds are decimals rounded outward by 1e-4 of the progress (see down/up), so every value a browser computes lies
// inside them (e2e/layout-easing.spec.mjs). Anything else (an unknown keyword, an invalid argument) is
// undefined: the caller treats the progress as unknown.

const keywords = {
  linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1],
};
// Outward by 1e-4 of the progress (0.01px per 100px of change): browsers solve the curve numerically and round what
// they compute (measured: cubic-bezier(0.5, -0.5, 0.5, 1.5) peaks at 108.095px for 100px in Chromium, 1.2e-5 past the
// exact 1.0809488), so a bound at the exact value is not enough.
const trim = v => v.toFixed(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
const down = y => trim((Math.floor(y * 1e4) - 1) / 1e4);
const up = y => trim((Math.ceil(y * 1e4) + 1) / 1e4);
const unit = { min: '0', max: '1', extremes: [] };
const number = v => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(v.trim()) ? Number(v) : NaN;

function bezier(x1, y1, x2, y2) {
  if (![x1, y1, x2, y2].every(Number.isFinite) || x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return undefined;
  // y(s) = 3(1−s)²s·y1 + 3(1−s)s²·y2 + s³ for s in [0, 1]; x(s) is non-decreasing (x1, x2 in [0, 1]), so s runs with t.
  // y'(s)/3 = a s² + b s + c with c = y1, b = 2(y2 − 2y1), a = 3y1 − 3y2 + 1.
  const y = s => 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s ** 2 * y2 + s ** 3;
  const x = s => 3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s ** 2 * x2 + s ** 3;
  const a = 3 * y1 - 3 * y2 + 1, b = 2 * (y2 - 2 * y1), c = y1;
  let roots = [];
  if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) roots = [-c / b]; }
  else { const d = b * b - 4 * a * c; if (d >= 0) roots = [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)]; }
  // Interior roots where y' changes sign (a double root is no extreme).
  const extremes = [...new Set(roots.filter(s => s > 1e-9 && s < 1 - 1e-9))].sort((p, q) => p - q)
    .filter(s => { const e = 1e-6; return Math.sign(3 * (a * (s - e) ** 2 + b * (s - e) + c)) !== Math.sign(3 * (a * (s + e) ** 2 + b * (s + e) + c)); })
    .map(s => ({ at: s, t: x(s), kind: 3 * (a * (s - 1e-6) ** 2 + b * (s - 1e-6) + c) > 0 ? 'max' : 'min', low: down(y(s)), high: up(y(s)) }));
  const lows = extremes.map(e => Number(e.low)), highs = extremes.map(e => Number(e.high));
  const min = Math.min(0, ...lows), max = Math.max(1, ...highs);
  return { min: min === 0 ? '0' : extremes.find(e => Number(e.low) === min).low, max: max === 1 ? '1' : extremes.find(e => Number(e.high) === max).high, extremes };
}

// linear(): the points (input, output) with the inputs filled in as CSS Easing 2 §2.1 does: the first and last default
// to 0% and 100%, an input never goes back (clamped to the largest before it), and runs of missing inputs are spread
// evenly between their neighbours. A point with two percentages is two points.
function linearPointList(args) {
  const points = [];
  for (const part of args.split(',')) {
    const [v, ...positions] = part.trim().split(/\s+/), value = number(v);
    if (!Number.isFinite(value) || positions.length > 2) return undefined;
    const inputs = positions.map(p => /^-?\d*\.?\d+%$/.test(p) ? Number(p.slice(0, -1)) / 100 : NaN);
    if (inputs.some(Number.isNaN)) return undefined;
    if (!inputs.length) points.push({ value, input: null }); else for (const input of inputs) points.push({ value, input });
  }
  if (points.length < 2) return undefined;
  if (points[0].input === null) points[0].input = 0;
  if (points.at(-1).input === null) points.at(-1).input = 1;
  let largest = -Infinity;
  for (const p of points) if (p.input !== null) { p.input = Math.max(p.input, largest); largest = p.input; }
  for (let i = 0; i < points.length; i++) if (points[i].input === null) {
    let j = i; while (points[j].input === null) j++;
    const [a, b] = [points[i - 1].input, points[j].input];
    for (let k = i; k < j; k++) points[k].input = a + (b - a) * (k - i + 1) / (j - i + 1);
    i = j;
  }
  return points;
}
function linearPoints(args) {
  const points = linearPointList(args);
  if (!points) return undefined;
  const values = points.map(p => p.value), extremes = [];
  for (let i = 1; i + 1 < values.length; i++) {
    const before = Math.sign(values[i] - values[i - 1]), after = Math.sign(values[i + 1] - values[i]);
    if (before && after && before !== after) extremes.push({ at: points[i].input, t: points[i].input, kind: before > 0 ? 'max' : 'min', low: String(values[i]), high: String(values[i]) });
  }
  return { min: String(Math.min(0, ...values)), max: String(Math.max(1, ...values)), extremes };
}

export function easingRange(text) {
  const value = String(text ?? '').trim().toLowerCase();
  if (keywords[value]) return bezier(...keywords[value]);
  if (['step-start', 'step-end'].includes(value) || /^steps\(\s*\d+\s*(?:,\s*(?:jump-start|jump-end|jump-none|jump-both|start|end)\s*)?\)$/.test(value)) return unit;
  let m = /^cubic-bezier\(([^)]*)\)$/.exec(value);
  if (m) { const parts = m[1].split(',').map(number); return parts.length === 4 ? bezier(...parts) : undefined; }
  m = /^linear\(([^)]*)\)$/.exec(value);
  if (m) return linearPoints(m[1]);
  return undefined;
}

// Whether the progress leaves [0, 1].
export const overshoots = range => Boolean(range) && (Number(range.min) < 0 || Number(range.max) > 1);

// The eased progress at input progress u in [0, 1] (to place a property at the moment another one peaks). A cubic-bezier
// is solved for s with x(s) = u by bisection (x is non-decreasing), to 1e-12; linear() interpolates its points; steps()
// follows CSS Easing 2 §2.3 (the step at u, with the jumps of its position keyword).
export function easingAt(text, u) {
  const value = String(text ?? '').trim().toLowerCase();
  if (value === 'linear') return Math.min(1, Math.max(0, u));
  const curve = keywords[value] ?? (/^cubic-bezier\(([^)]*)\)$/.exec(value)?.[1].split(',').map(number));
  if (curve && curve.length === 4) {
    const [x1, y1, x2, y2] = curve;
    if (u <= 0) return 0; if (u >= 1) return 1;
    const x = s => 3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s ** 2 * x2 + s ** 3, y = s => 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s ** 2 * y2 + s ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (x(mid) < u) lo = mid; else hi = mid; }
    return y((lo + hi) / 2);
  }
  const linear = /^linear\(([^)]*)\)$/.exec(value);
  if (linear) {
    const points = linearPointList(linear[1]);
    if (!points) return undefined;
    const k = points.findLastIndex(p => p.input <= u);
    if (k < 0) return points[0].value;
    if (k === points.length - 1) return points[k].value;
    const [a, b] = [points[k], points[k + 1]];
    return b.input === a.input ? b.value : a.value + (b.value - a.value) * (u - a.input) / (b.input - a.input);
  }
  const steps = value === 'step-start' ? [1, 'jump-start'] : value === 'step-end' ? [1, 'jump-end'] : (() => { const m = /^steps\(\s*(\d+)\s*(?:,\s*([a-z-]+)\s*)?\)$/.exec(value); return m ? [Number(m[1]), m[2] ?? 'end'] : null; })();
  if (steps) {
    const [n, position] = steps, start = ['jump-start', 'start', 'jump-both'].includes(position);
    const jumps = position === 'jump-none' ? n - 1 : position === 'jump-both' ? n + 1 : n;
    let step = Math.floor(u * n) + (start ? 1 : 0);
    if (u >= 1) step = jumps;
    return Math.min(1, Math.max(0, step / jumps));
  }
  return undefined;
}
