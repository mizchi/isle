// A font-size's physical size under page zoom. Zoom z shrinks the viewport in CSS px to W/z (and H/z) and draws a CSS
// px as z device px, so a size f(W, H) shows as z·f(W/z, H/z): px and rem grow with z, vw/vh do not. Text that does
// not reach twice its size at 200% zoom fails SC 1.4.4 (Resize Text) unless something else resizes it.
// Evaluates px, rem, vw/vh/vmin/vmax (and s/l/d variants), calc() with + − × ÷, min(), max() and clamp().
// em and % depend on the parent's size (not evaluated here): null.
export function viewportFont(text, rootFontSize = 16) {
  const src = String(text).trim().toLowerCase();
  if (!/(?:^|[\d.])[sld]?v(?:w|h|min|max)\b/.test(src)) return null; // no viewport unit: grows with zoom
  if (/\d(?:em|%|ex|ch|cap|ic|lh)\b|%/.test(src.replace(/rem\b/g, ''))) return null;
  let i = 0;
  const peek = () => src[i], skip = () => { while (/\s/.test(src[i] ?? '')) i++; };
  const fail = () => { throw new Error(`unsupported font-size ${text}`); };
  function primary() {
    skip();
    const fn = /^(calc|min|max|clamp)\(/.exec(src.slice(i));
    if (fn) { i += fn[0].length; const args = [sum()]; skip(); while (peek() === ',') { i++; args.push(sum()); skip(); } if (peek() !== ')') fail(); i++;
      const name = fn[1];
      if (name === 'calc') { if (args.length !== 1) fail(); return args[0]; }
      if (name === 'min') return (w, h) => Math.min(...args.map(a => a(w, h)));
      if (name === 'max') return (w, h) => Math.max(...args.map(a => a(w, h)));
      if (args.length !== 3) fail(); return (w, h) => Math.min(Math.max(args[0](w, h), args[1](w, h)), args[2](w, h)); }
    if (peek() === '(') { i++; const v = sum(); skip(); if (peek() !== ')') fail(); i++; return v; }
    const m = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|[sld]?vw|[sld]?vh|[sld]?vmin|[sld]?vmax)?/.exec(src.slice(i));
    if (!m) fail(); i += m[0].length;
    const n = Number(m[1]), unit = (m[2] ?? '').replace(/^[sld]/, '');
    if (unit === 'px') return () => n; if (unit === 'rem') return () => n * rootFontSize;
    if (unit === 'vw') return w => n * w / 100; if (unit === 'vh') return (w, h) => n * h / 100;
    if (unit === 'vmin') return (w, h) => n * Math.min(w, h) / 100; if (unit === 'vmax') return (w, h) => n * Math.max(w, h) / 100;
    return () => n; // a plain number (a factor)
  }
  function product() { let v = primary(); skip(); while (peek() === '*' || peek() === '/') { const op = src[i++]; const r = primary(); const l = v; v = op === '*' ? (w, h) => l(w, h) * r(w, h) : (w, h) => l(w, h) / r(w, h); skip(); } return v; }
  function sum() { let v = product(); skip(); while ((peek() === '+' || peek() === '-') && /\s/.test(src[i + 1] ?? '')) { const op = src[i++]; const r = product(); const l = v; v = op === '+' ? (w, h) => l(w, h) + r(w, h) : (w, h) => l(w, h) - r(w, h); skip(); } return v; }
  try { const f = sum(); skip(); if (i !== src.length) fail(); return f; } catch { return undefined; }
}

/** The viewport widths (integer px, [min, max]) at height h where 200% zoom shows the text below twice its size. */
export function zoomShortfall(f, { min, max }, h) {
  const out = []; let start = null;
  for (let w = Math.ceil(min); w <= Math.floor(max); w++) {
    const short = 2 * f(w / 2, h / 2) < 2 * f(w, h) - 1e-6; // z·f(W/z) < 2·f(W) at z = 2
    if (short && start === null) start = w;
    if (!short && start !== null) { out.push([start, w - 1]); start = null; }
  }
  if (start !== null) out.push([start, Math.floor(max)]);
  return out;
}
