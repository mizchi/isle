// The keyframes of an animation together with the frames at its easing extremes. Between two keyframes that set a
// property to v0 and v1 the value is v0 + (v1 − v0)·y, y the eased progress (easing.mjs); where the easing peaks or
// dips (an overshoot past the keyframes, or a turn inside them) the value is farthest from where the keyframes alone
// put it, and between the extremes it moves one way. So laying out the keyframes and these extremes covers every
// layout the animation passes through, under the same premise as the keyframes alone: the layout moves one way while
// the value does. Implicit 0% / 100% keyframes take the box's own value and the box's easing.
//
//   easedFrames(frames, { easing: 'cubic-bezier(0.5, -0.5, 0.5, 1.5)', base: { width: '100px' } })
//     → { frames: [{ offset: 0.6…, layout: 'width:143.2…px', extreme: { property, y, from, to, easing } }, { offset: 1, layout: 'width:140px' }] }
//   → { unknown: message } where an extreme exists but its value is not known (not px, several properties at once).
import { easingRange, easingAt } from './easing.mjs';

const declarations = layout => String(layout ?? '').split(';').map(d => d.trim()).filter(Boolean).map(d => { const i = d.indexOf(':'); return [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]; });
// A length with its unit (0 takes the other end's unit): the value interpolates linearly in that unit.
// rem converts to px where the root font size is known (the box's own value is computed in px).
const lengthValue = (v, rem) => { const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|%|em|rem|vw|vh)$|^(0)$/.exec(String(v ?? '').trim()); if (!m) return null; if (m[2] === 'rem' && rem) return { n: Number(m[1]) * rem, unit: 'px' }; return { n: Number(m[1] ?? 0), unit: m[2] ?? null }; };
// Properties whose interpolated value is clamped at zero (CSS Values: negative lengths are invalid there).
const nonNegative = /^(?:width|height|min-width|min-height|max-width|max-height|inline-size|block-size|min-inline-size|min-block-size|max-inline-size|max-block-size|padding(?:-.*)?|border(?:-(?:top|right|bottom|left))?-width|gap|row-gap|column-gap|flex-basis)$/;
const percent = x => `${Math.round(x * 10000) / 100}%`;
// Checklist A5: a value between lengths of different units (px and %, vw or vh) is calc(), each unit's amount
// interpolated on its own: a·(1−y) of the one and b·y of the other. At an extreme each amount is rounded outward (as
// if y were further out) to the six decimals layout numbers take. Where a property may not go negative and an amount
// is negative, the sum is clamped at zero as the browser does (whether it is depends on the percentage basis):
// max(0px, calc(…)). null where a unit is not one of these (the caller reports Unknown).
const mixable = new Set(['px', '%', 'vw', 'vh']);
function mixedValue(property, a, b, y, outward) {
  if (!mixable.has(a.unit) || !mixable.has(b.unit)) return null;
  const amounts = new Map([[a.unit, 0], [b.unit, 0]]);
  const parts = [...amounts.keys()].map(unit => {
    const from = a.unit === unit ? a.n : 0, to = b.unit === unit ? b.n : 0, v = from + (to - from) * y;
    const up = outward === 0 ? null : (to - from) * outward >= 0;
    const r = up === null ? Math.round(v * 1e6) / 1e6 : (up ? Math.ceil(v * 1e6 - 1e-9) : Math.floor(v * 1e6 + 1e-9)) / 1e6;
    return [unit, r];
  });
  // A unit whose amount is zero (at a keyframe itself) drops out: a plain length, as the keyframe wrote it.
  const kept = parts.filter(([, v]) => v !== 0);
  if (kept.length < 2) { const [unit, v] = kept[0] ?? ['px', 0]; return nonNegative.test(property) && v < 0 ? '0px' : `${v}${unit}`; }
  const [[u0, v0], [u1, v1]] = parts, sum = `calc(${v0}${u0} ${v1 < 0 ? '-' : '+'} ${Math.abs(v1)}${u1})`;
  return nonNegative.test(property) && parts.some(([, v]) => v < 0) ? `max(0px, ${sum})` : sum;
}

