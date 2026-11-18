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
const pxValue = v => { const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))px$|^(0)$/.exec(String(v ?? '').trim()); return m ? Number(m[1] ?? 0) : null; };
// Properties whose interpolated value is clamped at zero (CSS Values: negative lengths are invalid there).
const nonNegative = /^(?:width|height|min-width|min-height|max-width|max-height|inline-size|block-size|min-inline-size|min-block-size|max-inline-size|max-block-size|padding(?:-.*)?|border(?:-(?:top|right|bottom|left))?-width|gap|row-gap|column-gap|flex-basis)$/;
const percent = x => `${Math.round(x * 10000) / 100}%`;

export function easedFrames(frames, { easing = 'ease', base = {} } = {}) {
  const layoutFrames = frames.filter(f => f.layout);
  const properties = [...new Set(layoutFrames.flatMap(f => declarations(f.layout).map(([p]) => p)))];
  const extra = [];
  for (const property of properties) {
    const points = frames.filter(f => declarations(f.layout).some(([p]) => p === property)).map(f => ({ offset: f.offset, value: declarations(f.layout).findLast(([p]) => p === property)[1], easing: f.easing }));
    if (!points.length || points[0].offset > 0) points.unshift({ offset: 0, value: base[property], easing: frames.find(f => f.offset === 0)?.easing });
    if (points.at(-1).offset < 1) points.push({ offset: 1, value: base[property] });
    for (let i = 0; i + 1 < points.length; i++) {
      const [from, to] = [points[i], points[i + 1]];
      if (String(from.value) === String(to.value)) continue;
      // The easings that may ease this interval: its start keyframe's (or the box's), and — browsers differ here
      // (measured: Chromium uses the easing of a keyframe that does not set the property, Firefox and WebKit do not) —
      // that of any keyframe inside it that does not set the property, and the box's own.
      const candidates = [...new Set([from.easing ?? easing, easing, ...frames.filter(f => f.easing && f.offset >= from.offset && f.offset < to.offset && !declarations(f.layout).some(([p]) => p === property)).map(f => f.easing)])];
      for (const text of candidates) {
      const range = easingRange(text);
      if (!range) return { unknown: `the easing ${text} of ${property} between ${percent(from.offset)} and ${percent(to.offset)} is not modeled` };
      if (!range.extremes.length) continue;
      const [v0, v1] = [pxValue(from.value), pxValue(to.value)];
      if (v0 === null || v1 === null) return { unknown: `the easing ${text} carries ${property} past its keyframes between ${percent(from.offset)} and ${percent(to.offset)}, and ${v0 === null ? from.value ?? 'its own value' : to.value} is not a px length to extrapolate` };
      if (properties.length > 1) return { unknown: `the easing ${text} carries ${property} past its keyframes while ${properties.filter(p => p !== property).join(', ')} also change${properties.length > 2 ? '' : 's'}: their extremes together are not modeled` };
      for (const e of range.extremes) {
        const y = Number(e.kind === 'max' ? e.high : e.low);
        let value = v0 + (v1 - v0) * y;
        if (nonNegative.test(property)) value = Math.max(0, value);
        // Rounded outward: away from the nearer keyframe value, so the frame is at least as far as the browser goes.
        const away = value >= Math.max(v0, v1) ? 1 : value <= Math.min(v0, v1) ? -1 : (e.kind === 'max') === (v1 >= v0) ? 1 : -1;
        const rounded = (away > 0 ? Math.ceil(value * 1e4) : Math.floor(value * 1e4)) / 1e4;
        extra.push({ offset: from.offset + (to.offset - from.offset) * e.at, layout: `${property}:${rounded}px`, extreme: { property, y, from: percent(from.offset), to: percent(to.offset), easing: text, value: rounded } });
      }
      }
    }
  }
  return { frames: [...layoutFrames, ...extra].sort((a, b) => a.offset - b.offset) };
}
