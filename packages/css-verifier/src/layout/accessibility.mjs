// Static checks that combine DOM facts (roles, names, aria-hidden, tree and
// paint order) with the cascade (color, visibility, pointer-events, opacity,
// display) and the proved symbolic geometry. Opt-in through
// `options.accessibility`. Each rule is decided over the whole viewport
// domain; what the model cannot decide is Unknown, never a guessed pass.
//
//   accessible-name  → E_A11Y_NAME              button/link with no rendered text and no name attribute
//   text-contrast    → E_A11Y_CONTRAST          WCAG 2.2 SC 1.4.3 (AA) or 1.4.6 (AAA)
//   occluded-target  → E_A11Y_OCCLUDED          a box painted later, hit-testable, covers part of a target
//   target-overlap   → E_A11Y_TARGET_OVERLAP    two interactive targets intersect
//   visual-order     → W_A11Y_ORDER             a later sibling is placed visually before an earlier one (SC 1.3.2)
//   hidden-focusable → E_A11Y_HIDDEN_FOCUSABLE  a rendered focusable element inside aria-hidden
import { exact, number } from './linear.mjs';
import { scalar, sum, diff, times, sample, clip } from './region.mjs';
import { q } from './linear.mjs';
import { intersect } from './integrity.mjs';

export const accessibilityRules = ['accessible-name', 'text-contrast', 'occluded-target', 'target-overlap', 'visual-order', 'hidden-focusable'];