export function easedFrames(frames, { easing = 'ease', base = {}, rem } = {}) {
  const layoutFrames = frames.filter(f => f.layout);
  const properties = [...new Set(layoutFrames.flatMap(f => declarations(f.layout).map(([p]) => p)))];
  // Each property's keyframes (implicit 0% / 100% from the box's own value) and the easings of each interval.
  const tracks = properties.map(property => {
    const points = frames.filter(f => declarations(f.layout).some(([p]) => p === property)).map(f => ({ offset: f.offset, value: declarations(f.layout).findLast(([p]) => p === property)[1], easing: f.easing }));
    if (!points.length || points[0].offset > 0) points.unshift({ offset: 0, value: base[property], easing: frames.find(f => f.offset === 0)?.easing, implicit: true });
    if (points.at(-1).offset < 1) points.push({ offset: 1, value: base[property] });
    const intervals = points.slice(0, -1).map((from, i) => {
      const to = points[i + 1];
      // The easings that may ease this interval: its start keyframe's (or the box's), and — browsers differ here
      // (measured: Chromium uses the easing of a keyframe that does not set the property, Firefox and WebKit do not) —
      // that of any keyframe inside it that does not set the property, and the box's own.
      // A keyframe that sets the property eases its interval in every browser; the box's own easing is a candidate only
      // where the interval starts at an implicit keyframe (one that does not set the property).
      const candidates = [...new Set([from.easing ?? easing, ...(from.implicit ? [easing] : []), ...frames.filter(f => f.easing && f.offset > from.offset && f.offset < to.offset && !declarations(f.layout).some(([p]) => p === property)).map(f => f.easing)])];
      return { from, to, candidates, moves: String(from.value) !== String(to.value) };
    });
    return { property, intervals };
  });
  const extra = [];
  const shape = t => t.intervals.map(i => `${i.from.offset}-${i.to.offset}:${i.candidates.join('|')}`).join(',');
  const moving = tracks.filter(t => t.intervals.some(i => i.moves));
  // Checklist A4: properties whose keyframes or easings differ do not share their progress. Every moment that matters
  // — the keyframe offsets of every property and each property's easing extremes — gets a frame with every property at
  // its value at that moment; between two such moments every property moves one way.
  if (moving.length > 1 && moving.some(t => shape(t) !== shape(moving[0]))) {
    const joint = jointFrames(tracks, rem);
    if (joint.frames) return joint;
    if (joint.unknown && tracks.some(t => t.intervals.some(i => i.moves && i.candidates.some(c => easingRange(c)?.extremes.length)))) return joint;
    return { frames: layoutFrames }; // no extremes: the keyframes alone, as before
  }
  for (const track of tracks) for (const interval of track.intervals) {
    if (!interval.moves) continue;
    const { from, to } = interval;
    for (const text of interval.candidates) {
      const range = easingRange(text);
      if (!range) return { unknown: `the easing ${text} of ${track.property} between ${percent(from.offset)} and ${percent(to.offset)} is not modeled` };
      if (!range.extremes.length) continue;
      // Properties eased together: the ones whose intervals and easings are this one's share its progress y.
      const together = tracks.filter(t => t.intervals.some(i => i.moves));
      if (together.some(t => shape(t) !== shape(track))) return { unknown: `the easing ${text} carries ${track.property} past its keyframes while ${together.filter(t => t !== track).map(t => t.property).join(', ')} change${together.length > 2 ? '' : 's'} between other keyframes or easings: their extremes together are not modeled` };
      if (tracks.indexOf(track) !== tracks.findIndex(t => t.intervals.some(i => i.moves))) continue; // one frame for all of them
      for (const e of range.extremes) {
        const y = Number(e.kind === 'max' ? e.high : e.low), parts = [], values = [];
        for (const t of tracks) {
          const i = t.intervals.find(x => x.from.offset === from.offset);
          const [a, b] = [lengthValue(i.from.value, rem), lengthValue(i.to.value, rem)];
          if (!i.moves) { parts.push(`${t.property}:${i.from.value}`); continue; }
          const unit = a?.unit ?? b?.unit ?? 'px';
          const mixed = a && b && a.unit && b.unit && a.unit !== b.unit ? mixedValue(t.property, a, b, y, e.kind === 'max' ? 1 : -1) : undefined;
          if (mixed) { parts.push(`${t.property}:${mixed}`); values.push(`${t.property} ${mixed}`); continue; }
          if (!a || !b || mixed === null) return { unknown: `the easing ${text} carries ${t.property} past its keyframes between ${percent(from.offset)} and ${percent(to.offset)}, and ${!a ? i.from.value ?? 'its own value' : !b ? i.to.value ?? 'its own value' : `${i.from.value} and ${i.to.value}`} ${!a || !b ? 'is not a length' : 'are in units that are not combined (px, %, vw, vh are)'} to extrapolate` };
          let value = a.n + (b.n - a.n) * y;
          if (nonNegative.test(t.property)) value = Math.max(0, value);
          // Rounded outward: away from the nearer keyframe value, so the frame is at least as far as the browser goes.
          const away = value >= Math.max(a.n, b.n) ? 1 : value <= Math.min(a.n, b.n) ? -1 : (e.kind === 'max') === (b.n >= a.n) ? 1 : -1;
          const rounded = (away > 0 ? Math.ceil(value * 1e4) : Math.floor(value * 1e4)) / 1e4;
          parts.push(`${t.property}:${rounded}${unit}`); values.push(`${t.property} ${rounded}${unit}`);
        }
        extra.push({ offset: from.offset + (to.offset - from.offset) * e.at, layout: parts.join(';'), extreme: { property: track.property, y, from: percent(from.offset), to: percent(to.offset), easing: text, value: values.join(', ') } });
      }
    }
  }
  return { frames: [...layoutFrames, ...extra].sort((a, b) => a.offset - b.offset) };
}

