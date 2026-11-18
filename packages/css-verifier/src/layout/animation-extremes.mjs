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
import { easingRange } from './easing.mjs';

const declarations = layout => String(layout ?? '').split(';').map(d => d.trim()).filter(Boolean).map(d => { const i = d.indexOf(':'); return [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]; });
// A length with its unit (0 takes the other end's unit): the value interpolates linearly in that unit.
// rem converts to px where the root font size is known (the box's own value is computed in px).
const lengthValue = (v, rem) => { const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|%|em|rem|vw|vh)$|^(0)$/.exec(String(v ?? '').trim()); if (!m) return null; if (m[2] === 'rem' && rem) return { n: Number(m[1]) * rem, unit: 'px' }; return { n: Number(m[1] ?? 0), unit: m[2] ?? null }; };
// Properties whose interpolated value is clamped at zero (CSS Values: negative lengths are invalid there).
const nonNegative = /^(?:width|height|min-width|min-height|max-width|max-height|inline-size|block-size|min-inline-size|min-block-size|max-inline-size|max-block-size|padding(?:-.*)?|border(?:-(?:top|right|bottom|left))?-width|gap|row-gap|column-gap|flex-basis)$/;
const percent = x => `${Math.round(x * 10000) / 100}%`;

export function easedFrames(frames, { easing = 'ease', base = {}, rem } = {}) {
  const layoutFrames = frames.filter(f => f.layout);
  const properties = [...new Set(layoutFrames.flatMap(f => declarations(f.layout).map(([p]) => p)))];
  // Each property's keyframes (implicit 0% / 100% from the box's own value) and the easings of each interval.
  const tracks = properties.map(property => {
    const points = frames.filter(f => declarations(f.layout).some(([p]) => p === property)).map(f => ({ offset: f.offset, value: declarations(f.layout).findLast(([p]) => p === property)[1], easing: f.easing }));
    if (!points.length || points[0].offset > 0) points.unshift({ offset: 0, value: base[property], easing: frames.find(f => f.offset === 0)?.easing });
    if (points.at(-1).offset < 1) points.push({ offset: 1, value: base[property] });
    const intervals = points.slice(0, -1).map((from, i) => {
      const to = points[i + 1];
      // The easings that may ease this interval: its start keyframe's (or the box's), and — browsers differ here
      // (measured: Chromium uses the easing of a keyframe that does not set the property, Firefox and WebKit do not) —
      // that of any keyframe inside it that does not set the property, and the box's own.
      const candidates = [...new Set([from.easing ?? easing, easing, ...frames.filter(f => f.easing && f.offset >= from.offset && f.offset < to.offset && !declarations(f.layout).some(([p]) => p === property)).map(f => f.easing)])];
      return { from, to, candidates, moves: String(from.value) !== String(to.value) };
    });
    return { property, intervals };
  });
  const extra = [];
  const shape = t => t.intervals.map(i => `${i.from.offset}-${i.to.offset}:${i.candidates.join('|')}`).join(',');
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
          if (!a || !b || (a.unit && b.unit && a.unit !== b.unit)) return { unknown: `the easing ${text} carries ${t.property} past its keyframes between ${percent(from.offset)} and ${percent(to.offset)}, and ${!a ? i.from.value ?? 'its own value' : !b ? i.to.value ?? 'its own value' : `${i.from.value} and ${i.to.value}`} ${!a || !b ? 'is not a length' : 'are in different units'} to extrapolate` };
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
