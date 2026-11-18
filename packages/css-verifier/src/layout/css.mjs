import postcss from 'postcss';
import {findCSSWriteConflicts,cssWriteConflictMessage} from '../css-writes.mjs';
import { q, cmp, add, mul, div, exact, number } from './linear.mjs';
import { parseCondition, preferenceValues } from './conditions.mjs';
import { supportsCondition } from './supports.mjs';
import { flattenNesting } from './nesting.mjs';
import {customName,variableValue,variableEnvironment,substituteDeclaration} from './variables.mjs';

import { compileSelector, matches, greaterRank, scopeProximity } from './selectors.mjs';
export { matches, simpleSelector } from './selectors.mjs';
const pointSize = /^(?:\d+(?:\.\d{1,6})?px|0)$/;
const remLengths = ['top', 'right', 'bottom', 'left'].flatMap(side => [`margin-${side}`, `padding-${side}`, side]).concat(['inline-size', 'block-size', 'min-inline-size', 'max-inline-size', 'min-block-size', 'max-block-size', 'row-gap', 'column-gap', 'flex-basis', 'font-size']);
// rem resolves against the analysed html root's px font-size once the engine has seen it (setRootFontSize).
let rootFontSize = null;
export function setRootFontSize(size) { rootFontSize = size; }
// The form-control UA profile of the analysis (layout option ua), or null for the historical Chromium defaults.
let uaProfile = null;
export function setUAProfile(profile) { uaProfile = profile; }
// @property registrations (name → {inherits, initial, syntax}), set by the analysis from the parsed sheets.
let registeredProperties = new Map();
export function setRegisteredProperties(registry) { registeredProperties = registry ?? new Map(); }
// The transitions of a computed style: one per transition-property entry, the other lists repeated to it.
export function transitionsOf(style) {
  const list = key => postcss.list.comma(String(style[key] ?? ''));
  const names = list('transition-property'), at = (key, i, fallback) => { const l = list(key); return l.length ? l[i % l.length] : fallback; };
  return names.map((property, i) => ({ property, duration: at('transition-duration', i, '0s'), easing: at('transition-timing-function', i, 'ease'), delay: at('transition-delay', i, '0s') })).filter(t => t.property !== 'none');
}
// The animations of a computed style: one per animation-name entry (none included, so indices match), each longhand
// list repeated to that length (CSS Animations 1 §4).
export function animationsOf(style) {
  const list = key => postcss.list.comma(String(style[key] ?? ''));
  const names = list('animation-name'), at = (key, i, fallback) => { const l = list(key); return l.length ? l[i % l.length] : fallback; };
  return names.map((name, i) => ({ name, duration: at('animation-duration', i, '0s'), count: at('animation-iteration-count', i, '1'), playState: at('animation-play-state', i, 'running'), direction: at('animation-direction', i, 'normal'), easing: at('animation-timing-function', i, 'ease'), delay: at('animation-delay', i, '0s'), fill: at('animation-fill-mode', i, 'none'), timeline: at('animation-timeline', i, 'auto') })).filter(a => a.name !== 'none');
}
// Typed syntaxes accepted, with the literal values whose computed value is the value itself (no em, var() or calc():
// those compute where they are declared, which the unregistered substitution does not model).
const typedValue = { '<length>': /^(?:0|-?\d*\.?\d+px)$/, '<number>': /^-?\d*\.?\d+$/, '<integer>': /^-?\d+$/, '<percentage>': /^-?\d*\.?\d+%$/, '<length-percentage>': /^(?:0|-?\d*\.?\d+(?:px|%))$/, '<color>': /^#[0-9a-f]{3,8}$/i };
export const registeredValueProblem = (name, text) => { const r = registeredProperties.get(name); if (!r || r.syntax === '*') return null; const v = String(text).trim(); return typedValue[r.syntax].test(v) || ['initial', 'inherit', 'unset', 'revert'].includes(v.toLowerCase()) ? null : `${name} is registered as ${r.syntax}; its value ${v} is not a literal that computes to itself, which is not modeled`; };
// Parse-time check of a px or rem length; rem resolves at layout time, against the html root (else Unknown).
// env(safe-area-inset-*) (optionally with a px fallback, or as max(px, env(…))) resolves at layout time against the
// declared safe area (setSafeArea; 0 without viewport-fit=cover, as browsers report).
const envPattern = /^env\(\s*safe-area-inset-(top|right|bottom|left)\s*(?:,\s*(\d+(?:\.\d{1,6})?px|0)\s*)?\)$/;
const maxEnv = /^max\(\s*(\d+(?:\.\d{1,6})?px|0)\s*,\s*(env\([^()]*\))\s*\)$/;
let safeArea = null;
export function setSafeArea(area) { safeArea = area; }
// em (checklist D2) also resolves later, against the element's font-size (computeStyle); else it is Unknown where used.
const pxSyntax = text => { if (!/^\d+(?:\.\d{1,6})?r?em$/.test(text) && !envPattern.test(text) && !maxEnv.test(text)) px(text); };
export function px(text) {
  const env = envPattern.exec(text ?? ''), envMax = maxEnv.exec(text ?? '');
  if (envMax) { const a = px(envMax[1]), b = px(envMax[2]); return cmp(a, b) >= 0 ? a : b; }
  if (env) {
    if (safeArea === 'unknown') throw new Error(`${text}: viewport-fit=cover lets the page under the device's safe area; declare the safeArea option`);
    return q(String(safeArea?.[env[1]] ?? 0));
  }
  const rem = /^(\d+(?:\.\d{1,6})?)rem$/.exec(text ?? '');
  if (rem && rootFontSize) return mul(q(rem[1]), rootFontSize);
  if (!pointSize.test(text)) throw new Error(`Unsupported CSS pixel length: ${text}`);
  return q(text.replace(/px$/, ''));
}

const aliases = { width: 'inline-size', 'min-width': 'min-inline-size', 'max-width': 'max-inline-size', height: 'block-size', 'min-height': 'min-block-size', 'max-height': 'max-block-size' };
const insets = { 'inset-inline-start':'left', 'inset-inline-end':'right', 'inset-block-start':'top', 'inset-block-end':'bottom' };
const geometry = new Set(['aspect-ratio', 'display', 'appearance', 'box-sizing', 'inline-size', 'min-inline-size', 'max-inline-size', 'column-gap', 'grid-template-columns', 'grid-template-areas', 'grid-column', 'grid-row', 'overflow-x', 'overflow-y', 'scrollbar-gutter', 'scrollbar-width', 'white-space', 'overflow-wrap', 'float', 'position', 'writing-mode', 'direction', 'block-size', 'min-block-size', 'max-block-size', 'row-gap', 'grid-template-rows', 'grid-auto-rows', 'grid-auto-flow', 'container-type', 'container-name', 'align-items', 'align-self', 'align-content', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'justify-content', 'order']);
// Text/font metrics come from trusted caller contracts. Paint is not validated.
// revert-layer (checklist C4) passes through every property like the other CSS-wide keywords; the cascade resolves it.
const wide = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const decoration = /^(?:background-(?:position|size|repeat|clip|origin|attachment)|border-radius|text-shadow|text-decoration-(?:color|style|thickness)|text-underline-offset|transition-behavior|list-style-(?:position|image))$/;
// Properties a :hover/:focus rule may set: they repaint (or restack) without changing geometry.
const statePaint = /^(?:z-index|color|clip|clip-path|background(?:-.*)?|border-(?:(?:top|right|bottom|left)-)?color|border-radius|outline(?:-.*)?|box-shadow|text-shadow|text-decoration(?:-.*)?|text-underline-offset|cursor|opacity|visibility|pointer-events|animation(?:-.*)?|transition(?:-.*)?|color-scheme)$/;
// Paint and hit-testing facts for the accessibility rules (never geometry).
// An element that is the containing block of its fixed (and absolute) descendants: a transform, a backdrop filter, or
// will-change naming a property that would make one.
export const containsFixed = style => Boolean(style) && ((style.transform ?? 'none') !== 'none' || (style['backdrop-filter'] ?? 'none') !== 'none' || /(?:^|,\s*)(?:transform|translate|rotate|scale|filter|backdrop-filter|perspective)(?:\s*,|$)/.test(style['will-change'] ?? 'auto'));
export const paintProperties = ['hyphens', 'object-fit', 'scroll-behavior', 'overscroll-behavior-x', 'overscroll-behavior-y', 'scroll-snap-type', 'scroll-snap-align', 'resize', 'text-wrap-mode', 'text-wrap-style', 'text-overflow', 'line-clamp', 'box-orient', 'touch-action', 'color', 'visibility', 'pointer-events', 'opacity', 'text-decoration-line', 'outline-style', 'outline-width', 'outline-color', 'outline-offset', 'box-shadow', 'cursor', 'list-style-type', 'animation-name', 'animation-duration', 'animation-iteration-count', 'animation-play-state', 'animation-direction', 'animation-timing-function', 'animation-delay', 'animation-fill-mode', 'animation-timeline', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay', 'color-scheme', 'z-index', 'isolation', 'transform', 'transform-origin', 'translate', 'rotate', 'scale', 'backdrop-filter', 'will-change', 'justify-self', 'justify-items', 'fill', 'stroke', 'list-style-position', 'caret-color', 'content-visibility', 'contain-intrinsic-block-size'];
const inheritedPaint = ['color', 'fill', 'stroke', 'list-style-position', 'caret-color', 'visibility', 'pointer-events', 'cursor', 'list-style-type', 'color-scheme', 'text-wrap-style', 'text-wrap-mode'];
// Inherited text properties. They are kept as specified strings and only
// interpreted for boxes whose contract derives text metrics from a font.
export const textProperties = ['font-family', 'font-size', 'line-height', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'text-transform', 'letter-spacing', 'word-spacing', 'text-align'];
const textPropertySet = new Set(textProperties);
/** Marker for longhands set by the `font` shorthand, which is not modeled. */
export const fontShorthand = 'font-shorthand';
// A CSS string literal's value (escapes: \\hex and \\char).
const cssString = literal => literal.slice(1, -1).replace(/\\([\da-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) => hex ? String.fromCodePoint(parseInt(hex, 16)) : ch);
// Checklist B2: an arbitrary rotation composed with other transforms, as floats. Each map is the 14 numbers of an
// affine(...) (A, then the offsets t, W·u, H·w, em·e, rem·r); a rotation by any angle is cos/sin. The result is
// linear-any(...), which the analysis bounds by its circumscribed rectangle (accessibility checks only). em and rem
// offsets are not modeled there.
const floatMap = m => {
  const text = String(m);
  const rot = /^rotate-any\((-?[\d.]+)\)$/.exec(text);
  if (rot) { const r = Number(rot[1]) * Math.PI / 180; return [Math.cos(r), -Math.sin(r), Math.sin(r), Math.cos(r), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; }
  const aff = /^(?:affine|linear-any)\((.+)\)$/.exec(text);
  return aff[1].split(' ').map(x => { const [n, d = '1'] = x.split('/'); return Number(n) / Number(d); });
};
const composeFloat = (P, T) => {
  const [a, b, c, d] = P, lin = (x, y) => [a * x + b * y, c * x + d * y];
  const A = [a * T[0] + b * T[2], a * T[1] + b * T[3], c * T[0] + d * T[2], c * T[1] + d * T[3]];
  return [...A, ...[4, 6, 8, 10, 12].flatMap(i => { const [x, y] = lin(T[i], T[i + 1]); return [x + P[i], y + P[i + 1]]; })];
};
const linearAny = (maps, value) => {
  const m = maps.map(floatMap).reduce(composeFloat);
  if (m.slice(10).some(v => Math.abs(v) > 1e-12)) throw new Error(`Unsupported transform: ${value} (an em or rem translation with a rotation by an angle that is not a quarter turn is not modeled)`);
  return `linear-any(${m.map(v => { const t = (Math.round(v * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, ''); return t === '-0' || t === '' ? '0' : t; }).join(' ')})`;
};
function expand(property, value) {
  property = aliases[property] ?? property;
  property = insets[property] ?? property;
  // Area names are case-sensitive identifiers.
  if (!['container', 'container-name', 'content', 'grid-template-areas', 'grid-area'].includes(property) && !(['grid-row', 'grid-column'].includes(property) && /^-?[A-Za-z_][\w-]*$/.test(value.trim()))) value = value.toLowerCase();
  if (property === 'container-name' && value.toLowerCase() === 'none') value = 'none';
  // white-space also writes text-wrap-mode (CSS Text 4); its mark says white-space itself decides after substitution.
  if (property === 'white-space') return [['white-space', value], ['text-wrap-mode', 'white-space']];
  // aspect-ratio: auto, a ratio (w / h, or one number), or both (auto w / h): normalized to 'auto', 'w/h' or 'auto w/h'.
  if (property === 'aspect-ratio') {
    if (wide.has(value) || value === 'auto') return [[property, value]];
    const m = /^(auto\s+)?(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?(\s+auto)?$/.exec(value);
    if (!m || (m[1] && m[4]) || Number(m[2]) <= 0 || (m[3] !== undefined && Number(m[3]) <= 0)) throw new Error(`Unsupported aspect-ratio: ${value}`);
    return [[property, `${m[1] || m[4] ? 'auto ' : ''}${m[2]}/${m[3] ?? '1'}`]];
  }
  if (geometry.has(property)) return [[property, value]];
  if (['left','right','top','bottom'].includes(property)) return [[property,value]];
  if (['inset','inset-inline','inset-block'].includes(property)) {
    const p = postcss.list.space(value), max = property === 'inset' ? 4 : 2;
    if (!p.length || p.length > max) throw new Error('Unsupported inset shorthand');
    if (property === 'inset') return [['top',p[0]],['right',p[1] ?? p[0]],['bottom',p[2] ?? p[0]],['left',p[3] ?? p[1] ?? p[0]]];
    return property === 'inset-inline' ? [['left',p[0]],['right',p[1] ?? p[0]]] : [['top',p[0]],['bottom',p[1] ?? p[0]]];
  }
  // scroll-margin / scroll-padding: they move where the page scrolls a focused or targeted element, never the layout.
  // Only px lengths (and auto for scroll-padding) are modeled; the vertical sides feed the accessibility scroll rules.
  property = property.replace(/^(scroll-(?:margin|padding))-block-(start|end)$/, (_, family, edge) => `${family}-${edge === 'start' ? 'top' : 'bottom'}`);
  const scrollFamily = /^scroll-(margin|padding)(?:-(top|right|bottom|left|block|inline))?$/.exec(property);
  if (scrollFamily) {
    const [, kind, side] = scrollFamily, parts = postcss.list.space(value);
    const length = part => wide.has(part) || /^-?(?:\d+(?:\.\d+)?|\.\d+)px$/.test(part) || part === '0' || (kind === 'padding' && part === 'auto');
    if (!parts.length || !parts.every(length) || (wide.has(value) && parts.length !== 1)) throw new Error(`Unsupported ${property}: ${value}`);
    const name = s => `scroll-${kind}-${s}`;
    if (!side) { if (parts.length > 4) throw new Error(`Unsupported ${property}: ${value}`); return [[name('top'), parts[0]], [name('right'), parts[1] ?? parts[0]], [name('bottom'), parts[2] ?? parts[0]], [name('left'), parts[3] ?? parts[1] ?? parts[0]]]; }
    if (side === 'block' || side === 'inline') { if (parts.length > 2) throw new Error(`Unsupported ${property}: ${value}`); const [a, b] = side === 'block' ? ['top', 'bottom'] : ['left', 'right']; return [[name(a), parts[0]], [name(b), parts[1] ?? parts[0]]]; }
    if (parts.length !== 1) throw new Error(`Unsupported ${property}: ${value}`);
    return [[property, value]];
  }
  // clip / clip-path: only "everything clipped away" (the visually-hidden pattern) and no clipping are modeled; a partial
  // clip changes what is visible in ways the rules do not follow.
  if (property === 'clip') {
    if (wide.has(value) || value === 'auto') return [[property, value]];
    const m = /^rect\(\s*([^,\s]+)[\s,]+([^,\s]+)[\s,]+([^,\s]+)[\s,]+([^,\s)]+)\s*\)$/.exec(value);
    const n = v => v === '0' ? 0 : /^-?\d+(?:\.\d+)?px$/.test(v) ? parseFloat(v) : NaN;
    if (!m || m.slice(1).some(v => Number.isNaN(n(v)))) throw new Error(`Unsupported clip: ${value}`);
    const [top, right, bottom, left] = m.slice(1).map(n);
    if (bottom > top && right > left) throw new Error(`Unsupported clip: ${value} (only an empty rect is modeled)`);
    return [[property, 'empty']];
  }
  if (property === 'clip-path') {
    if (wide.has(value) || value === 'none') return [[property, value]];
    const m = /^inset\(\s*(\d+(?:\.\d+)?)%\s*\)$/.exec(value);
    if (!m || Number(m[1]) < 50) throw new Error(`Unsupported clip-path: ${value} (only inset(50%) or more is modeled)`);
    return [[property, 'empty']];
  }
  if (property==='scrollbar-color') return [];
  if (property === 'all') {
    if (!wide.has(value)) throw new Error('Unsupported all reset');
    return [...geometry, ...textProperties, ...paintProperties, 'background-color', 'background-image', ...['left', 'right', 'top', 'bottom'].flatMap(side => [side, `padding-${side}`, `margin-${side}`, `border-${side}`])].filter(key => key !== 'direction').map(key => [key, value]);
  }
  if (property === 'flex') return flexShorthand(value);
  // grid-area: <name> places the item in the named area of its parent's grid-template-areas (grid.mjs resolves it);
  // a name in grid-row / grid-column is the same area's lines. Line-number forms of grid-area are not modeled.
  if (property === 'grid-area') {
    if (wide.has(value)) return [['grid-row', value], ['grid-column', value]];
    const v = value.trim();
    if (v === 'auto') return [['grid-row', 'auto'], ['grid-column', 'auto']];
    if (/^-?[A-Za-z_][\w-]*$/.test(v) && !/^span$/i.test(v)) return [['grid-row', `area:${v}`], ['grid-column', `area:${v}`]];
    throw new Error(`Unsupported grid-area: ${value} (only a named area or auto is modeled)`);
  }
  if ((property === 'grid-row' || property === 'grid-column') && /^-?[A-Za-z_][\w-]*$/.test(value.trim()) && !['auto', 'span', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(value.trim())) return [[property, `area:${value.trim()}`]];
  if (property === 'grid-template-areas') {
    if (wide.has(value) || value.trim() === 'none') return [[property, value.trim()]];
    const rows = [...value.matchAll(/"([^"]*)"|'([^']*)'/g)].map(m => (m[1] ?? m[2]).trim());
    if (!rows.length || value.replace(/"[^"]*"|'[^']*'/g, '').trim()) throw new Error(`Unsupported grid-template-areas: ${value}`);
    return [[property, rows.map(r => r.split(/\s+/).join(' ')).join('|')]];
  }
  if (property === 'flex-flow') {
    if (wide.has(value)) return [['flex-direction', value], ['flex-wrap', value]];
    const parts = postcss.list.space(value), direction = parts.filter(p => /^(?:row|row-reverse|column|column-reverse)$/.test(p)), wrap = parts.filter(p => /^(?:nowrap|wrap|wrap-reverse)$/.test(p));
    if (!parts.length || parts.length > 2 || direction.length > 1 || wrap.length > 1 || direction.length + wrap.length !== parts.length) throw new Error(`Unsupported flex-flow: ${value}`);
    return [['flex-direction', direction[0] ?? 'row'], ['flex-wrap', wrap[0] ?? 'nowrap']];
  }
  if (property === 'gap' && wide.has(value)) return [['row-gap', value], ['column-gap', value]];
  if (property === 'overflow' && wide.has(value)) return [['overflow-x', value], ['overflow-y', value]];
  // Generated content: none/normal (no box), an empty string, or text (whose box is not modeled).
  if (property === 'content') { if (['none', 'normal'].includes(value)) return [['content', 'none']]; if (/^(?:""|'')$/.test(value)) return [['content', 'empty']]; if (/^(?:"[^"]*"|'[^']*')$/.test(value)) return [['content', `text:${cssString(value)}`]]; throw new Error(`Unsupported content: ${value}`); }
  if (property === 'gap') {
    const parts = postcss.list.space(value); if (parts.length > 2) throw new Error('Unsupported gap');
    parts.forEach(part => { if (part !== 'normal') pxSyntax(part); }); return [['row-gap', parts[0]], ['column-gap', parts.at(-1)]];
  }
  if (property === 'overflow') {
    const parts = postcss.list.space(value); if (parts.length > 2) throw new Error('Unsupported overflow');
    return [['overflow-x', parts[0]], ['overflow-y', parts[1] ?? parts[0]]];
  }
  if (property === 'padding') {
    const p = postcss.list.space(value); if (p.length < 1 || p.length > 4) throw new Error('Unsupported padding');
    if (!wide.has(value)) p.forEach(pxSyntax); return [['padding-top', p[0]], ['padding-right', p[1] ?? p[0]], ['padding-bottom', p[2] ?? p[0]], ['padding-left', p[3] ?? p[1] ?? p[0]]];
  }
  if (property === 'padding-inline' || property === 'padding-block') {
    const p = postcss.list.space(value); if (p.length > 2) throw new Error('Unsupported padding-inline');
    if (!wide.has(value)) p.forEach(pxSyntax); return property === 'padding-inline' ? [['padding-left', p[0]], ['padding-right', p[1] ?? p[0]]] : [['padding-top', p[0]], ['padding-bottom', p[1] ?? p[0]]];
  }
  if (['padding-left', 'padding-right', 'padding-inline-start', 'padding-inline-end', 'padding-top', 'padding-bottom', 'padding-block-start', 'padding-block-end'].includes(property)) {
    if (!wide.has(value)) pxSyntax(value); return [[property.replace('inline-start', 'left').replace('inline-end', 'right').replace('block-start', 'top').replace('block-end', 'bottom'), value]];
  }
  if (/^margin(?:-(?:inline|block|left|right|top|bottom|inline-start|inline-end|block-start|block-end))?$/.test(property)) {
    const sides = property === 'margin' ? ['top', 'right', 'bottom', 'left'] : property === 'margin-inline' ? ['left', 'right'] : property === 'margin-block' ? ['top', 'bottom'] : [property.slice(7).replace('inline-start', 'left').replace('inline-end', 'right').replace('block-start', 'top').replace('block-end', 'bottom')];
    if (wide.has(value)) return sides.map(side => [`margin-${side}`, value]);
    const parts = postcss.list.space(value);
    const maximum = property === 'margin' ? 4 : ['margin-inline', 'margin-block'].includes(property) ? 2 : 1;
    if (!parts.length || parts.length > maximum) throw new Error(`${property} requires 1..${maximum} values`);
    // Zero, or auto (only flex items may use it on their main axis; checked by the engine).
    // Zero, auto, or a non-negative px length (grid items take px margins; checked by the engine).
    // A non-negative rem margin stays rem until computeStyle resolves it against the root font size.
    const margin = v => { if (v === 'auto') return 'auto'; if (/^\d+(?:\.\d{1,6})?r?em$/.test(v)) return /^0+(?:\.0+)?r?em$/.test(v) ? '0' : v; if (/^-\d+(?:\.\d{1,6})?px$/.test(v)) return v; /* a negative px margin: the engine models it on a flex row's main axis only */ const n = px(v); if (cmp(n, q(0)) === 0) return '0'; if (cmp(n, q(0)) < 0) throw new Error('Negative margins are not modeled'); if (!/^\d+(?:\.\d+)?px$/.test(v)) throw new Error('Only px, zero or auto margins are supported'); return v; };
    const values = property === 'margin' ? [parts[0], parts[1] ?? parts[0], parts[2] ?? parts[0], parts[3] ?? parts[1] ?? parts[0]] : sides.length === 2 ? [parts[0], parts[1] ?? parts[0]] : [parts[0]];
    return sides.map((side, i) => [`margin-${side}`, margin(values[i])]);
  }
  if (property === 'border' || property === 'border-inline' || property === 'border-block') {
    const sides = property === 'border' ? ['left', 'right', 'top', 'bottom'] : property === 'border-inline' ? ['left', 'right'] : ['top', 'bottom'];
    // The color is kept as paint (border-<side>-color) for the non-text contrast rules.
    if (wide.has(value)) return sides.flatMap(side => [[`border-${side}`, value], [`border-${side}-color`, value]]);
    const p = postcss.list.space(value);
    if (p.length === 1 && ['0', 'none'].includes(value)) return sides.flatMap(side => [[`border-${side}`, '0'], [`border-${side}-color`, 'currentcolor'], [`$bw-${side}`, '0'], [`$bs-${side}`, 'none']]);
    if (p.length !== 3 || p[1] !== 'solid') throw new Error('Use a pixel solid border with a color');
    if (!/^(?:black|white|red|green|blue|transparent|currentcolor|#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8})$/.test(p[2])) throw new Error('Use a supported literal border color');
    px(p[0]); return sides.flatMap(side => [[`border-${side}`, p[0]], [`border-${side}-color`, p[2]], [`$bw-${side}`, p[0]], [`$bs-${side}`, 'solid']]);
  }
  // border-width / border-style and their side longhands (StyleX writes borders this way): kept as each side's width
  // ($bw-side) and style ($bs-side); computeStyle derives the side's used width from the pair after the cascade (none or
  // hidden: 0), so they combine with the border shorthand (which sets both) in cascade order.
  const fourSides = (p, n) => ({ top: p[0], right: p[1] ?? p[0], bottom: p[2] ?? p[0], left: p[3] ?? p[1] ?? p[0] })[n];
  if (property === 'border-width' || /^border-(?:top|right|bottom|left)-width$/.test(property)) {
    const p = postcss.list.space(value), sides = property === 'border-width' ? ['top', 'right', 'bottom', 'left'] : [property.split('-')[1]];
    if (wide.has(value)) return sides.map(side => [`$bw-${side}`, value]);
    if (!p.length || p.length > (sides.length === 4 ? 4 : 1)) throw new Error(`Unsupported ${property}: ${value}`);
    const width = v => { if (/^0(?:\.0+)?(?:px)?$/.test(v)) return '0'; if (v === 'thin') return '1px'; if (v === 'medium') return '3px'; if (v === 'thick') return '5px'; px(v); return v; };
    return sides.map(side => [`$bw-${side}`, width(sides.length === 4 ? fourSides(p, side) : p[0])]);
  }
  if (property === 'border-style' || /^border-(?:top|right|bottom|left)-style$/.test(property)) {
    const p = postcss.list.space(value), sides = property === 'border-style' ? ['top', 'right', 'bottom', 'left'] : [property.split('-')[1]];
    if (wide.has(value)) return sides.map(side => [`$bs-${side}`, value]);
    const styles = new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);
    if (!p.length || p.length > (sides.length === 4 ? 4 : 1) || !p.every(v => styles.has(v))) throw new Error(`Unsupported ${property}: ${value}`);
    return sides.map(side => [`$bs-${side}`, sides.length === 4 ? fourSides(p, side) : p[0]]);
  }
  if (property === 'border-color') {
    const p = postcss.list.space(value);
    if (!p.length || p.length > 4 || (wide.has(value) && p.length !== 1)) throw new Error(`Unsupported border-color: ${value}`);
    return [['top', p[0]], ['right', p[1] ?? p[0]], ['bottom', p[2] ?? p[0]], ['left', p[3] ?? p[1] ?? p[0]]].map(([side, color]) => [`border-${side}-color`, color]);
  }
  if (/^border-(?:top|right|bottom|left)-color$/.test(property)) return [[property, value]];
  if (property === 'container') {
    const p = value.split('/').map(v => v.trim());
    if (p.length > 2 || !p[0]) throw new Error('Unsupported container shorthand');
    return [['container-name', p[0].toLowerCase() === 'none' ? 'none' : p[0]], ['container-type', (p[1] ?? 'normal').toLowerCase()]];
  }
  if (textPropertySet.has(property)) {
    // letter-spacing: normal, px or em (made px at the declaring element, its computed value); word-spacing: normal.
    if (property === 'letter-spacing' && !wide.has(value) && !['normal', '0', '0px'].includes(value) && !/^-?\d+(?:\.\d{1,6})?(?:px|em)$/.test(value)) throw new Error(`Unsupported ${property}: ${value}`);
    if (property === 'word-spacing' && !wide.has(value) && !['normal', '0', '0px'].includes(value)) throw new Error(`Unsupported ${property}: ${value}`);
    return [[property, value]];
  }
  if (property === 'font') {
    // The common form [style] [weight] size[/line-height] family is expanded (the rest of font resets to initial);
    // anything else (system fonts, small-caps, stretch keywords) stays the unmodeled shorthand marker.
    const keys = textProperties.filter(key => key.startsWith('font-') || key === 'line-height');
    if (wide.has(value)) return keys.map(key => [key, value]);
    const m = /^(?:(normal|italic|oblique)\s+)?(?:(normal|bold|bolder|lighter|[1-9]00)\s+)?((?:\d+(?:\.\d+)?)(?:px|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)(?:\s*\/\s*(normal|\d+(?:\.\d+)?(?:px|em|rem|%)?))?\s+(\S.*)$/i.exec(value.trim());
    if (!m) return keys.map(key => [key, fontShorthand]);
    const set = { 'font-style': m[1] ?? 'normal', 'font-weight': m[2] ?? 'normal', 'font-size': m[3], 'line-height': m[4] ?? 'normal', 'font-family': m[5].trim(), 'font-variant': 'normal', 'font-stretch': 'normal' };
    return keys.map(key => [key, set[key] ?? fontShorthand]);
  }
  // Paint only: whether a box draws a background (integrity `protrusion: 'painted'`).
  if (property === 'background-color' || property === 'background-image') return [[property, value]];
  // Table layout facts (fixed tables are modeled as an equivalent grid).
  if (['table-layout', 'border-collapse', 'border-spacing', 'caption-side', 'empty-cells', 'vertical-align'].includes(property)) return [[property, value]];
  if (property === 'outline') {
    if (wide.has(value)) return [['outline-style', value], ['outline-width', value], ['outline-color', value]];
    const parts = postcss.list.space(value), style = parts.find(p => /^(?:none|auto|solid|dotted|dashed|double|groove|ridge|inset|outset|hidden)$/.test(p)) ?? 'none';
    const widthPart = parts.find(p => /^(?:\d+(?:\.\d+)?px|0|thin|medium|thick)$/.test(p)) ?? 'medium';
    const colorPart = parts.find(p => p !== style && p !== widthPart) ?? 'currentcolor';
    return [['outline-style', style], ['outline-width', widthPart], ['outline-color', colorPart]];
  }
  if (property === 'text-decoration') {
    if (wide.has(value)) return [['text-decoration-line', value]];
    const lines = postcss.list.space(value).filter(p => ['underline', 'overline', 'line-through', 'none'].includes(p));
    return [['text-decoration-line', lines.length ? lines.join(' ') : 'none']];
  }
  if (property === 'list-style') {
    if (wide.has(value)) return [['list-style-type', value], ['list-style-position', value]];
    const all = postcss.list.space(value), parts = all.filter(p => !/^(?:inside|outside|url\(.*|none)$/.test(p) || p === 'none');
    return [['list-style-type', parts.find(p => p !== 'none') ?? (parts.includes('none') ? 'none' : 'disc')], ['list-style-position', all.includes('inside') ? 'inside' : 'outside']];
  }
  // An outside marker does not take part in the list item's layout; an inside one is an inline box in its first line.
  if (property === 'list-style-position') { if (!wide.has(value) && !['inside', 'outside'].includes(value)) throw new Error(`Unsupported list-style-position: ${value}`); return [[property, value]]; }
  // Transitions (CSS Transitions 1): which properties ease from a before-change value, for how long, with what easing.
  // Kept as lists; the analysis uses them for the starting values of @starting-style (a box that appears).
  if (property === 'transition') {
    const keys = ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'];
    if (wide.has(value)) return keys.map(key => [key, value]);
    const items = postcss.list.comma(value).map(item => {
      const parts = postcss.list.space(item), times = parts.filter(p => /^-?(?:\d+(?:\.\d+)?|\.\d+)m?s$/.test(p));
      const easing = parts.find(p => /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|(?:cubic-bezier|steps|linear)\(.*\))$/.test(p)) ?? 'ease';
      const name = parts.find(p => !times.includes(p) && p !== easing && !['normal', 'allow-discrete'].includes(p)) ?? 'all';
      return [name, times[0] ?? '0s', easing, times[1] ?? '0s'];
    });
    return keys.map((key, i) => [key, items.map(item => item[i]).join(', ')]);
  }
  if (['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'].includes(property)) return [[property, wide.has(value) ? value : postcss.list.comma(value).join(', ')]];
  // The easing of an animation (CSS Easing 2): it decides how far past its keyframes a value can go (easing.mjs).
  // Scroll-driven animations (Scroll-driven Animations 1): animation-timeline ties the progress to scrolling. scroll()
  // and view() (anonymous timelines) are modeled as running over the whole progress; a named timeline is not.
  // animation-range only narrows which part of the progress plays, so the states it reaches are among those checked.
  if (property === 'animation-timeline') {
    if (wide.has(value)) return [[property, value]];
    const items = postcss.list.comma(value);
    for (const item of items) if (!/^(?:auto|none|scroll\([^)]*\)|view\([^)]*\))$/.test(item)) throw new Error(`Unsupported animation-timeline: ${item} (a named timeline is not modeled)`);
    return [[property, items.join(', ')]];
  }
  if (/^animation-range(?:-start|-end)?$/.test(property)) return [];
  // The delay before an animation starts, and what it shows before and after it runs (CSS Animations 1 §3).
  if (property === 'animation-delay' || property === 'animation-fill-mode') return [[property, wide.has(value) ? value : postcss.list.comma(value).join(', ')]];
  if (property === 'animation-timing-function') return [[property, wide.has(value) ? value : postcss.list.comma(value).join(', ')]];
  if (property === 'animation') {
    const keys = ['animation-name', 'animation-duration', 'animation-iteration-count', 'animation-play-state', 'animation-direction', 'animation-timing-function', 'animation-delay', 'animation-fill-mode', 'animation-timeline'];
    if (wide.has(value)) return keys.map(key => [key, value]);
    // A list of animations: each item sets one entry of every longhand list (CSS Animations 1 §4).
    const items = postcss.list.comma(value).map(item => one(item));
    return keys.map((key, i) => [key, items.map(item => item[i][1]).join(', ')]);
  }
  function one(value) {
    const parts = postcss.list.space(value), times = parts.filter(p => /^-?(?:\d+(?:\.\d+)?|\.\d+)m?s$/.test(p));
    const count = parts.find(p => p === 'infinite' || /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(p)), state = parts.find(p => ['running', 'paused'].includes(p));
    const keyword = /^(?:infinite|running|paused|normal|reverse|alternate|alternate-reverse|none|forwards|backwards|both|linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|(?:cubic-bezier|steps|linear)\(.*)$/;
    const name = parts.find(p => !times.includes(p) && p !== count && !keyword.test(p)) ?? (parts.includes('none') ? 'none' : 'none');
    const direction = parts.find(p => ['normal', 'reverse', 'alternate', 'alternate-reverse'].includes(p)) ?? 'normal';
    const easing = parts.find(p => /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|(?:cubic-bezier|steps|linear)\(.*\))$/.test(p)) ?? 'ease';
    return [['animation-name', name], ['animation-duration', times[0] ?? '0s'], ['animation-iteration-count', count ?? '1'], ['animation-play-state', state ?? 'running'], ['animation-direction', direction], ['animation-timing-function', easing], ['animation-delay', times[1] ?? '0s'], ['animation-fill-mode', parts.find(p => ['none', 'forwards', 'backwards', 'both'].includes(p) && p !== name) ?? 'none'], ['animation-timeline', 'auto']]; // the shorthand resets the timeline
  }
  // hyphens (inherited): manual and none break only at explicit opportunities; auto also needs the content language.
  if (property === 'hyphens' && !wide.has(value) && !['manual', 'none', 'auto'].includes(value)) throw new Error(`Unsupported hyphens: ${value}`);
  // object-fit (how a replaced element's content fills its box; no geometry of the box itself).
  if (property === 'object-fit' && !wide.has(value) && !/^(?:fill|contain|cover|none|scale-down)$/.test(value)) throw new Error(`Unsupported object-fit: ${value}`);
  // touch-action (gestures only, no geometry): auto, none, manipulation, or pan-x/pan-y/pinch-zoom (and their -left/-right/-up/-down forms).
  if (property === 'touch-action' && !wide.has(value) && !/^(?:auto|none|manipulation|(?:(?:pan-(?:x|left|right)|pan-(?:y|up|down)|pinch-zoom)(?:\s+|$))+)$/.test(value)) throw new Error(`Unsupported touch-action: ${value}`);
  if (property === 'color-scheme' && !wide.has(value) && !/^(?:normal|(?:only\s+)?(?:light|dark)(?:\s+(?:light|dark))?(?:\s+only)?)$/.test(value)) throw new Error(`Unsupported color-scheme: ${value}`);
  // Stacking order (paint and hit testing only): auto or an integer.
  // transform: a list of px translations, scales and quarter-turn rotations (axis-aligned, about the centre).
  // It composes to p ↦ C + A(p − C) + t: A has one nonzero entry per row, t is each translation mapped by the
  // linear parts before it. Stored exactly as affine(a b c d tx ty) with rational entries.
  // backdrop-filter: blur(…) paints the backdrop (a solid backdrop stays that color); will-change: a hint. Neither
  // moves a box, but both make the element the containing block of its fixed and absolute descendants (Filter Effects 2,
  // CSS Will Change: as transform or filter would), which the engine applies as it does for a transform.
  if (property === 'backdrop-filter' || property === '-webkit-backdrop-filter') {
    if (wide.has(value) || value === 'none') return [['backdrop-filter', value]];
    if (/^(?:blur\(\s*(?:\d+(?:\.\d+)?px|0)\s*\)\s*)+$/i.test(value.trim())) return [['backdrop-filter', value.trim().toLowerCase()]];
    throw new Error(`Unsupported backdrop-filter: ${value} (only blur() is modeled: other filters change the colors behind the box)`);
  }
  if (property === 'will-change') {
    if (wide.has(value)) return [['will-change', value]];
    const v = value.trim().toLowerCase();
    if (!/^[a-z-]+(?:\s*,\s*[a-z-]+)*$/.test(v)) throw new Error(`Unsupported will-change: ${value}`);
    return [['will-change', v]];
  }
  // The individual transform properties (CSS Transforms 2): each is parsed as the transform function it stands for and
  // composed with transform when the style is computed (translate, then rotate, then scale, then transform). Only 2D
  // values are modeled (a z length, a 3D axis or a z scale stays Unknown).
  if (['translate', 'rotate', 'scale'].includes(property)) {
    if (wide.has(value) || value === 'none') return [[property, value]];
    const parts = postcss.list.space(value);
    const fail = () => { throw new Error(`Unsupported ${property}: ${value} (only 2D values are modeled)`); };
    // A third (z) value without depth (checklist B1): translate's z must be 0, scale's z does nothing to a flat box,
    // and rotate about the z axis (z, or the axis 0 0 n) is the 2D rotation.
    const zero = v => /^-?0+(?:\.0+)?(?:px)?$/.test(v);
    const fn = property === 'translate' ? (parts.length > 3 || (parts.length === 3 && !zero(parts[2])) ? fail() : `translate(${parts.slice(0, 2).join(',')})`)
      : property === 'scale' ? (parts.length > 3 ? fail() : `scale(${parts.slice(0, 2).map(p => /%$/.test(p) ? String(Number(p.slice(0, -1)) / 100) : p).join(',')})`)
      : parts.length === 1 ? `rotate(${parts[0]})`
      : parts.length === 2 && parts[0] === 'z' ? `rotate(${parts[1]})`
      : parts.length === 4 && zero(parts[0]) && zero(parts[1]) && !zero(parts[2]) && Number.isFinite(Number(parts[2])) ? `rotate(${Number(parts[2]) < 0 ? (parts[3].startsWith('-') ? parts[3].slice(1) : `-${parts[3]}`) : parts[3]})`
      : fail();
    const [[, affine]] = expand('transform', fn);
    return [[property, affine]];
  }
  if (property === 'transform') {
    if (wide.has(value) || value === 'none') return [[property, value]];
    const fns = value.match(/[a-z][a-z0-9]*\([^)]*\)/g) ?? [];
    if (!fns.length || value.replace(/[a-z][a-z0-9]*\([^)]*\)/g, '').trim()) throw new Error(`Unsupported transform: ${value}`);
    const fail = () => { throw new Error(`Unsupported transform: ${value} (only px translate, positive scale and quarter-turn rotation are modeled)`); };
    // A length: px, or a percentage of the box's own width (x) or height (y): [px, fraction].
    // A length: px, a percentage of the box's own width (x) or height (y), or em (the element's font-size): [px, fraction, em].
    const len = v => { const m = /^(-?\d+(?:\.\d{1,6})?)px$|^(0)$|^(-?\d+(?:\.\d{1,4})?)%$|^(-?\d+(?:\.\d{1,4})?)em$|^(-?\d+(?:\.\d{1,4})?)rem$/.exec(v.trim()); if (!m) fail();
      return m[3] !== undefined ? [q(0), mul(q(m[3]), q('0.01')), q(0), q(0)] : m[4] !== undefined ? [q(0), q(0), q(m[4]), q(0)] : m[5] !== undefined ? [q(0), q(0), q(0), q(m[5])] : [q(m[1] ?? '0'), q(0), q(0), q(0)]; };
    const factor = v => { const t = v.trim().replace(/^\./, '0.'); if (!/^\d+(?:\.\d{1,6})?$/.test(t) || Number(t) <= 0) fail(); return q(t); };
    // t = t0 + W·u + H·v (W, H the box's border-box size) for percentage translations.
    let A = [q(1), q(0), q(0), q(1)], t = [q(0), q(0)], u = [q(0), q(0)], w = [q(0), q(0)], e = [q(0), q(0)], r = [q(0), q(0)];
    const apply = ([a, b, c, d], [x, y]) => [add(mul(a, x), mul(b, y)), add(mul(c, x), mul(d, y))];
    const times = (m, n) => [add(mul(m[0], n[0]), mul(m[1], n[2])), add(mul(m[0], n[1]), mul(m[1], n[3])), add(mul(m[2], n[0]), mul(m[3], n[2])), add(mul(m[2], n[1]), mul(m[3], n[3]))];
    for (const fn of fns) {
      let [, name, args] = /^([a-z][a-z0-9]*)\((.*)\)$/.exec(fn), parts = args.split(',');
      // 3D functions without depth (checklist B1): a flat box has z = 0, so a zero z translation and any z scale change
      // nothing, and a rotation about the z axis is the 2D rotation. Depth (a z translation, a rotation about x or y,
      // perspective) changes what is drawn with a perspective, which is not modeled.
      const isZero = v => /^\s*-?0+(?:\.0+)?(?:px)?\s*$/.test(v);
      if (name === 'translatez') { if (parts.length !== 1 || !isZero(parts[0])) fail(); continue; }
      if (name === 'scalez') { factor(parts[0]); continue; }
      if (name === 'translate3d') { if (parts.length !== 3 || !isZero(parts[2])) fail(); name = 'translate'; parts = parts.slice(0, 2); args = parts.join(','); }
      if (name === 'scale3d') { if (parts.length !== 3) fail(); factor(parts[2]); name = 'scale'; parts = parts.slice(0, 2); args = parts.join(','); }
      if (name === 'rotatez') name = 'rotate';
      if (name === 'rotate3d') {
        if (parts.length !== 4 || !isZero(parts[0]) || !isZero(parts[1]) || isZero(parts[2]) || !Number.isFinite(Number(parts[2]))) fail();
        const angle = parts[3].trim();
        name = 'rotate'; args = Number(parts[2]) < 0 ? (angle.startsWith('-') ? angle.slice(1) : `-${angle}`) : angle; parts = [args];
      }
      if (name === 'translate' || name === 'translatex' || name === 'translatey') {
        if (parts.length > (name === 'translate' ? 2 : 1)) fail();
        const zeroLen = [q(0), q(0), q(0), q(0)];
        const [x, y] = name === 'translatey' ? [zeroLen, len(parts[0])] : [len(parts[0]), name === 'translate' && parts[1] !== undefined ? len(parts[1]) : zeroLen];
        const moved = apply(A, [x[0], y[0]]), byW = apply(A, [x[1], q(0)]), byH = apply(A, [q(0), y[1]]);
        const byEm = apply(A, [x[2], y[2]]), byRem = apply(A, [x[3], y[3]]); r = [add(r[0], byRem[0]), add(r[1], byRem[1])];
        t = [add(t[0], moved[0]), add(t[1], moved[1])]; u = [add(u[0], byW[0]), add(u[1], byW[1])]; w = [add(w[0], byH[0]), add(w[1], byH[1])]; e = [add(e[0], byEm[0]), add(e[1], byEm[1])];
      } else if (['scale', 'scalex', 'scaley'].includes(name)) {
        if (parts.length > (name === 'scale' ? 2 : 1)) fail();
        const [sx, sy] = name === 'scalex' ? [factor(parts[0]), q(1)] : name === 'scaley' ? [q(1), factor(parts[0])] : [factor(parts[0]), factor(parts[1] ?? parts[0])];
        A = times(A, [sx, q(0), q(0), sy]);
      } else if (name === 'rotate') {
        const m = /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))(deg|turn|grad|rad)\s*$/.exec(args); if (!m) fail();
        // In rad only 0 is a whole number of quarter turns (π is irrational): any other angle is an arbitrary rotation.
        const quarters = m[2] === 'rad' ? (Number(m[1]) === 0 ? 0 : 0.5) : Number(m[1]) * (m[2] === 'turn' ? 4 : m[2] === 'grad' ? 1 / 100 : 1 / 90);
        if (Math.abs(quarters - Math.round(quarters)) > 1e-9) {
          // A lone rotation by any other angle: the box is painted somewhere inside its circumscribed rectangle
          // (modeled for the accessibility checks, which treat what it may cover as undecided).
          const degrees = m[2] === 'rad' ? Number(m[1]) * 180 / Math.PI : Number(m[1]) * (m[2] === 'turn' ? 360 : m[2] === 'grad' ? 0.9 : 1);
          if (/e/i.test(String(degrees))) fail();
          if (fns.length === 1) return [[property, `rotate-any(${degrees})`]];
          // With other functions: each function on its own, composed as floats (checklist B2).
          return [[property, linearAny(fns.map(f => expand('transform', f)[0][1]), value)]];
        }
        A = times(A, [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]][((Math.round(quarters) % 4) + 4) % 4].map(n => q(n)));
      } else fail();
    }
    return [[property, `affine(${[...A, ...t, ...u, ...w, ...e, ...r].map(exact).join(' ')})`]];
  }
  // The legacy line clamp (display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: N) is what Chromium
  // implements; the unprefixed line-clamp is not modeled.
  // Properties that never change the checked geometry or paint (scrolling behaviour, selection, caret and accent
  // colours, font smoothing, snapping, view transitions, image sampling, …) are accepted and ignored.
  if (property === 'scroll-behavior') { if (!wide.has(value) && !['auto', 'smooth'].includes(value)) throw new Error(`Unsupported scroll-behavior: ${value}`); return [['scroll-behavior', value]]; }
  // Kept for the inert-declaration check (they act on a scroll container only); they do not change the layout.
  if (property === 'overscroll-behavior') { const parts = wide.has(value) ? [value] : postcss.list.space(value); if (parts.length > 2 || !parts.every(p => wide.has(p) || ['auto', 'contain', 'none'].includes(p))) throw new Error(`Unsupported overscroll-behavior: ${value}`); return [['overscroll-behavior-x', parts[0]], ['overscroll-behavior-y', parts[1] ?? parts[0]]]; }
  if (['overscroll-behavior-x', 'overscroll-behavior-y'].includes(property)) { if (!wide.has(value) && !['auto', 'contain', 'none'].includes(value)) throw new Error(`Unsupported ${property}: ${value}`); return [[property, value]]; }
  if (property === 'scroll-snap-type' || property === 'scroll-snap-align') return [[property, value.trim()]];
  if (/^(?:object-position|font-palette|user-select|-webkit-user-select|accent-color|-webkit-font-smoothing|-moz-osx-font-smoothing|-webkit-tap-highlight-color|print-color-adjust|-webkit-print-color-adjust|color-adjust|overflow-anchor|image-rendering|text-decoration-skip-ink|overscroll-behavior(?:-[xy]|-inline|-block)?|scroll-snap-(?:type|align|stop)|view-transition-name|view-transition-class|interpolate-size|anchor-name|anchor-scope|quotes|counter-(?:reset|increment|set)|-webkit-touch-callout|backface-visibility|-webkit-backface-visibility|text-underline-position|font-optical-sizing|font-kerning)$/.test(property)) return [];
  // Accepted only at values that leave line breaking, shaping, containing blocks and painting as modeled; any other
  // value changes what is checked, so it stays Unknown.
  const neutral = {
    'word-break': ['normal'], 'text-wrap-mode': ['wrap'],
    'font-variant-numeric': ['normal'], 'font-variant-ligatures': ['normal'], 'font-feature-settings': ['normal'], 'font-variation-settings': ['normal'], 'text-rendering': ['auto'],
    'text-indent': ['0', '0px'], 'tab-size': ['8'], 'box-decoration-break': ['slice'], '-webkit-box-decoration-break': ['slice'], 'field-sizing': ['fixed'],
    'text-size-adjust': ['none', '100%'], '-webkit-text-size-adjust': ['none', '100%'],
    filter: ['none'], 'mix-blend-mode': ['normal'], contain: ['none', 'style'], perspective: ['none'],
  };
  // white-space and the text-wrap shorthand both write text-wrap-mode (CSS Text 4): each also sets it, so the cascade
  // picks the later or more specific one, and computeStyle folds the mode back into white-space.
  if (property === 'text-wrap-mode') { if (!wide.has(value) && !['wrap', 'nowrap'].includes(value)) throw new Error(`Unsupported text-wrap-mode: ${value}`); return [['text-wrap-mode', value]]; }
  // text-wrap-style: balance and pretty change where wrapping text breaks (the engine keeps wrapping leaves under them
  // Unknown; one-line text is unaffected).
  if (property === 'text-wrap') {
    if (wide.has(value)) return [['text-wrap-mode', value], ['text-wrap-style', value]];
    const v = value.trim().toLowerCase();
    if (v === 'nowrap') return [['text-wrap-mode', 'nowrap'], ['text-wrap-style', 'auto']];
    if (['wrap', 'stable'].includes(v)) return [['text-wrap-mode', 'wrap'], ['text-wrap-style', 'auto']];
    if (['balance', 'pretty'].includes(v)) return [['text-wrap-mode', 'wrap'], ['text-wrap-style', v]];
    throw new Error(`Unsupported text-wrap: ${value}`);
  }
  if (property === 'text-wrap-style') {
    if (wide.has(value)) return [['text-wrap-style', value]];
    const v = value.trim().toLowerCase();
    if (['auto', 'stable'].includes(v)) return [['text-wrap-style', 'auto']];
    if (['balance', 'pretty'].includes(v)) return [['text-wrap-style', v]];
    throw new Error(`Unsupported ${property}: ${value}`);
  }
  // resize: kept so the engine can tell an inert one (overflow visible) from one the user can drag (Unknown there).
  if (property === 'resize') { const v = value.trim().toLowerCase(); if (!wide.has(v) && !['none', 'both', 'horizontal', 'vertical', 'block', 'inline'].includes(v)) throw new Error(`Unsupported resize: ${value}`); return [['resize', v]]; }
  if (Object.hasOwn(neutral, property)) {
    if (wide.has(value) || neutral[property].includes(value.trim().toLowerCase())) return [];
    throw new Error(`Unsupported ${property}: ${value} (it changes line breaking, shaping, containing blocks or paint, which are not modeled)`);
  }
  if (property === 'line-clamp' || property === 'box-orient') throw new Error(`Unsupported layout property: ${property} (only the -webkit- line clamp is modeled)`);
  if (property === 'text-overflow' && !wide.has(value) && !['clip', 'ellipsis'].includes(value)) throw new Error(`Unsupported text-overflow: ${value}`);
  if (property === '-webkit-line-clamp') { if (!wide.has(value) && !/^(?:none|[1-9]\d{0,2})$/.test(value)) throw new Error(`Unsupported -webkit-line-clamp: ${value}`); return [['line-clamp', value]]; }
  if (property === '-webkit-box-orient') { if (!wide.has(value) && !['vertical', 'horizontal'].includes(value)) throw new Error(`Unsupported -webkit-box-orient: ${value}`); return [['box-orient', value]]; }
  // transform-origin (checklist B3): x and y as px plus a fraction of the box's size, kept as 'origin(px frac px frac)';
  // the map about it is folded into the map about the centre when the style is computed. A z offset other than 0 and
  // em lengths are not modeled.
  if (property === 'transform-origin') {
    if (wide.has(value)) return [[property, value]];
    const parts = postcss.list.space(value);
    if (parts.length > 3 || (parts.length === 3 && !/^-?0+(?:\.0+)?(?:px)?$/.test(parts[2]))) throw new Error(`Unsupported transform-origin: ${value}`);
    const word = { left: ['x', 0], right: ['x', 1], top: ['y', 0], bottom: ['y', 1], center: ['c', 0.5] };
    const length = v => { const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|%)$|^(0)$/.exec(v); if (!m) throw new Error(`Unsupported transform-origin: ${value}`); return m[2] === '%' ? [0, Number(m[1]) / 100] : [Number(m[1] ?? 0), 0]; };
    let x = [0, 0.5], y = [0, 0.5];
    const [a, b] = parts.slice(0, 2);
    if (b === undefined) { if (word[a]) { if (word[a][0] === 'y') y = [0, word[a][1]]; else x = [0, word[a][1]]; } else x = length(a); }
    else if (word[a]?.[0] === 'y' || word[b]?.[0] === 'x') { y = word[a] ? [0, word[a][1]] : length(a); x = word[b] ? [0, word[b][1]] : length(b); }
    else { x = word[a] ? [0, word[a][1]] : length(a); y = word[b] ? [0, word[b][1]] : length(b); }
    return [[property, `origin(${x[0]} ${x[1]} ${y[0]} ${y[1]})`]];
  }
  // content-visibility: auto lays a box out as usual on screen and skips it offscreen, where contain-intrinsic-size
  // alone sizes it (the engine admits it where the width does not depend on the content). hidden is not modeled.
  if (property === 'content-visibility') { if (!wide.has(value) && !['visible', 'auto'].includes(value.trim())) throw new Error(`Unsupported content-visibility: ${value}`); return [[property, value.trim()]]; }
  // Only whether the block axis has an intrinsic size is kept (horizontal writing modes).
  if (/^contain-intrinsic-(?:size|width|height|inline-size|block-size)$/.test(property)) {
    if (wide.has(value)) return property === 'contain-intrinsic-size' || /height|block/.test(property) ? [['contain-intrinsic-block-size', value]] : [];
    const parts = value.trim().split(/\s+/), sizes = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'none') { sizes.push('none'); continue; }
      const auto = parts[i] === 'auto'; if (auto) i++;
      if (!/^\d+(?:\.\d+)?(?:px|r?em)$|^0$/.test(parts[i] ?? '')) throw new Error(`Unsupported ${property}: ${value}`);
      sizes.push(`${auto ? 'auto ' : ''}${parts[i]}`);
    }
    if (!sizes.length || sizes.length > (property === 'contain-intrinsic-size' ? 2 : 1)) throw new Error(`Unsupported ${property}: ${value}`);
    if (property === 'contain-intrinsic-size') return [['contain-intrinsic-block-size', sizes[1] ?? sizes[0]]];
    return /height|block/.test(property) ? [['contain-intrinsic-block-size', sizes[0]]] : [];
  }
  if (property === 'isolation') { if (!wide.has(value) && !['auto', 'isolate'].includes(value)) throw new Error(`Unsupported isolation: ${value}`); return [[property, value]]; }
  if (property === 'z-index') { if (!wide.has(value) && !/^(?:auto|-?\d+)$/.test(value)) throw new Error(`Unsupported z-index: ${value}`); return [[property, value]]; }
  // justify-self / justify-items are admitted where they do nothing (flex items and containers); the engine keeps a
  // grid item's or an absolute box's justify alignment Unknown.
  if (['justify-self', 'justify-items'].includes(property) && !wide.has(value) && !/^(?:auto|normal|stretch|start|end|center|flex-start|flex-end|self-start|self-end|left|right|legacy)$/.test(value.trim().toLowerCase())) throw new Error(`Unsupported ${property}: ${value}`);
  if (paintProperties.includes(property)) {
    if (property === 'visibility' && !wide.has(value) && !['visible', 'hidden', 'collapse'].includes(value)) throw new Error(`Unsupported visibility: ${value}`);
    if (property === 'pointer-events' && !wide.has(value) && !['auto', 'none'].includes(value)) throw new Error(`Unsupported pointer-events: ${value}`);
    if (property === 'opacity' && !wide.has(value) && !/^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(value)) throw new Error(`Unsupported opacity: ${value}`);
    return [[property, value]];
  }
  if (property === 'background') {
    if (wide.has(value)) return [['background-color', value], ['background-image', value]];
    const parts = postcss.list.space(value), image = parts.find(p => /^(?:url|(?:repeating-)?(?:linear|radial|conic)-gradient|image-set)\(/.test(p)) ?? 'none';
    const color = parts.find(p => !/^(?:url|(?:repeating-)?(?:linear|radial|conic)-gradient|image-set)\(/.test(p) && !/^(?:none|repeat|repeat-x|repeat-y|no-repeat|space|round|scroll|fixed|local|top|bottom|left|right|center|border-box|padding-box|content-box|\d.*|\/|auto|cover|contain)$/.test(p)) ?? 'transparent';
    return [['background-color', color], ['background-image', image]];
  }
  if (decoration.test(property)) return [];
  throw new Error(`Unsupported layout property: ${property}`);
}

// css-flexbox-1 §7.2: [<grow> <shrink>?] || <basis>, none, auto. A unitless
// zero is a flex factor unless two factors already precede it.
const flexNumber = /^\d+(?:\.\d+)?$/;
// (calc() and vw / vh bases too, checklist D2: flexItem decides whether they are modeled.)
const flexBasis = value => value === 'auto' || value === 'content' || /^\d+(?:\.\d+)?(?:px|%|vw|vh)$/.test(value) || /^(?:calc|min|max|clamp)\(.*\)$/.test(value);
function flexShorthand(value) {
  if (wide.has(value)) return ['flex-grow', 'flex-shrink', 'flex-basis'].map(key => [key, value]);
  if (value === 'none') return [['flex-grow', '0'], ['flex-shrink', '0'], ['flex-basis', 'auto']];
  if (value === 'auto') return [['flex-grow', '1'], ['flex-shrink', '1'], ['flex-basis', 'auto']];
  const parts = postcss.list.space(value), factors = [];
  let basis, groupEnded = false;
  for (const part of parts) {
    if (flexNumber.test(part) && !(part === '0' && factors.length === 2) && !(groupEnded && factors.length)) {
      if (factors.length === 2) throw new Error(`Invalid flex: ${value}`);
      factors.push(part);
    } else if (basis === undefined && (flexBasis(part) || part === '0')) { basis = part === '0' ? '0px' : part; if (factors.length) groupEnded = true; }
    else throw new Error(`Invalid flex: ${value}`);
  }
  if (!factors.length && basis === undefined) throw new Error(`Invalid flex: ${value}`);
  // Omitted grow is 1 and omitted shrink is 1; an omitted basis is 0 (computed as 0%).
  return [['flex-grow', factors[0] ?? '1'], ['flex-shrink', factors[1] ?? '1'], ['flex-basis', basis ?? '0%']];
}

export function parseLayoutCSS(sheets, diagnostic) {
  const duplicateDeclarations = [], noDurationTransitions = [], rules = [], layers = [], keyframes = new Set(), keyframeFrames = new Map(), fontFaces = [], transitionNotes = [], keyframeImportant = [], importIgnored = [], registered = new Map(), defaultNamespace = [], startingRules = [];
  const layerIndex = name => { if (!layers.includes(name)) layers.push(name); return layers.indexOf(name); };
  let count = 0, scope = null;
  const visit = (nodes, contexts, layer, filename, depth = 0, preferences = []) => {
    const problem = (code, message, line) => diagnostic(code, message, line, filename);
    if (depth > 32) { problem('U_LAYOUT_LIMIT', 'Conditional nesting limit exceeded'); return; }
    // @import loads another sheet only before every other rule of its sheet (after @charset and @layer statements);
    // anywhere else (after a rule, or inside @media) it is invalid and ignored (CSS Cascade 5 §2).
    let ruleSeen = depth > 0;
    for (const node of nodes) {
      if (node.type === 'comment') continue;
      if (++count > 2048) { problem('U_LAYOUT_LIMIT', 'CSS node limit exceeded'); return; }
      if (node.type === 'atrule' && node.name.toLowerCase() === 'import') {
        if (!ruleSeen) { problem('U_LAYOUT_CSS', `@import ${node.params.trim()} loads another stylesheet, which the analysis does not have`, node.source.start.line); continue; }
        importIgnored.push({ params: node.params.trim(), file: filename, line: node.source.start.line, nested: depth > 0 });
        continue;
      }
      if (!(node.type === 'atrule' && (node.name.toLowerCase() === 'charset' || (node.name.toLowerCase() === 'layer' && !node.nodes)))) ruleSeen = true;
      if (node.type === 'atrule' && node.name.toLowerCase() === 'layer') {
        if (layer !== null || contexts.length) { problem('U_LAYOUT_LAYER', 'Nested or conditional layer declarations are outside the subset', node.source.start.line); continue; }
        const names = node.params.trim() ? postcss.list.comma(node.params) : [];
        if (names.some(name => !/^[a-zA-Z_][\w-]*$/.test(name)) || (node.nodes && names.length > 1) || (!node.nodes && !names.length)) { problem('U_LAYOUT_LAYER', 'Use flat named layers or anonymous blocks', node.source.start.line); continue; }
        const indices = names.map(layerIndex);
        if (node.nodes) visit(node.nodes, contexts, indices[0] ?? layerIndex(`@anonymous:${layers.length}`), filename, depth + 1, preferences);
        continue;
      }
      // @keyframes only names an animation (paint); its frames are not modeled.
      // @font-face declares a web font (no box of its own): its family, font-display and fallback-metric overrides
      // decide whether text can change size when the file arrives (the font-swap rule).
      if (node.type === 'atrule' && node.name.toLowerCase() === 'font-face') {
        const descriptor = name => (node.nodes ?? []).find(d => d.type === 'decl' && d.prop.toLowerCase() === name)?.value.trim();
        const family = descriptor('font-family')?.replace(/^["']|["']$/g, '');
        if (!family) { problem('U_LAYOUT_CSS', '@font-face needs a font-family', node.source.start.line); continue; }
        fontFaces.push({ family, display: (descriptor('font-display') ?? 'auto').toLowerCase(), local: /^\s*local\(/i.test(descriptor('src') ?? ''),
          embedded: (() => { const urls = [...(descriptor('src') ?? '').matchAll(/url\(\s*(["']?)([^"')]*)/gi)].map(m => m[2]); return urls.length > 0 && urls.every(u => /^data:/i.test(u)); })(),
          overrides: ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override'].filter(name => descriptor(name) !== undefined), file: filename, line: node.source.start.line });
        continue;
      }
      if (node.type === 'atrule' && /^(?:-webkit-)?keyframes$/i.test(node.name)) {
        const name = node.params.trim().replace(/^["']|["']$/g, ''); keyframes.add(name);
        // The paint of each frame (for the flash rule): offsets with their background-color and opacity.
        const frames = [];
        for (const frame of node.nodes ?? []) if (frame.type === 'rule') for (const at of frame.selectors) {
          const offset = at.trim().toLowerCase() === 'from' ? 0 : at.trim().toLowerCase() === 'to' ? 1 : /^\d+(?:\.\d+)?%$/.test(at.trim()) ? parseFloat(at) / 100 : null;
          if (offset === null) continue;
          const props = {};
          // Declarations that lay out (not paint, transform or the other compositor-only properties): each such frame
          // is laid out again to find layout shifts.
          const layout = [];
          // !important in a keyframe makes the declaration invalid there: the browser ignores it (CSS Animations 1 §3).
          for (const d of frame.nodes ?? []) if (d.type === 'decl' && d.important && !keyframeImportant.some(n => n.line === d.source.start.line && n.file === filename && n.property === d.prop.toLowerCase())) keyframeImportant.push({ name, property: d.prop.toLowerCase(), file: filename, line: d.source.start.line });
          let easing; for (const d of frame.nodes ?? []) if (d.type === 'decl' && !d.important) { const prop = d.prop.toLowerCase(), value = d.value.trim().toLowerCase(); if (prop === 'animation-timing-function') { easing = value; continue; } if (prop === 'background-color' || prop === 'background') props['background-color'] = value; if (prop === 'opacity') props.opacity = value; if (!prop.startsWith('--') && !statePaint.test(prop) && !/^(?:transform|translate|scale|rotate|filter|backdrop-filter|will-change|offset(?:-.*)?)$/.test(prop)) layout.push(`${d.prop}:${d.value}`); }
          // easing: this keyframe's animation-timing-function, which eases the intervals that start at it.
          frames.push({ offset, props, ...(layout.length ? { layout: layout.join(';') } : {}), ...(easing ? { easing } : {}) });
        }
        keyframeFrames.set(name, frames.sort((a, b) => a.offset - b.offset));
        continue;
      }
      // At-rules that never change the screen: @charset (the encoding of bytes the analysis already has as text), @page
      // (the page box of paged media: print), @view-transition (navigation transitions between documents), and
      // @counter-style (the text of list markers: an outside marker is drawn beside its box and lays nothing out; an
      // inside one is Unknown on its own), and @font-palette-values (the colours of colour-font glyphs).
      if (node.type === 'atrule' && ['charset', 'page', 'view-transition', 'counter-style', 'font-palette-values'].includes(node.name.toLowerCase())) continue;
      // @starting-style sets the values a transition starts from when the box first appears; the settled layout is the
      // one without it. Accepted when it only paints (opacity, colours, transforms: nothing moves in the flow); a starting
      // value that lays out animates the layout in (a shift), which is not modeled.
      if (node.type === 'atrule' && node.name.toLowerCase() === 'starting-style') {
        const paintOnly = /^(?:opacity|color|background-color|background|border-color|outline-color|box-shadow|filter|visibility|transform|translate|rotate|scale|text-decoration-color|fill|stroke)$/;
        const declarations = []; node.walkDecls(d => { declarations.push(d.prop.toLowerCase()); });
        const layout = declarations.filter(p => !paintOnly.test(p));
        // A starting value that lays out: a transition of that property animates the layout in when the box appears.
        // The rules are kept (selector, declarations, order) for the analysis to apply to each box it matches.
        if (layout.length) {
          if ((node.nodes ?? []).some(n => n.type !== 'rule' && n.type !== 'comment')) { problem('U_LAYOUT_CSS', '@starting-style with conditional rules inside is not modeled', node.source.start.line); continue; }
          for (const rule of node.nodes.filter(n => n.type === 'rule')) {
            let selectors;
            try { selectors = rule.selectors.map(selector => compileSelector(selector)); if (selectors.some(s => s.state || s.pseudoElement)) throw new Error('a state or pseudo-element selector'); }
            catch (error) { problem('U_LAYOUT_SELECTOR', `@starting-style ${rule.selector}: ${error.message}`, rule.source.start.line); continue; }
            startingRules.push({ selectors, declarations: (rule.nodes ?? []).filter(d => d.type === 'decl' && !paintOnly.test(d.prop.toLowerCase())).map(d => ({ property: d.prop.toLowerCase(), value: d.value.trim(), important: Boolean(d.important) })), order: startingRules.length, file: filename, line: rule.source.start.line, contexts });
          }
        }
        continue;
      }
      // @namespace with a prefix only affects selectors written with that prefix; a default namespace changes what every
      // type selector matches, which is not modeled.
      if (node.type === 'atrule' && node.name.toLowerCase() === 'namespace') {
        // A default XHTML namespace: type and universal selectors match HTML elements only, which changes nothing unless
        // the page has SVG or MathML elements (checked against the tree by the analysis).
        const xhtml = /^(?:url\(\s*["']?http:\/\/www\.w3\.org\/1999\/xhtml["']?\s*\)|["']http:\/\/www\.w3\.org\/1999\/xhtml["'])$/i.test(node.params.trim());
        if (xhtml) defaultNamespace.push({ file: filename, line: node.source.start.line });
        else if (!/^[a-z_][\w-]*\s+(?:url\(|["'])/i.test(node.params.trim())) problem('U_LAYOUT_CSS', `@namespace ${node.params.trim()} sets the default namespace, which is not modeled`, node.source.start.line);
        continue;
      }
      // @property registers a custom property (CSS Properties and Values API 1 §2): its inherits and initial-value change
      // what var() reads. Only the universal syntax and the typed syntaxes above, with all three descriptors valid.
      if (node.type === 'atrule' && node.name.toLowerCase() === 'property') {
        const name = node.params.trim(), descriptor = d => (node.nodes ?? []).find(x => x.type === 'decl' && x.prop.toLowerCase() === d)?.value.trim();
        const syntax = descriptor('syntax')?.replace(/^["']|["']$/g, '').trim(), inherits = descriptor('inherits')?.toLowerCase(), initial = descriptor('initial-value');
        const problemOf = !customName(name) ? 'the name is not a custom property' : !syntax || !(syntax === '*' || typedValue[syntax]) ? `syntax ${syntax ?? '(missing)'} is not modeled` : !['true', 'false'].includes(inherits) ? 'inherits must be true or false' : syntax !== '*' && (initial === undefined || !typedValue[syntax].test(initial)) ? `initial-value ${initial ?? '(missing)'} is not a literal ${syntax}` : null;
        if (problemOf) { problem('U_LAYOUT_CSS', `@property ${name}: ${problemOf}`, node.source.start.line); continue; }
        if (depth > 0) { problem('U_LAYOUT_CSS', `@property ${name} inside a conditional rule is not modeled`, node.source.start.line); continue; }
        registered.set(name, { syntax, inherits: inherits === 'true', initial: initial ?? null });
        continue;
      }
      // @scope (root) { … }: the rules inside apply to the root's descendants, and the nearer root wins ties (Cascade 6
      // §2.5). Only a root without a limit, with compound selectors inside (no :scope, &, or combinators), is modeled.
      if (node.type === 'atrule' && node.name.toLowerCase() === 'scope') {
        const m = /^\(\s*([^()]+?)\s*\)(?:\s+to\s+\(\s*([^()]+?)\s*\))?$/i.exec(node.params.trim());
        if (!m || scope) { problem('U_LAYOUT_SELECTOR', `@scope ${node.params.trim()}: ${!m ? 'an implicit root or a selector list is' : 'a nested @scope is'} not modeled`, node.source.start.line); continue; }
        let root;
        try {
          root = compileSelector(m[1]); if (root.state || root.pseudoElement) throw new Error('a state or pseudo-element root');
          // The limit (to …): its elements below the root, and what is inside them, are outside the scope.
          if (m[2]) { if (/:scope\b|&/.test(m[2])) throw new Error('a limit relative to the root (:scope, &) is not modeled'); const limit = compileSelector(m[2]); if (limit.state || limit.pseudoElement) throw new Error('a state or pseudo-element limit'); root = { ...root, limit }; }
        } catch (error) { problem('U_LAYOUT_SELECTOR', `@scope ${node.params.trim()}: ${error.message}`, node.source.start.line); continue; }
        scope = root;
        try { visit(node.nodes ?? [], contexts, layer, filename, depth + 1, preferences); } finally { scope = null; }
        continue;
      }
      // @supports: its rules apply where the condition holds in every target browser, and are skipped where it fails in
      // all of them; a condition not decided from the known features (supports.mjs) is Unknown.
      if (node.type === 'atrule' && node.name.toLowerCase() === 'supports' && node.nodes) {
        const holds = supportsCondition(node.params);
        if (holds === true) visit(node.nodes, contexts, layer, filename, depth + 1, preferences);
        else if (holds === undefined) problem('U_LAYOUT_CSS', `@supports ${node.params.trim()}: the condition is not decided from the features known to be supported in every target browser`, node.source.start.line);
        continue;
      }
      if (node.type === 'atrule') {
        if (!['media', 'container'].includes(node.name.toLowerCase()) || !node.nodes) { problem('U_LAYOUT_CSS', `Unsupported @${node.name}`, node.source.start.line); continue; }
        try {
          const condition = parseCondition(node.params, node.name.toLowerCase());
          const wanted = condition.groups.flat().filter(atom => atom.preference);
          if (wanted.length) {
            if (condition.groups.length !== 1 || wanted.length !== condition.groups[0].length || new Set(wanted.map(atom => atom.feature)).size !== wanted.length) throw new Error('Preference media queries (prefers-*, forced-colors) must be a single group of distinct preferences, without size features');
            visit(node.nodes, contexts, layer, filename, depth + 1, [...preferences, ...wanted.map(({ feature, preference }) => ({ feature, value: preference }))]);
            continue;
          }
          // Provenance for explanations only; never consulted by the proof.
          condition.params = node.params.trim(); condition.css = {file: filename, line: node.source.start.line};
          if (condition.groups.length) visit(node.nodes, [...contexts, condition], layer, filename, depth + 1, preferences);
        } catch (error) { problem('U_LAYOUT_QUERY', error.message, node.source.start.line); }
        continue;
      }
      let selectors;
      try {
        if (node.type !== 'rule') throw new Error(`Unsupported CSS node: ${node.type}`);
        // Inside @scope (checklist C2): :scope is the root itself (one pseudo-class of specificity) and & is
        // :where(:scope) (no specificity, whatever the root's selector: measured in Chromium, Firefox and WebKit);
        // :scope > x / & x / x (relative) reach its children or descendants.
        selectors = scope ? node.selectors.map(raw => {
          const text = raw.trim(), m = /^(:scope|&)(?:(\s*>\s*|\s+)(.+))?$/.exec(text);
          const lead = m && m[1] === ':scope' ? [0, 1, 0] : [0, 0, 0];
          if (m && !m[2]) return { ...scope, source: text, specificity: lead, scope, scopeMode: 'self' };
          const rest = compileSelector(m ? m[3] : text);
          if (rest.chain || /:scope\b|&/.test(rest.source)) throw new Error(`${text} inside @scope: a selector with more combinators, or :scope / & further in, is not modeled there`);
          return { ...rest, source: text, specificity: rest.specificity.map((v, i) => v + lead[i]), scope, scopeMode: m && m[2].trim() === '>' ? 'child' : 'descendant' };
        }) : node.selectors.map(selector => compileSelector(selector));
      } catch (error) { problem('U_LAYOUT_SELECTOR', error.message, node.source.start.line); continue; }
      // Checklist F6: one property declared twice in a rule — the earlier declaration never applies (the later wins, or
      // the !important one). A later value the browser may not support (a newer function, unit or keyword, or a
      // vendor-prefixed one) is the progressive-enhancement fallback pattern and is left alone.
      {
        const newer = /(?:\b(?:var|env|calc|min|max|clamp|color-mix|oklch|oklab|lab|lch|light-dark|round|mod|rem|anchor|attr)\(|-webkit-|-moz-|-ms-|\d(?:dvh|svh|lvh|dvw|svw|lvw|dvi|svi|dvb|svb|cqi|cqw|cqh|cqb|cqmin|cqmax|rlh|lh|ic|cap)\b|\b(?:fit-content|max-content|min-content|stretch|-webkit-fill-available|subgrid|contents|clip|anchor-size)\b)/i;
        const seenProps = new Map();
        for (const d of node.nodes ?? []) {
          if (d.type !== 'decl') continue;
          const prop = d.prop.toLowerCase(), earlier = seenProps.get(prop);
          if (earlier && !newer.test(d.value) && !newer.test(earlier.value) && !duplicateDeclarations.some(n => n.file === filename && n.line === d.source.start.line && n.property === prop)) {
            const dead = earlier.important && !d.important ? d : earlier;
            duplicateDeclarations.push({ property: prop, selector: node.selector, file: filename, line: dead.source.start.line, dead: dead.value.trim(), kept: (dead === d ? earlier : d).value.trim(), same: earlier.value.trim() === d.value.trim() });
          }
          seenProps.set(prop, d);
          // F12: a transition shorthand item with no time is 0s.
          if (prop === 'transition' && !wide.has(d.value.trim().toLowerCase())) for (const item of postcss.list.comma(d.value)) if (!/(?:^|\s)-?(?:\d+(?:\.\d+)?|\.\d+)m?s(?:\s|$)/i.test(item.trim()) && item.trim().toLowerCase() !== 'none' && !/var\(/i.test(item))
            noDurationTransitions.push({ selector: node.selector, file: filename, line: d.source.start.line, item: item.trim() });
        }
      }
      // A state rule (:hover, :focus, …) may only repaint: the layout is proved for the base state.
      // Preference rules (prefers-reduced-motion, prefers-color-scheme, …) likewise: layout is proved under the default preferences.
      if (preferences.length && node.nodes.some(d => d.type === 'decl' && !d.prop.startsWith('--') && !statePaint.test(d.prop.toLowerCase()))) { problem('U_LAYOUT_QUERY', `Preference media rules may only change paint and animation; ${node.selector} changes layout`, node.source.start.line); continue; }
      // A :focus/:focus-visible rule may also move an absolutely positioned box by its insets (the skip-link pattern);
      // the engine models that for the accessibility checks only and keeps every other proof Unknown.
      const insetMove = /^(?:left|right|top|bottom|inset(?:-inline|-block)?)$/;
      // A state rule may also transform the box (hover lift, focus scale): transforms paint and hit-test, never lay out.
      const focusOnly = selectors.every(selector => ['focus', 'focus-visible'].includes(selector.state));
      const moves = d => (focusOnly && insetMove.test(d.prop.toLowerCase())) || ['transform', 'translate', 'rotate', 'scale'].includes(d.prop.toLowerCase());
      const stateGeometry = selectors.every(selector => selector.state) && node.nodes.some(d => d.type === 'decl' && moves(d)) && node.nodes.every(d => d.type !== 'decl' || d.prop.startsWith('--') || statePaint.test(d.prop.toLowerCase()) || moves(d));
      // A :checked::before/::after rule builds the pseudo-element only in the checked state; the engine requires it to be
      // absolutely positioned (an overlay), so it never moves the layout.
      const checkedMark = selectors.every(selector => selector.state === 'checked' && selector.pseudoElement);
      // A :focus/:focus-visible/:focus-within rule that changes layout: the engine lays the page out again with that one
      // box focused (accessibility checks only); in the base layout it never applies.
      const focusLayout = selectors.every(selector => ['focus', 'focus-visible', 'focus-within'].includes(selector.state) && !selector.pseudoElement);
      // A :hover rule that changes layout: the page is laid out again with each matching box hovered, and any box
      // whose start position moves is a layout shift (Chromium counts it: hover is not an excusing input; measured).
      const hoverLayout = !stateGeometry && !checkedMark && selectors.every(selector => selector.state === 'hover' && !selector.pseudoElement);
      const stateLayout = !stateGeometry && !checkedMark && (focusLayout || hoverLayout);
      if (!stateGeometry && !checkedMark && !stateLayout && selectors.some(selector => selector.state) && node.nodes.some(d => d.type === 'decl' && !d.prop.startsWith('--') && !statePaint.test(d.prop.toLowerCase()))) { problem('U_LAYOUT_SELECTOR', `State selector rules may only change paint (color, background, outline, box-shadow, text-decoration); ${node.selector} changes layout`, node.source.start.line); continue; }
      const declarations = [];
      const authored=node.nodes.filter(declaration=>declaration.type==='decl');
      // transition of display: display is discrete and does not transition without transition-behavior: allow-discrete
      // (CSS Transitions 2; measured: display: none applies at once). Paint timing only, reported as a warning.
      {
        const named = authored.filter(d => /^(?:transition|transition-property)$/i.test(d.prop) && /(?:^|[\s,])display(?:[\s,]|$)/i.test(d.value));
        const discrete = authored.some(d => /^transition-behavior$/i.test(d.prop) && /allow-discrete/i.test(d.value)) || named.some(d => /allow-discrete/i.test(d.value));
        if (named.length && !discrete) transitionNotes.push({ file: filename, line: named[0].source.start.line, selector: node.selector });
      }
      const conflicts=findCSSWriteConflicts(authored.map(declaration=>declaration.prop));
      for(const conflict of conflicts) {
        const location=index=>({file:filename,line:authored[index].source.start.line,column:authored[index].source.start.column});
        const css=location(conflict.later);
        diagnostic('E_CSS_SHORTHAND_CONFLICT',cssWriteConflictMessage(conflict),css.line,filename,
          {severity:'error',css,hint:conflict.hint,conflict:{properties:conflict.properties,longhands:conflict.longhands},
            related:[{css:location(conflict.earlier),message:`Earlier ${conflict.properties[0]} declaration`}]});
      }
      if(conflicts.length) continue;
      for (const declaration of node.nodes) {
        if (declaration.type === 'comment') continue;
        if (declaration.type !== 'decl') { problem('U_LAYOUT_CSS', 'Nested CSS rules are outside the subset', declaration.source.start.line); continue; }
        try {
          const custom=declaration.prop.startsWith('--'),property=custom ? declaration.prop : declaration.prop.toLowerCase();
          const expression=custom || /var\(/i.test(declaration.value) ? variableValue(declaration.value) : undefined;
          const pending=!custom && expression?.references.length ? {property,expression} : undefined;
          if(custom && !customName(property)) throw Object.assign(new Error('Use unescaped ASCII custom-property names'),{code:'U_LAYOUT_VARIABLE'});
          for (const [name, value] of custom ? [[property,declaration.value]] : expand(property,pending ? 'initial' : declaration.value)) {
            // A logical inline side (padding-inline-start, margin-inline, inset-inline-end, …) is stored as its ltr
            // physical side; `flip` is the side it means in an rtl box (computeStyle picks it once the direction is known).
            const flip = /-inline(?:-start|-end)?$/.test(property) && /(?:^|-)(?:left|right)$/.test(name) ? name.replace(/(left|right)$/, side => side === 'left' ? 'right' : 'left') : undefined;
            declarations.push({ property:name, value, ...(flip ? {flip} : {}), ...(custom ? {expression} : {}), ...(pending ? {pending,specified:declaration.value} : {}), important: declaration.important ? 1 : 0, line: declaration.source.start.line, file: filename });
          }
        } catch (error) { problem(error.code ?? 'U_LAYOUT_CSS', error.message, declaration.source.start.line); }
      }
      rules.push({ selectors, contexts, declarations, layer, file: filename, line: node.source.start.line, ...(preferences.length ? { preferences } : {}), ...(stateGeometry ? { stateGeometry: true } : {}), ...(stateLayout && node.nodes.some(d => d.type === 'decl' && !d.prop.startsWith('--') && !statePaint.test(d.prop.toLowerCase())) ? { stateLayout: true, ...(hoverLayout ? { hoverLayout: true } : {}) } : {}) });
    }
  };
  for (const sheet of sheets) {
    try { const root = flattenNesting(postcss.parse(sheet.css, { from: sheet.file })); visit(root.nodes, [], null, sheet.file); }
    catch (error) { diagnostic('U_LAYOUT_CSS', error.reason ?? error.message, error.line, sheet.file); }
  }
  // An animation-name without @keyframes runs no animation.
  // (Checklist F1: the names without @keyframes are kept for a warning — a typo or a missing rule.)
  const missingKeyframes = [];
  for (const rule of rules) for (const declaration of rule.declarations) if (declaration.property === 'animation-name' && !wide.has(declaration.value)) declaration.value = postcss.list.comma(declaration.value).map(name => {
    if (name === 'none' || keyframes.has(name)) return name;
    if (!missingKeyframes.some(m => m.name === name && m.line === declaration.line && m.file === declaration.file)) missingKeyframes.push({ name, file: declaration.file, line: declaration.line, selector: rule.selectors?.[0]?.source });
    return 'none';
  }).join(', ');
  return { rules, layers, keyframes, missingKeyframes, duplicateDeclarations, noDurationTransitions, keyframeFrames, fontFaces, transitionNotes, keyframeImportant, importIgnored, registered, defaultNamespace, startingRules };
}

// The UA default family and the user's default font size are not author
// facts: `medium` and `ua-default` stay unresolved for text metrics.
const textInitial = { 'font-family': 'ua-default', 'font-size': 'medium', 'line-height': 'normal', 'font-weight': 'normal', 'font-style': 'normal', 'font-stretch': 'normal', 'font-variant': 'normal', 'text-transform': 'none', 'letter-spacing': 'normal', 'word-spacing': 'normal', 'text-align': 'start' };

export function computeStyle(rules, box, active, inherited = {}, {spend, state, rtl = false}={}) {
  let flipped = false;
  const values = {
    // Media: track/source never render; audio renders only with controls.
    // ::before/::after are inline by default (CSS Pseudo-Elements 4), whatever their element's tag.
    display: ['before', 'after'].includes(box.pseudo) ? 'inline' : ['track', 'source'].includes(box.tag) || (box.tag === 'audio' && !box.controls) ? 'none' : ['span', 'a', 'strong', 'em', 'b', 'i', 'small', 'output', 'label', 'img', 'picture', 'iframe', 'video', 'audio'].includes(box.tag) ? 'inline' : 'block',
    'aspect-ratio': 'auto', 'box-sizing': 'content-box', 'inline-size': 'auto', 'min-inline-size': 'auto', 'max-inline-size': 'none',
    'padding-left': '0', 'padding-right': '0', 'border-left': '0', 'border-right': '0',
    'padding-top': '0', 'padding-bottom': '0', 'border-top': '0', 'border-bottom': '0', 'border-top-color': 'currentcolor', 'border-right-color': 'currentcolor', 'border-bottom-color': 'currentcolor', 'border-left-color': 'currentcolor',
    'margin-left': box.tag === 'body' ? 'ua' : '0', 'margin-right': box.tag === 'body' ? 'ua' : '0',
    'margin-top': /^(?:body|p|h[1-6])$/.test(box.tag) ? 'ua' : '0', 'margin-bottom': /^(?:body|p|h[1-6])$/.test(box.tag) ? 'ua' : '0',
    'block-size': 'auto', 'min-block-size': 'auto', 'max-block-size': 'none',
    'grid-template-columns': 'none', 'grid-template-rows': 'none', 'grid-auto-rows': 'auto', 'grid-auto-flow': 'row', 'row-gap': 'normal',
    'container-type': 'normal', 'container-name': 'none', 'align-items': 'normal', 'align-self': 'auto', 'align-content': 'normal',
    'column-gap': 'normal', 'grid-template-areas': 'none', 'grid-column': 'auto', 'grid-row': 'auto',
    'background-color': 'transparent', 'background-image': 'none',
    'outline-style': 'none', 'outline-width': 'medium', 'outline-color': 'currentcolor', 'outline-offset': '0', 'box-shadow': 'none',
    hyphens: inherited.hyphens ?? 'manual', 'object-fit': 'fill', 'scroll-behavior': 'auto', 'overscroll-behavior-x': 'auto', 'overscroll-behavior-y': 'auto', 'scroll-snap-type': 'none', 'scroll-snap-align': 'none', resize: 'none', 'text-wrap-mode': inherited['text-wrap-mode'] ?? 'white-space', 'text-wrap-style': inherited['text-wrap-style'] ?? 'auto', 'text-overflow': 'clip', 'line-clamp': 'none', 'box-orient': 'horizontal', 'touch-action': 'auto', 'z-index': 'auto', 'content-visibility': 'visible', 'contain-intrinsic-block-size': 'none', isolation: 'auto', transform: 'none', 'transform-origin': 'origin(0 0.5 0 0.5)', translate: 'none', rotate: 'none', scale: 'none', 'backdrop-filter': 'none', 'will-change': 'auto', 'justify-self': 'auto', 'justify-items': 'normal', clip: 'auto', 'clip-path': 'none', ...Object.fromEntries(['margin', 'padding'].flatMap(kind => ['top', 'right', 'bottom', 'left'].map(side => [`scroll-${kind}-${side}`, kind === 'padding' ? 'auto' : '0']))), 'color-scheme': inherited['color-scheme'] ?? 'normal', cursor: inherited.cursor ?? 'auto', 'list-style-type': inherited['list-style-type'] ?? 'disc', 'animation-name': 'none', 'animation-duration': '0s', 'animation-iteration-count': '1', 'animation-play-state': 'running', 'animation-direction': 'normal', 'animation-timing-function': 'ease', 'animation-delay': '0s', 'animation-fill-mode': 'none', 'animation-timeline': 'auto', 'transition-property': 'all', 'transition-duration': '0s', 'transition-timing-function': 'ease', 'transition-delay': '0s',
    'table-layout': 'auto', // HTML UA: table { border-collapse: separate; border-spacing: 2px } (a UA rule on table, not inherited from above).
    'border-collapse': box.tag === 'table' ? 'separate' : inherited['border-collapse'] ?? 'separate', 'border-spacing': box.tag === 'table' ? '2px' : inherited['border-spacing'] ?? '0', 'caption-side': inherited['caption-side'] ?? 'top', 'empty-cells': 'show',
    // HTML UA: thead, tbody, tfoot, tr { vertical-align: middle } and td, th { vertical-align: inherit }.
    'vertical-align': ['thead', 'tbody', 'tfoot', 'tr'].includes(box.tag) ? 'middle' : ['td', 'th'].includes(box.tag) ? inherited['vertical-align'] ?? 'baseline' : 'baseline',
    fill: inherited.fill ?? 'black', stroke: inherited.stroke ?? 'none', 'list-style-position': inherited['list-style-position'] ?? 'outside', 'caret-color': inherited['caret-color'] ?? 'auto',
    color: box.tag === 'a' && box.focusable !== false ? 'ua-link' : inherited.color ?? 'canvastext', 'text-decoration-line': box.tag === 'a' && box.focusable !== false ? 'underline' : 'none', visibility: inherited.visibility ?? 'visible', 'pointer-events': inherited['pointer-events'] ?? 'auto', opacity: '1',
    'flex-direction': 'row', 'flex-wrap': 'nowrap', 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', 'justify-content': 'normal', order: '0',
    'overflow-x': 'visible', 'overflow-y': 'visible', 'white-space': inherited['white-space'] ?? 'normal',
    'scrollbar-gutter':'auto', 'scrollbar-width':'auto',
    appearance:'auto',
    'overflow-wrap': inherited['overflow-wrap'] ?? 'normal', float: 'none', position: 'static',
    left:'auto',right:'auto',top:'auto',bottom:'auto',
    'writing-mode': inherited['writing-mode'] ?? 'horizontal-tb', direction: inherited.direction ?? 'ltr',
    ...Object.fromEntries(textProperties.map(key => [key, inherited[key] ?? textInitial[key]])),
  };
  const defaults={...values};
  // Lists: UA margins and the start padding for markers; li defaults to display: list-item (unsupported).
  // details is a block; summary a list item with an inside disclosure marker (Chromium's UA sheet, measured).
  if (box.tag === 'details' && !box.pseudo) values.display = 'block';
  if (box.tag === 'summary' && !box.pseudo) { values.display = 'list-item'; values['list-style-type'] = 'disclosure-closed'; values['list-style-position'] = 'inside'; }
  if(['ul', 'ol'].includes(box.tag)) { values['list-style-type'] = box.tag === 'ol' ? 'decimal' : 'disc'; values['margin-top']='ua'; values['margin-bottom']='ua'; values['padding-left']='ua'; }
  if(box.tag==='li') values.display='list-item';
  // dl margins and the dd indent (1em / 40px) stay UA until reset; marquee is inline-block.
  if(box.tag==='dl') { values['margin-top']='ua'; values['margin-bottom']='ua'; }
  if(box.tag==='dd') values['margin-left']='ua';
  if(box.tag==='marquee') values.display='inline-block';
  // Tables keep their UA table-* display (unsupported) until the author restyles them; th is bold and centred.
  const tableDisplay = {table: 'table', caption: 'table-caption', thead: 'table-header-group', tbody: 'table-row-group', tfoot: 'table-footer-group', tr: 'table-row', th: 'table-cell', td: 'table-cell'};
  if (tableDisplay[box.tag]) values.display = tableDisplay[box.tag];
  if (box.tag === 'th') { values['font-weight'] = 'bold'; values['text-align'] = 'ua'; }
  // UA cell padding (HTML rendering: td, th { padding: 1px }).
  if (['td', 'th'].includes(box.tag)) for (const side of ['left', 'right', 'top', 'bottom']) values[`padding-${side}`] = '1px';
  // fieldset/legend: UA border, padding, margin and min-inline-size until reset.
  if (box.tag === 'fieldset') { for (const side of ['left', 'right', 'top', 'bottom']) { values[`padding-${side}`] = 'ua'; values[`border-${side}`] = 'ua'; } values['margin-left'] = 'ua'; values['margin-right'] = 'ua'; values['min-inline-size'] = 'ua'; }
  if (box.tag === 'legend') { values['padding-left'] = 'ua'; values['padding-right'] = 'ua'; }
  // Chromium's UA margin on checkboxes and radios (3px 3px 3px 4px; radio 3px 3px 0 5px, measured) applies whatever
  // their appearance: it stays 'ua' until the author sets the margin.
  // With a UA profile the margins are known (WebKit: 3px 2px on both).
  if (!box.pseudo && box.tag === 'input' && ['checkbox', 'radio'].includes(box.inputType)) ['top', 'right', 'bottom', 'left'].forEach((side, i) => { values[`margin-${side}`] = uaProfile ? uaProfile[box.inputType].margin[i] : 'ua'; });
  // The control's UA box rules are not its ::before/::after's.
  if(!box.pseudo && ['button', 'input', 'select', 'textarea'].includes(box.tag)) {
    values.$uaBorder = true;
    for(const side of ['left','right','top','bottom']) {values[`padding-${side}`]='ua';values[`border-${side}`]='ua';}
    for(const key of ['display','box-sizing','min-inline-size','min-block-size']) values[key]='ua';
    // Text fields: Chromium's UA values are known (measured): inline-block, content-box (search: border-box), no min size.
    // Date and time fields (date, time, datetime-local, month, week) take the same box as a text field: content-box,
    // their author size even below their content (measured in Chromium: 218×42 for 200×40 + 8px padding + 1px border).
    if (box.tag === 'textarea' || (box.tag === 'input' && ['text', 'email', 'search', 'password', 'tel', 'url', 'number', 'date', 'time', 'datetime-local', 'month', 'week', undefined].includes(box.inputType))) {
      values.display = 'inline-block'; values['box-sizing'] = box.inputType === 'search' ? 'border-box' : 'content-box'; values['min-inline-size'] = '0'; values['min-block-size'] = '0';
      // With a UA profile (ua option) the field's padding and border are known.
      const edges = uaProfile && (box.tag === 'textarea' ? uaProfile.textarea : uaProfile.textField);
      if (edges) ['top', 'right', 'bottom', 'left'].forEach((side, i) => { values[`padding-${side}`] = edges.padding[i]; values[`border-${side}`] = edges.border[i]; });
    }
    if (uaProfile && box.tag === 'select') ['top', 'right', 'bottom', 'left'].forEach((side, i) => { values[`padding-${side}`] = uaProfile.select.padding[i]; values[`border-${side}`] = uaProfile.select.border[i]; });
    // A range slider: Chromium's UA box is inline-block, content-box, no padding or border, a 2px margin on every side,
    // and it takes its author width and height whatever they are (measured: 160×24, 20×4; 296px wide in a 300px column
    // with the UA margin).
    if (box.tag === 'input' && box.inputType === 'range') {
      values.display = 'inline-block'; values['box-sizing'] = 'content-box'; values['min-inline-size'] = '0'; values['min-block-size'] = '0';
      ['top', 'right', 'bottom', 'left'].forEach((side, i) => { values[`padding-${side}`] = '0'; values[`border-${side}`] = '0'; values[`margin-${side}`] = uaProfile ? uaProfile.range.margin[i] : '2px'; });
    }
    // Buttons: Chromium's UA box is padding 1px 6px, a 2px border, inline-block, border-box (measured, with or without
    // appearance: none).
    if (box.tag === 'button' || (box.tag === 'input' && ['button', 'submit', 'reset'].includes(box.inputType))) {
      // (Per browser with a UA profile: Firefox 1px 4px, WebKit 2px 6px 3px.)
      const b = uaProfile?.button ?? { padding: ['1px', '6px', '1px', '6px'], border: ['2px', '2px', '2px', '2px'] };
      ['top', 'right', 'bottom', 'left'].forEach((side, i) => { values[`padding-${side}`] = b.padding[i]; values[`border-${side}`] = b.border[i]; });
      // min-width stays auto (measured in Chromium: a flex item button grows to its min-content, like a div; in block
      // flow auto is 0).
      values.display = 'inline-block'; values['box-sizing'] = 'border-box'; values['min-inline-size'] = 'auto'; values['min-block-size'] = '0';
    }
    // Controls do not inherit the page's font size: the UA's control font is the default size − 2.67px (13.33px
    // at a 16px default; measured in Chromium), until the author sets it (font: inherit, font-size).
    values['font-size']='ua';
    // The rest of the UA control font (font: -webkit-small-control; measured in Chromium under a page that sets
    // Roboto, weight 300, line-height 2 and letter-spacing 1px: Arial (textarea monospace) 400, line-height normal,
    // letter- and word-spacing normal). The family is the platform's control font: its text is not measured until
    // the author sets the family (font: inherit or font-family).
    values['font-family'] = 'ua-control'; values['font-weight'] = 'normal'; values['font-style'] = 'normal';
    values['line-height'] = 'normal'; values['letter-spacing'] = 'normal'; values['word-spacing'] = 'normal';
  }
  // UA font rules (h1–h6 size, strong/b weight, em/i style, small size) are not author facts: they stay 'ua' until
  // author CSS sets them. h1–h6 (and th) are font-weight: bold in the HTML rendering rules and in Chromium, a fixed
  // absolute weight (strong/b are bolder, relative to the parent, and stay 'ua').
  if (/^h[1-6]$/.test(box.tag)) { values['font-size'] = 'ua'; values['font-weight'] = 'bold'; }
  if (['strong', 'b'].includes(box.tag)) values['font-weight'] = 'ua';
  if (['em', 'i'].includes(box.tag)) values['font-style'] = 'ua';
  if (box.tag === 'small') values['font-size'] = 'ua';
  // [hidden] { display: none } (UA): author display overrides it.
  if(box.hiddenAttr===true) values.display='none';
  // A closed popover: [popover]:not(:popover-open) { display: none } (UA); opening it is runtime state.
  if(box.popover===true) values.display='none';
  // A closed dialog: dialog:not([open]) { display: none } (UA). An open one is placed by the UA (position: absolute,
  // centred, fit-content), which is not modeled.
  if(box.tag==='dialog' && box.dialogOpen===false) values.display='none';
  if(box.tag==='dialog' && box.dialogOpen!==false) throw Object.assign(new Error(box.dialogOpen==='dynamic' ? 'A dynamic open attribute decides whether the dialog renders' : 'An open dialog is placed by the UA (position: absolute, centred, fit-content), which is not modeled'),{code:'U_LAYOUT_ELEMENT'});
  // [dir=ltr|rtl] { direction } (UA, inherited): author CSS may override; dir=auto depends on the text.
  if(box.dirAttr==='ltr' || box.dirAttr==='rtl') values.direction=box.dirAttr;
  else if(box.dirAttr!==undefined) throw Object.assign(new Error(box.dirAttr==='auto' ? 'dir=auto: own text and children both have strong characters, whose order is not known' : `dir=${box.dirAttr} is not a direction`),{code:'U_LAYOUT_ELEMENT'});
  if(box.popover===true && ['html','body'].includes(box.tag)) throw Object.assign(new Error(`A popover on ${box.tag} would hide the whole page`),{code:'U_LAYOUT_ELEMENT'});
  if(box.popover==='dynamic') throw Object.assign(new Error('A dynamic popover attribute decides whether it renders'),{code:'U_LAYOUT_ELEMENT'});
  if(box.hiddenAttr==='until-found' || box.hiddenAttr==='dynamic') throw Object.assign(new Error(`hidden=${box.hiddenAttr === 'dynamic' ? '(dynamic)' : 'until-found'} is outside the modeled rendering`),{code:'U_LAYOUT_ELEMENT'});
  const ua = { ...values };
  const initial = { ...defaults, ...textInitial, fill: 'black', stroke: 'none', 'list-style-position': 'outside', 'caret-color': 'auto', hyphens: 'manual', 'object-fit': 'fill', 'scroll-behavior': 'auto', 'overscroll-behavior-x': 'auto', 'overscroll-behavior-y': 'auto', 'scroll-snap-type': 'none', 'scroll-snap-align': 'none', resize: 'none', 'text-wrap-mode': 'white-space', 'text-wrap-style': 'auto', 'text-overflow': 'clip', 'line-clamp': 'none', 'box-orient': 'horizontal', 'touch-action': 'auto', 'table-layout': 'auto', 'border-collapse': 'separate', 'border-spacing': '0', 'caption-side': 'top', 'empty-cells': 'show', 'vertical-align': 'baseline', 'outline-style': 'none', 'outline-width': 'medium', 'outline-color': 'currentcolor', 'outline-offset': '0', 'box-shadow': 'none', 'z-index': 'auto', 'content-visibility': 'visible', 'contain-intrinsic-block-size': 'none', isolation: 'auto', transform: 'none', 'transform-origin': 'origin(0 0.5 0 0.5)', translate: 'none', rotate: 'none', scale: 'none', 'backdrop-filter': 'none', 'will-change': 'auto', 'justify-self': 'auto', 'justify-items': 'normal', 'color-scheme': 'normal', cursor: 'auto', 'list-style-type': 'disc', 'animation-name': 'none', 'animation-duration': '0s', 'animation-iteration-count': '1', 'animation-play-state': 'running', 'animation-direction': 'normal', 'animation-timing-function': 'ease', 'animation-delay': '0s', 'animation-fill-mode': 'none', 'animation-timeline': 'auto', 'transition-property': 'all', 'transition-duration': '0s', 'transition-timing-function': 'ease', 'transition-delay': '0s', color: 'canvastext', 'text-decoration-line': 'none', visibility: 'visible', 'pointer-events': 'auto', display: 'inline', 'white-space': 'normal', 'overflow-wrap': 'normal', 'writing-mode': 'horizontal-tb', direction: 'ltr', 'margin-left': '0', 'margin-right': '0', 'margin-top': '0', 'margin-bottom': '0' };
  const inheritedProperties = new Set(['white-space', 'overflow-wrap', 'writing-mode', 'direction', 'border-collapse', 'border-spacing', 'caption-side', 'empty-cells', ...textProperties, ...inheritedPaint]);
  const priorities = new Map(), sources = {},custom=new Map(),dormant={},overridden={}, candidates = {};
  const conditions = rule => rule.contexts.length ? {conditions: rule.contexts.map(c => ({kind: c.kind, ...(c.name ? {name: c.name} : {}), params: c.params, css: c.css}))} : {};
  // A preference rule holds when the state names its value, or the value is the default.
  const preferred = rule => (rule.preferences ?? []).every(({ feature, value }) => ([...(state ?? [])].find(s => s.startsWith(`${feature}:`))?.slice(feature.length + 1) ?? preferenceValues[feature][0]) === value);
  for (const rule of rules) {
    if (!active(rule) || !preferred(rule)) {
      // Matching declarations whose conditions are false here: explanation data.
      const selector = rule.selectors.find(selector => matches(selector, box, state));
      if (selector) for (const declaration of rule.declarations) (dormant[declaration.property] ??= []).push({file: declaration.file, line: declaration.line, selector: selector.source, ...(rule.layerName ? {layer: rule.layerName} : {}), specified: declaration.specified ?? declaration.value, ...conditions(rule)});
      continue;
    }
    for (const selector of rule.selectors) {
      if (!matches(selector, box, state)) continue;
      for (const declaration of rule.declarations) {
        const layer = rule.layer === null ? (declaration.important ? -Infinity : Infinity) : declaration.important ? -rule.layer : rule.layer;
        // The style attribute (element-attached) wins over every selector and layer, below only importance (Cascade 5).
        // Scope proximity (Cascade 6 §6.6): after specificity, the nearer scope root wins; unscoped is farthest.
        const rank = [declaration.important, rule.attached ? 1 : 0, layer, ...selector.specificity, selector.scope ? -scopeProximity(selector, box, state) : -Infinity];
        const origin = { file: declaration.file, line: declaration.line, selector: selector.source, layer: rule.layerName, specified: declaration.specified ?? declaration.value, ...conditions(rule), ...(declaration.flip ? { logical: true } : {}) };
        // A logical side resolves by the box's direction (an rtl pass when the first one finds rtl; CSS Logical 1).
        if (declaration.flip) flipped = true;
        const property = rtl && declaration.flip ? declaration.flip : declaration.property;
        if (!declaration.expression) (candidates[property] ??= []).push({ rank, value: declaration.pending ? declaration : declaration.value, origin, important: declaration.important });
        const wins = !priorities.has(property) || greaterRank(rank, priorities.get(property));
        // Explanation data only: the losing side of each comparison.
        const loser = wins ? sources[property] : origin;
        if (loser) (overridden[property] ??= []).push(loser);
        if (wins) {
          if(declaration.expression) custom.set(property,declaration);
          else values[property] = declaration.pending ? declaration : declaration.value;
          priorities.set(property, rank);
          sources[property] = origin;
        }
      }
    }
  }
  // revert-layer (CSS Cascade 5 §7.3): roll the property back to the best declaration of an earlier layer (rank[2] is the
  // layer; unlayered declarations are the implicit last layer, Infinity, so there it rolls back to the explicit layers —
  // measured in Chromium, Firefox and WebKit). With nothing earlier it is revert (the UA value).
  for (const property of Object.keys(values)) {
    let guard = 0;
    while (values[property] === 'revert-layer' && guard++ < 64) {
      const current = priorities.get(property);
      if (current[0]) throw Object.assign(new Error(`${property}: revert-layer !important is not modeled`), { code: 'U_LAYOUT_CSS' });
      const earlier = (candidates[property] ?? []).filter(c => !c.important && c.rank[2] < current[2]);
      if (!earlier.length) { values[property] = 'revert'; break; }
      const best = earlier.reduce((a, b) => greaterRank(b.rank, a.rank) ? b : a);
      values[property] = best.value; priorities.set(property, best.rank); sources[property] = best.origin;
    }
  }
  for (const [name, declaration] of custom) { const issue = registeredValueProblem(name, declaration.specified ?? declaration.value ?? ''); if (issue) throw Object.assign(new Error(issue), { code: 'U_LAYOUT_VARIABLE' }); }
  const environment=variableEnvironment(custom,inherited.$variables,box.documentRoot,spend,registeredProperties),expanded=new Map(),invalid=[];
  for (const property of Object.keys(values)) {
    let value = values[property];
    if(typeof value==='object') {
      const declaration=value;
      try {
        if(!expanded.has(declaration.pending)) {
          const result=substituteDeclaration(declaration.pending.expression,environment,spend);
          // Invalid at computed-value time: every longhand it writes is unset.
          if(result.invalid) invalid.push({property:declaration.pending.property,file:declaration.file,line:declaration.line,...result.invalid,longhands:[]});
          expanded.set(declaration.pending,{map:new Map(expand(declaration.pending.property,result.invalid ? 'unset' : result.value)),invalid:result.invalid ? invalid.at(-1) : undefined});
        }
        const entry=expanded.get(declaration.pending);
        // The expansion is keyed by the ltr side the declaration was stored under.
        value=entry.map.get(declaration.property);
        entry.invalid?.longhands.push(property);
        if(value===undefined) throw new Error('CSS variable shorthand does not produce the required property');
      } catch(error) {error.css={file:declaration.file,line:declaration.line};throw error;}
    }
    if (value === 'revert') value = ua[property];
    if (value === 'unset') value = inheritedProperties.has(property) ? 'inherit' : 'initial';
    if (value === 'initial') value = initial[property];
    if (value === 'inherit') {
      if (Object.hasOwn(inherited, property)) value = inherited[property];
      else if (box.documentRoot) value = initial[property];
      else throw new Error(`Cannot resolve inherited ${property}; provide the real ancestor chain`);
    }
    values[property] = value;
  }
  // Content language from the lang attribute (HTML: inherited; empty means unknown). Not settable by CSS.
  values.$lang = box.lang !== undefined ? box.lang : inherited.$lang ?? '';
  // color-scheme: author-declared Canvas/CanvasText resolve in the element's used scheme
  // (Chromium: light #fff/#000, dark #121212/#fff). The UA defaults stay keywords (ADR-0007).
  const schemes = String(values['color-scheme']).split(/\s+/).filter(t => ['light', 'dark'].includes(t));
  const wanted = [...(state ?? [])].find(s => s.startsWith('prefers-color-scheme:'))?.slice(21) ?? 'light';
  const used = schemes.includes(wanted) ? wanted : schemes[0] ?? 'light';
  values.$scheme = used;
  for (const property of ['color', 'background-color']) if (sources[property] && ['canvas', 'canvastext'].includes(String(values[property]).toLowerCase()))
    values[property] = { light: { canvas: '#ffffff', canvastext: '#000000' }, dark: { canvas: '#121212', canvastext: '#ffffff' } }[used][String(values[property]).toLowerCase()];
  // Buttons: the UA's button { color: ButtonText; background-color: ButtonFace } (not inherited; with or without
  // appearance), in the used scheme: light #000 on #efefef, dark #fff on #6b6b6b (Chromium, measured).
  if (!box.pseudo && (box.tag === 'button' || (box.tag === 'input' && ['button', 'submit', 'reset'].includes(box.inputType)))) {
    // (Per browser with a UA profile; a profile without dark colors keeps the dark scheme's colors unknown.)
    const b = uaProfile?.button ?? { background: '#efefef', color: '#000000', darkBackground: '#6b6b6b', darkColor: '#ffffff' };
    if (!sources.color) values.color = used === 'dark' ? (b.darkColor ?? 'ua') : b.color;
    if (!sources['background-color']) values['background-color'] = used === 'dark' ? (b.darkBackground ?? 'ua') : b.background;
  }
  // position: fixed is laid out as absolute against the viewport; the engine admits it for the accessibility and
  // integrity checks only (at scroll position 0) and keeps every other proof Unknown.
  if (values.position === 'fixed') { values.position = 'absolute'; values.$fixed = true; }
  // position: sticky with top: 0 is laid out in flow (as relative, unshifted at scroll 0); the accessibility scroll rules
  // treat it as a bar stuck to the viewport top while its parent is in view.
  // The winning text-wrap-mode folds into white-space (nowrap ↔ normal, pre ↔ pre-wrap); pre-line and break-spaces
  // have no nowrap keyword, so that combination is left for the engine to reject.
  const wrapMode = values['text-wrap-mode'], ws = values['white-space'];
  if (wrapMode === 'nowrap') values['white-space'] = ({ normal: 'nowrap', 'pre-wrap': 'pre', nowrap: 'nowrap', pre: 'pre' })[ws] ?? `${ws}+nowrap`;
  else if (wrapMode === 'wrap') values['white-space'] = ({ nowrap: 'normal', pre: 'pre-wrap' })[ws] ?? ws;
  // letter-spacing in em computes to px against the element's own font-size (then inherits as px).
  const em = /^(-?\d+(?:\.\d{1,6})?)em$/.exec(String(values['letter-spacing'] ?? ''));
  if (em) values['letter-spacing'] = /^\d+(?:\.\d{1,6})?px$/.test(values['font-size']) ? `${+(Number(em[1]) * Number(values['font-size'].slice(0, -2))).toFixed(6)}px` : 'em-unresolved';
  // $stacks: sticky makes a stacking context whatever its insets (measured in Chromium), even where it never sticks.
  if (values.position === 'sticky') { values.position = 'relative'; values.$sticky = true; values.$stacks = true; }
  // rem box lengths compute to px once the root font size is known (setRootFontSize), so every px-only check sees
  // them as px; a value with more than 6 decimals stays rem (Unknown where it is used).
  if (rootFontSize) for (const key of remLengths) {
    const m = /^(\d+(?:\.\d{1,6})?)rem$/.exec(String(values[key] ?? ''));
    if (!m) continue;
    const v = mul(q(m[1]), rootFontSize), text = number(v);
    if (/^\d+(?:\.\d{1,6})?$/.test(text)) values[key] = text === '0' ? '0' : `${text}px`;
  }
  // em box lengths (checklist D2) compute to px against the element's own px font-size, as rem does against the root's.
  // (font-size in em is relative to the parent's and is left as it is.)
  if (/^\d+(?:\.\d{1,6})?px$/.test(String(values['font-size']))) for (const key of remLengths.filter(k => k !== 'font-size')) {
    const m = /^(\d+(?:\.\d{1,6})?)em$/.exec(String(values[key] ?? ''));
    if (!m) continue;
    const v = mul(q(m[1]), q(values['font-size'].slice(0, -2))), text = number(v);
    if (/^\d+(?:\.\d{1,6})?$/.test(text)) values[key] = text === '0' ? '0' : `${text}px`;
  }
  // An em length left over (the font-size is not px): Unknown, attributed to the declaration that set it.
  for (const key of remLengths.filter(k => k !== 'font-size')) if (/^\d+(?:\.\d{1,6})?em$/.test(String(values[key] ?? '')))
    throw Object.assign(new Error(`${key}: ${values[key]} needs a px font-size to resolve (font-size is ${values['font-size']})`), { code: 'U_LAYOUT_CSS', css: sources[key] ? { file: sources[key].file, line: sources[key].line } : undefined });
  // A list's UA padding-inline-start is 40px (Chromium's UA sheet): on the left in ltr, on the right in rtl.
  if (['ul', 'ol'].includes(box.tag) && values['padding-left'] === 'ua') {
    values['padding-left'] = values.direction === 'rtl' ? '0' : '40px';
    if (values.direction === 'rtl' && !sources['padding-right']) values['padding-right'] = '40px';
  }
  // A side's used border width from its authored width and style (border-width / border-style longhands or the
  // border shorthand, whichever the cascade left): style none or hidden draws nothing; an unset width is medium (3px);
  // an unset style is the initial none. Sides no author rule touched keep their value (UA borders stay 'ua').
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const bw = `$bw-${side}`, bs = `$bs-${side}`;
    if (!sources[bw] && !sources[bs]) { delete values[bw]; delete values[bs]; continue; }
    // A control's UA border has a style of its own (known widths from a UA profile included): an author width alone
    // keeps that style and draws at the author width (a reset's border-width: 1px on a textarea).
    const uaStyled = values[`border-${side}`] === 'ua' || (values.$uaBorder && !['0', '0px'].includes(String(values[`border-${side}`])));
    const style = sources[bs] ? values[bs] : (uaStyled ? 'ua' : 'none');
    const width = sources[bw] ? values[bw] : (uaStyled ? values[`border-${side}`] : '3px');
    values[`border-${side}`] = ['none', 'hidden'].includes(style) ? '0' : String(width) === '0' ? '0' : width;
    const later = [sources[bw], sources[bs]].filter(Boolean).at(-1);
    sources[`border-${side}`] = later;
    delete values[bw]; delete values[bs];
  }
  // The used transform: translate · rotate · scale · transform (CSS Transforms 2 §6), each an affine map
  // x ↦ A·x + t + W·u + H·w + em·e + rem·r; composing P after T gives A_P·A_T and A_P·(each T offset) + P's offsets.
  const individual = ['translate', 'rotate', 'scale'].filter(key => values[key] && values[key] !== 'none' && !wide.has(values[key]));
  if (individual.length) {
    const maps = [...individual.map(key => values[key]), ...(values.transform && values.transform !== 'none' ? [values.transform] : [])];
    if (maps.some(m => /^(?:rotate|linear)-any\(/.test(String(m)))) {
      values.transform = maps.length === 1 ? maps[0] : linearAny(maps, individual.join(', '));
    } else {
      const parse = m => /^affine\((.+)\)$/.exec(m)[1].split(' ').map(x => { const [n, d = '1'] = x.split('/'); return div(q(n), q(d)); });
      const compose = (P, T) => {
        const [a, b, c, d] = P, lin = (x, y) => [add(mul(a, x), mul(b, y)), add(mul(c, x), mul(d, y))];
        const A = [add(mul(a, T[0]), mul(b, T[2])), add(mul(a, T[1]), mul(b, T[3])), add(mul(c, T[0]), mul(d, T[2])), add(mul(c, T[1]), mul(d, T[3]))];
        const offsets = [4, 6, 8, 10, 12].flatMap(i => { const [x, y] = lin(T[i], T[i + 1]); return [add(x, P[i]), add(y, P[i + 1])]; });
        return [...A, ...offsets];
      };
      values.transform = `affine(${maps.map(parse).reduce((P, T) => compose(P, T)).map(exact).join(' ')})`;
    }
  }
  // transform-origin (checklist B3): about O the map is O + A(p − O) + t = C + A(p − C) + t + (I − A)(O − C), so the
  // map about the centre C takes the extra translation (I − A)(O − C), where O − C = (px + (f − ½)·W, px + (f − ½)·H).
  const origin = /^origin\((\S+) (\S+) (\S+) (\S+)\)$/.exec(String(values['transform-origin'] ?? ''));
  if (origin && values.transform && values.transform !== 'none' && !(Number(origin[1]) === 0 && Number(origin[2]) === 0.5 && Number(origin[3]) === 0 && Number(origin[4]) === 0.5)) {
    const [ox, fx, oy, fy] = origin.slice(1).map(Number);
    if (/^affine\(/.test(values.transform)) {
      const m = /^affine\((.+)\)$/.exec(values.transform)[1].split(' ').map(x => { const [n, d = '1'] = x.split('/'); return div(q(n), q(d)); });
      const [a, b, c, d] = m, I = q(1), neg = v => mul(v, q(-1)), num = v => q((Math.round(v * 1e6) / 1e6).toFixed(6));
      const vx = [num(ox), add(num(fx), q('-0.5')), q(0)], vy = [num(oy), q(0), add(num(fy), q('-0.5'))];
      // d_x = (1 − a)·v_x − b·v_y, d_y = −c·v_x + (1 − d)·v_y, for the px, W and H parts.
      const dx = [0, 1, 2].map(k => add(mul(add(I, neg(a)), vx[k]), mul(neg(b), vy[k]))), dy = [0, 1, 2].map(k => add(mul(neg(c), vx[k]), mul(add(I, neg(d)), vy[k])));
      m[4] = add(m[4], dx[0]); m[5] = add(m[5], dy[0]); m[6] = add(m[6], dx[1]); m[7] = add(m[7], dy[1]); m[8] = add(m[8], dx[2]); m[9] = add(m[9], dy[2]);
      values.transform = `affine(${m.map(exact).join(' ')})`;
    } else {
      const m = floatMap(values.transform), [a, b, c, d] = m;
      const vx = [ox, fx - 0.5, 0], vy = [oy, 0, fy - 0.5];
      const dx = [0, 1, 2].map(k => (1 - a) * vx[k] - b * vy[k]), dy = [0, 1, 2].map(k => -c * vx[k] + (1 - d) * vy[k]);
      m[4] += dx[0]; m[5] += dy[0]; m[6] += dx[1]; m[7] += dy[1]; m[8] += dx[2]; m[9] += dy[2];
      values.transform = linearAny([`linear-any(${m.join(' ')})`], 'transform-origin');
    }
  }
  values.$sources = sources;
  values.$dormant = dormant;
  values.$overridden = overridden;
  values.$invalid = invalid;
  values.$variables = environment;
  const nonscroll = value => ['visible', 'clip'].includes(value);
  const x = values['overflow-x'], y = values['overflow-y'];
  if (!nonscroll(y)) values['overflow-x'] = x === 'visible' ? 'auto' : x === 'clip' ? 'hidden' : x;
  if (!nonscroll(x)) values['overflow-y'] = y === 'visible' ? 'auto' : y === 'clip' ? 'hidden' : y;
  // A logical side was taken as ltr; in an rtl box cascade again with the sides flipped.
  if (!rtl && flipped && values.direction === 'rtl') return computeStyle(rules, box, active, inherited, {spend, state, rtl: true});
  return values;
}