// The whole state at each moment that matters, for properties whose keyframes differ (see easedFrames). Every value is a
// length interpolated in its unit; an interval eased by more than one candidate (browsers differ), or a value that is
// not a length, is reported as unknown.
function jointFrames(tracks, rem) {
  // An interval that browsers ease differently (several candidates): each choice is a scenario, and the frames of all
  // scenarios together cover every browser (at most 8 scenarios).
  const choices = tracks.flatMap(t => t.intervals.filter(i => i.moves && i.candidates.length > 1));
  const count = choices.reduce((n, i) => n * i.candidates.length, 1);
  if (count > 8) return { unknown: `${count} combinations of easings that browsers choose differently: not modeled` };
  if (choices.length) {
    const all = [];
    for (let k = 0; k < count; k++) {
      let rest = k;
      const pick = new Map(choices.map(i => { const c = i.candidates[rest % i.candidates.length]; rest = Math.floor(rest / i.candidates.length); return [i, c]; }));
      const scenario = tracks.map(t => ({ ...t, intervals: t.intervals.map(i => pick.has(i) ? { ...i, candidates: [pick.get(i)] } : i) }));
      const result = jointFrames(scenario, rem);
      if (!result.frames) return result;
      all.push(...result.frames);
    }
    return { frames: all.sort((a, b) => a.offset - b.offset) };
  }
  const moments = new Map(); // offset → the property at its extreme there (if any)
  const intervalAt = (t, offset) => t.intervals.find(i => offset >= i.from.offset && offset <= i.to.offset) ?? t.intervals.at(-1);
  for (const t of tracks) for (const i of t.intervals) {
    moments.set(i.from.offset, moments.get(i.from.offset) ?? null); moments.set(i.to.offset, moments.get(i.to.offset) ?? null);
    if (!i.moves) continue;
    if (i.candidates.length > 1) return { unknown: `${t.property} between ${percent(i.from.offset)} and ${percent(i.to.offset)} may be eased by ${i.candidates.join(' or ')} (browsers differ) while other properties change between other keyframes: not modeled` };
    const range = easingRange(i.candidates[0]);
    if (!range) return { unknown: `the easing ${i.candidates[0]} of ${t.property} is not modeled` };
    for (const e of range.extremes) moments.set(i.from.offset + (i.to.offset - i.from.offset) * e.t, { track: t, interval: i, extreme: e });
  }
  const frames = [];
  for (const [offset, at] of [...moments].sort((a, b) => a[0] - b[0])) {
    const parts = [], values = [];
    for (const t of tracks) {
      const i = at?.track === t ? at.interval : intervalAt(t, offset);
      if (!i.moves) { parts.push(`${t.property}:${i.from.value}`); continue; }
      const [a, b] = [lengthValue(i.from.value, rem), lengthValue(i.to.value, rem)];
      const unit = a?.unit ?? b?.unit ?? 'px', span = i.to.offset - i.from.offset;
      // The property at its own extreme takes the outward bound; the others their eased value at this moment.
      const y = at?.track === t ? Number(at.extreme.kind === 'max' ? at.extreme.high : at.extreme.low) : easingAt(i.candidates[0], span ? (offset - i.from.offset) / span : 1);
      const mixed = a && b && a.unit && b.unit && a.unit !== b.unit ? mixedValue(t.property, a, b, y, at?.track === t ? (at.extreme.kind === 'max' ? 1 : -1) : 0) : undefined;
      if (mixed) { parts.push(`${t.property}:${mixed}`); values.push(`${t.property} ${mixed}`); continue; }
      if (!a || !b || mixed === null) return { unknown: `${t.property} changes between ${i.from.value ?? 'its own value'} and ${i.to.value ?? 'its own value'} while other properties change between other keyframes: values that are not lengths of one unit or of px, %, vw and vh are not interpolated` };
      let value = a.n + (b.n - a.n) * y;
      if (nonNegative.test(t.property)) value = Math.max(0, value);
      const rounded = at?.track === t ? ((value >= Math.max(a.n, b.n) || (value > Math.min(a.n, b.n) && (at.extreme.kind === 'max') === (b.n >= a.n)) ? Math.ceil(value * 1e4) : Math.floor(value * 1e4)) / 1e4) : Math.round(value * 1e4) / 1e4;
      parts.push(`${t.property}:${rounded}${unit}`); values.push(`${t.property} ${rounded}${unit}`);
    }
    frames.push({ offset, layout: parts.join(';'), ...(at ? { extreme: { property: at.track.property, y: Number(at.extreme.kind === 'max' ? at.extreme.high : at.extreme.low), from: percent(at.interval.from.offset), to: percent(at.interval.to.offset), easing: at.interval.candidates[0], value: values.join(', ') } } : {}) });
  }
  return { frames };
}