// --- colors (CSS Color 4 subset) ------------------------------------------
const named = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', aqua: '#00ffff',
  magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000', olive: '#808000', lime: '#00ff00',
  teal: '#008080', navy: '#000080', purple: '#800080', orange: '#ffa500', darkgray: '#a9a9a9', darkgrey: '#a9a9a9', lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3', dimgray: '#696969', dimgrey: '#696969', gainsboro: '#dcdcdc', whitesmoke: '#f5f5f5', darkblue: '#00008b', darkred: '#8b0000',
  darkgreen: '#006400', rebeccapurple: '#663399', brown: '#a52a2a', pink: '#ffc0cb', gold: '#ffd700', indigo: '#4b0082', crimson: '#dc143c',
  // System colors in the default light color scheme (color-scheme is not modeled).
  canvas: '#ffffff', canvastext: '#000000',
};
const channel = (value, max) => value.endsWith('%') ? Number(value.slice(0, -1)) / 100 * max : Number(value);
const alphaOf = value => value === undefined ? 1 : value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value);
function hsl(h, s, l) {
  const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
/** {r, g, b (0–255), a (0–1)} or null when the value is not a modeled color. */
export function parseColor(value) {
  value = String(value).trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (named[value]) value = named[value];
  let m = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(value);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
    const n = i => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^(rgba?|hsla?)\((.*)\)$/.exec(value);
  if (!m) return null;
  const parts = m[2].includes(',') ? m[2].split(',').map(p => p.trim()) : m[2].replace(/\s*\/\s*/, ' / ').split(/\s+/).filter(p => p !== '/');
  if (parts.length < 3 || parts.length > 4 || parts.some(p => !/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:%|deg)?$/.test(p))) return null;
  const a = Math.min(1, Math.max(0, alphaOf(parts[3])));
  if (m[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map(p => Math.min(255, Math.max(0, channel(p, 255))));
    return { r, g, b, a };
  }
  const [r, g, b] = hsl(((parseFloat(parts[0]) % 360) + 360) % 360, channel(parts[1], 1), channel(parts[2], 1));
  return { r, g, b, a };
}
const over = (top, bottom) => {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = key => (top[key] * top.a + bottom[key] * bottom.a * (1 - top.a)) / a;
  return { r: mix('r'), g: mix('g'), b: mix('b'), a };
};
const luminance = ({ r, g, b }) => {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export const contrastRatio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** The paint facts of one computed style, kept on each geometry row. */
export function paintFacts(style) {
  return { color: style.color, backgroundColor: style['background-color'], backgroundImage: style['background-image'], opacity: style.opacity,
    visibility: style.visibility, pointerEvents: style['pointer-events'], fontSize: style['font-size'], fontWeight: style['font-weight'], position: style.position };
}
const opaqueValue = value => { const m = /^(\d+(?:\.\d+)?|\.\d+)(%?)$/.exec(String(value)); return m && (m[2] ? Number(m[1]) / 100 : Number(m[1])) >= 1; };
/**
 * The text color and its backdrop for a text row: ancestors' backgrounds,
 * innermost first, until an opaque one, over the canvas. Returns
 * {fg, bg, layers} or {unknown} with the reason.
 */
function backdrop(chain) {
  const self = chain.at(-1);
  for (const layer of chain) if (!opaqueValue(layer.opacity)) return { unknown: `opacity ${layer.opacity} blends the text with what lies behind it` };
  const fg = parseColor(self.color);
  if (!fg) return { unknown: `color ${self.color} is not a modeled color` };
  const layers = [];
  let bg = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const layer = chain[i];
    if (layer.backgroundImage !== 'none') return { unknown: `background-image ${layer.backgroundImage} lies behind the text` };
    const value = String(layer.backgroundColor).toLowerCase() === 'currentcolor' ? layer.color : layer.backgroundColor;
    const color = parseColor(value);
    if (!color) return { unknown: `background-color ${layer.backgroundColor} is not a modeled color` };
    if (color.a > 0) layers.push({ index: i, color });
    if (color.a >= 1) { bg = color; break; }
  }
  // Composite translucent layers bottom-up over the opaque one (or the canvas).
  let base = bg ?? parseColor('canvas');
  for (const layer of layers.slice(0, bg ? -1 : undefined).reverse()) base = over(layer.color, base);
  return { fg: over(fg, base), bg: base, opaqueAt: bg ? layers.at(-1).index : -1 };
}
const px = value => { const m = /^(\d+(?:\.\d+)?)px$/.exec(String(value)); return m ? Number(m[1]) : undefined; };
const weight = value => value === 'bold' ? 700 : /^\d+$/.test(String(value)) ? Number(value) : 400;
// Large text: at least 18pt (24px), or 14pt (56/3 px) bold. An unknown size is not large (the stricter ratio).
const large = facts => { const size = px(facts.fontSize); return size !== undefined && (size >= 24 || (size >= 56 / 3 && weight(facts.fontWeight) >= 700)); };

// --- tree order and regions -----------------------------------------------
const segments = path => path.split('/');
const isAncestor = (a, b) => b.startsWith(a + '/');
const related = (a, b) => a === b || isAncestor(a, b) || isAncestor(b, a);
/** Pre-order tree comparison of two paths. */
function treeOrder(a, b) {
  const x = segments(a), y = segments(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return (Number(x[i]) || 0) - (Number(y[i]) || 0);
  return x.length - y.length;
}
const negate = constraint => ({ slack: times(constraint.slack, q(-1)), strict: !constraint.strict });
/** region \ cut, as convex pieces. */
function subtract(region, cut) {
  if (!intersect(region, cut)) return [region];
  const pieces = [];
  let rest = region;
  for (const constraint of cut.constraints) {
    const outside = negate(constraint), piece = rest && clip(rest, outside.slack, outside.strict);
    if (piece) pieces.push(piece);
    rest = rest && clip(rest, constraint.slack, constraint.strict);
    if (!rest) break;
  }
  return pieces;
}
const right = row => sum(row.origin.inline, row.inline), bottom = row => sum(row.origin.block, row.block);
const below = (region, value, limit) => region && clip(region, diff(limit, value), true); // value < limit
const atMost = (region, value, limit) => region && clip(region, diff(limit, value)); // value <= limit
/** Where the two border boxes overlap (open intervals: touching is not overlapping). */
function overlap(a, b) {
  let region = intersect(a.region, b.region);
  region = below(region, a.origin.inline, right(b)); region = below(region, b.origin.inline, right(a));
  region = below(region, a.origin.block, bottom(b)); region = below(region, b.origin.block, bottom(a));
  return region;
}

export function judgeAccessibility({ geometry }, { contrast = 'AA', ranges, block }) {
  const findings = [], warnings = [], unknowns = [];
  const witness = region => { const p = sample(region); return { viewport: number(p.x), viewportExact: exact(p.x), ...(block ? { viewportHeight: number(p.y), viewportHeightExact: exact(p.y) } : {}) }; };
  const report = (list, code, severity, message, row, region, extra) => list.push({ code, severity, message, box: row.box.label, path: row.path, source: row.box.source, ...ranges(region), witness: witness(region), ...extra });
  const visible = row => row.paint.visibility === 'visible';
  // Interactive: buttons, and links with href (or a dynamic one).
  const interactive = row => row.box.tag === 'button' || (row.box.tag === 'a' && row.box.focusable !== false);
  const placed = geometry.filter(row => row.origin && row.block);
  const boxes = new Map(geometry.map(row => [row.path, row.box]));
  const hiddenFrom = path => { for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') if (boxes.get(p)?.ariaHidden) return true; return false; };

  // accessible-name: no name attribute, and no visible text rendered inside.
  // Hidden targets (visibility, or aria-hidden content) are not exposed and need no name.
  for (const target of geometry.filter(row => interactive(row) && visible(row) && row.box.named !== true && !hiddenFrom(row.path))) {
    const texts = geometry.filter(row => row.box.text && visible(row) && (row.path === target.path || isAncestor(target.path, row.path)));
    let missing = [target.region];
    for (const text of texts) missing = missing.flatMap(region => subtract(region, text.region));
    // A dynamic name attribute may be empty: Unknown where no text names the target.
    if (target.box.named === 'dynamic') { for (const region of missing) report(unknowns, 'U_A11Y_NAME', 'unknown', `${target.box.label} is named only by a dynamic attribute, which may be empty`, target, region, { rule: 'accessible-name' }); continue; }
    for (const region of missing) report(findings, 'E_A11Y_NAME', 'error', `${target.box.label} has no accessible name here: no rendered text and no aria-label, aria-labelledby or title`, target, region, { rule: 'accessible-name' });
  }

  // text-contrast over the DOM ancestors' backgrounds.
  const [normal, big] = contrast === 'AAA' ? [7, 4.5] : [4.5, 3];
  const painted = placed.filter(row => row.painted && visible(row));
  for (const text of geometry.filter(row => row.box.text && visible(row))) {
    const result = backdrop(text.chain);
    if (result.unknown) { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${text.box.label}: ${result.unknown}`, text, text.region, { rule: 'text-contrast' }); continue; }
    // A positioned box above the opaque backdrop lets other boxes show through behind the text.
    const positionedAbove = text.chain.slice(result.opaqueAt + 1).some(layer => layer.position !== 'static');
    if (positionedAbove) {
      const others = painted.filter(row => !related(row.path, text.path) && text.origin && text.block && overlap(text, row));
      if (!text.origin || others.length) { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${text.box.label} is positioned without an opaque background of its own; the boxes behind it are not its ancestors`, text, text.region, { rule: 'text-contrast' }); continue; }
    }
    const ratio = contrastRatio(result.fg, result.bg), required = large(text.chain.at(-1)) ? big : normal;
    if (ratio < required) report(findings, 'E_A11Y_CONTRAST', 'error', `${text.box.label} has contrast ${ratio.toFixed(2)}:1, below ${required}:1`, text, text.region,
      { rule: 'text-contrast', ratio, required, foreground: result.fg, background: result.bg });
  }

  // occluded-target: a hit-testable box from a later paint layer covers a target.
  const layer = row => { for (let p = row.path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const r = geometry.find(g => g.path === p); if (r && r.position !== 'static') return p; } return null; };
  const targets = placed.filter(row => interactive(row) && visible(row));
  for (const target of targets) {
    const own = layer(target);
    for (const cover of placed) {
      if (related(cover.path, target.path) || !visible(cover) || cover.paint.pointerEvents === 'none') continue;
      const above = layer(cover);
      // Positioned layers paint after in-flow content, and among themselves in tree order (z-index is not modeled).
      if (!above || (own && (isAncestor(above, own) || above === own || treeOrder(above, own) < 0))) continue;
      const region = overlap(target, cover);
      if (region) { report(findings, 'E_A11Y_OCCLUDED', 'error', `${target.box.label} is covered by ${cover.box.label}, which is painted later and receives the pointer`, target, region, { rule: 'occluded-target', cover: cover.path }); break; }
    }
  }

  // target-overlap: two interactive targets intersect.
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i], b = targets[j];
    if (related(a.path, b.path)) continue;
    const region = overlap(a, b);
    if (region) report(findings, 'E_A11Y_TARGET_OVERLAP', 'error', `${a.box.label} and ${b.box.label} overlap`, a, region, { rule: 'target-overlap', other: b.path });
  }

  // visual-order: siblings in flow, b after a in the DOM but entirely above a, or beside it on its left.
  const parent = path => path.slice(0, path.lastIndexOf('/'));
  const flow = placed.filter(row => row.position === 'static' && row.path.includes('/'));
  for (const a of flow) for (const b of flow) {
    if (parent(a.path) !== parent(b.path) || treeOrder(a.path, b.path) >= 0) continue;
    const both = intersect(a.region, b.region);
    if (!both) continue;
    const above = atMost(both, bottom(b), a.origin.block);
    let beside = below(below(both, b.origin.block, bottom(a)), a.origin.block, bottom(b));
    beside = atMost(beside, right(b), a.origin.inline);
    for (const region of [above, beside].filter(Boolean)) report(warnings, 'W_A11Y_ORDER', 'warning', `${b.box.label} comes after ${a.box.label} in the DOM but is placed before it`, b, region, { rule: 'visual-order', before: a.path });
  }

  // hidden-focusable: rendered, visible focusable elements under aria-hidden.
  const hidden = path => { let found = false; for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const value = boxes.get(p)?.ariaHidden; if (value === true) return true; if (value) found = 'dynamic'; } return found; };
  for (const row of geometry.filter(row => (row.box.focusable ?? row.box.tag === 'button') && visible(row))) {
    const under = hidden(row.path);
    if (!under) continue;
    if (under === 'dynamic' || row.box.focusable === 'dynamic') report(unknowns, 'U_A11Y_HIDDEN_FOCUSABLE', 'unknown', `${row.box.label}: a dynamic aria-hidden or tabindex decides whether it can take focus inside hidden content`, row, row.region, { rule: 'hidden-focusable' });
    else report(findings, 'E_A11Y_HIDDEN_FOCUSABLE', 'error', `${row.box.label} can take focus inside aria-hidden content`, row, row.region, { rule: 'hidden-focusable' });
  }

  return { findings: dedupe(findings), warnings: dedupe(warnings), unknowns: dedupe(unknowns) };
}

function dedupe(rows) {
  const seen = new Set();
  return rows.filter(row => { const key = JSON.stringify([row.code, row.path, row.other, row.cover, row.before, row.range, row.heightRange]); if (seen.has(key)) return false; seen.add(key); return true; });
}
