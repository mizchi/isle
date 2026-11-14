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
//   empty-heading    → E_A11Y_EMPTY_HEADING     an exposed h1–h6 with no rendered text and no name attribute
//   heading-order    → W_A11Y_HEADING_ORDER     a skipped level among the headings that render (per media region)
//   nested-interactive → E_A11Y_NESTED_INTERACTIVE a rendered button/link inside another
//   duplicate-id     → E_A11Y_DUPLICATE_ID      two elements share an id (DOM, every width)
//   aria-reference   → E_A11Y_REFERENCE         aria-labelledby/describedby/controls names a missing id
//   positive-tabindex → W_A11Y_POSITIVE_TABINDEX tabindex > 0 reorders focus away from the DOM
//   multiple-main    → W_A11Y_MULTIPLE_MAIN     more than one main element renders at once
//   scrollable-region-focusable → E_A11Y_SCROLL_FOCUS  content overflows a scroll container that nothing focusable reaches
//   reflow           → E_A11Y_REFLOW            the page scrolls horizontally at 320 CSS px or narrower (SC 1.4.10)
//   focus-obscured   → E_A11Y_FOCUS_OBSCURED    a focusable box entirely covered by a later painted box (SC 2.4.11)
//   focus-area       → E_A11Y_FOCUS_AREA        a visible focusable box with a zero-size border box
//   pointer-disabled → E_A11Y_POINTER_DISABLED  a visible button/link that pointer-events: none makes unclickable
//   small-text       → W_A11Y_SMALL_TEXT        rendered text below 12px
//   image-alt        → E_A11Y_IMAGE_ALT         a rendered img without alt (alt="" marks it decorative)
//   form-label       → E_A11Y_LABEL             a field with no label, aria name or title (W_A11Y_PLACEHOLDER_LABEL: placeholder only)
//   label-for        → E_A11Y_LABEL_FOR         label[for] names no labelable element
//   list-structure   → E_A11Y_LIST              a rendered li outside ul/ol, or a list child that is not li
//   radio-group      → W_A11Y_RADIO_GROUP       same-name radios rendered outside a fieldset or radiogroup/group role
//   landmark-name    → W_A11Y_LANDMARK_NAME     two navigation landmarks render at once and not both are named
//   role-valid       → E_A11Y_ROLE              a role token that is not a WAI-ARIA role
//   interactive-role-focusable → E_A11Y_ROLE_FOCUS a rendered element with an interactive role that cannot take focus
//   link-in-text-block → E_A11Y_LINK_IN_TEXT    a link inside text with no underline and under 3:1 against the text (SC 1.4.1)
//   table-headers    → E_A11Y_TABLE_HEADERS     a table's th exist but none renders where data cells do (W_A11Y_TABLE_HEADERS: no th at all)
//   td-headers       → E_A11Y_TABLE_HEADERS_REF td/th headers= names no th of the same table
//   fieldset-name    → W_A11Y_FIELDSET_NAME     a rendered fieldset with no legend or name
//   label-in-name    → E_A11Y_LABEL_IN_NAME     an aria-label that does not contain the control's visible text (SC 2.5.3)
//   link-purpose     → W_A11Y_LINK_PURPOSE      two links with the same name to different hrefs render together
//   link-text        → W_A11Y_LINK_TEXT         generic link text (click here, read more, こちら, …)
//   role-parent / role-children → E_A11Y_ROLE_PARENT / E_A11Y_ROLE_CHILDREN  required ARIA context (WAI-ARIA 1.2)
//   role-attr        → E_A11Y_ROLE_ATTR         a required state for the role (aria-checked, aria-valuenow, …)
//   aria-attr / aria-value → E_A11Y_ARIA_ATTR / E_A11Y_ARIA_VALUE  unknown aria-* names, invalid true/false/mixed values
//   presentation-conflict → E_A11Y_PRESENTATION_CONFLICT role none/presentation on a focusable or ARIA-labelled element
//   empty-th         → E_A11Y_EMPTY_TH          a rendered th with no visible text or name
//   redundant-alt    → W_A11Y_REDUNDANT_ALT     an image alt that repeats the text next to it
//   title-only       → W_A11Y_TITLE_ONLY        a field named only by its title
//   input-button-name → E_A11Y_INPUT_BUTTON_NAME input type=button with no value
//   autocomplete     → E_A11Y_AUTOCOMPLETE      tokens outside the HTML autofill grammar (SC 1.3.5)
//   scope            → E_A11Y_SCOPE             scope on a td, or not row/col/rowgroup/colgroup
//   html-lang / lang-valid → E_A11Y_HTML_LANG / E_A11Y_LANG_VALID  a document without lang, or an invalid language tag (SC 3.1.1)
//   page-h1 / region / bypass → W_A11Y_PAGE_H1 / W_A11Y_REGION / W_A11Y_BYPASS  page roots: no rendered h1, text outside landmarks, no skip link before navigation
//   landmark-top-level / duplicate-landmark → W_A11Y_LANDMARK_TOP_LEVEL / W_A11Y_DUPLICATE_LANDMARK
//   p-as-heading     → W_A11Y_P_AS_HEADING      a paragraph styled as a heading (bold or larger) before ordinary text
//   orientation      → E_A11Y_ORIENTATION       main content only renders in one orientation (SC 1.3.4)
//   focus-visible    → E_A11Y_FOCUS_VISIBLE     focus shows no change: outline removed, no box-shadow/color/background change (SC 2.4.7)
//   text-spacing     → E_A11Y_TEXT_SPACING      clipped text that no longer fits at line-height 1.5 × font size (SC 1.4.12)
//   state-contrast   → E_A11Y_STATE_CONTRAST    text contrast in the :hover or :focus paint of a control
//   frame-title      → E_A11Y_FRAME_TITLE       a rendered iframe without a title or name (SC 4.1.2)
//   video-caption    → E_A11Y_VIDEO_CAPTION     a rendered video without a captions/subtitles track (SC 1.2.2)
//   autoplay-audio   → W_A11Y_AUTOPLAY_AUDIO    autoplaying media that is not muted (SC 1.4.2)
//   hover-only       → E_A11Y_HOVER_ONLY        a control hidden (opacity 0 / visibility hidden) that :hover reveals and focus does not
//   clickable-look   → W_A11Y_CLICK_LOOK        cursor: pointer set on an element that is neither focusable nor interactive (SC 2.1.1)
//   list-style-semantics → W_A11Y_LIST_STYLE   ul/ol with list-style-type: none and no role=list (WebKit drops the list role)
//   motion           → W_A11Y_MOTION            an animation running over 5s that prefers-reduced-motion: reduce does not stop (SC 2.2.2, 2.3.3)
//   blink            → E_A11Y_BLINK             rendered marquee/blink (SC 2.2.2)
//   definition-list  → E_A11Y_DL                dl children other than dt/dd/div groups, or dt/dd outside dl
//   accesskeys       → W_A11Y_ACCESSKEY         the same accesskey on more than one element
//   server-side-image-map → W_A11Y_ISMAP       img ismap needs a pointer (SC 2.1.1)
//   aria-hidden-body → E_A11Y_ARIA_HIDDEN_BODY  aria-hidden="true" on body hides the whole document
//   target-size      → E_A11Y_TARGET_SIZE       SC 2.5.8: under 24px, and its 24px circle meets another target or undersized circle
import { exact, number } from './linear.mjs';
import { scalar, sum, diff, times, sample, clip, serialize, width as domainWidth, height } from './region.mjs';
import { languageTag } from './text-font.mjs';
import { q, add, mul, cmp, div } from './linear.mjs';
import { intersect } from './integrity.mjs';

export const accessibilityRules = ['accessible-name', 'text-contrast', 'occluded-target', 'target-overlap', 'visual-order', 'hidden-focusable',
  'empty-heading', 'heading-order', 'nested-interactive', 'duplicate-id', 'aria-reference', 'positive-tabindex', 'multiple-main',
  'scrollable-region-focusable', 'reflow', 'focus-obscured', 'focus-area', 'pointer-disabled', 'small-text', 'target-size', 'image-alt', 'form-label', 'label-for', 'list-structure', 'radio-group', 'landmark-name', 'role-valid', 'interactive-role-focusable', 'link-in-text-block', 'table-headers', 'td-headers', 'fieldset-name', 'label-in-name', 'link-purpose', 'link-text',
  'role-parent', 'role-children', 'role-attr', 'aria-attr', 'aria-value', 'presentation-conflict', 'empty-th', 'redundant-alt', 'title-only', 'input-button-name', 'autocomplete', 'scope',
  'html-lang', 'lang-valid', 'page-h1', 'region', 'bypass', 'landmark-top-level', 'duplicate-landmark', 'p-as-heading', 'orientation', 'focus-visible', 'text-spacing', 'state-contrast', 'frame-title', 'video-caption', 'autoplay-audio', 'hover-only',
  'clickable-look', 'list-style-semantics', 'motion', 'blink', 'definition-list', 'accesskeys', 'server-side-image-map', 'aria-hidden-body'];

// --- colors (CSS Color 4 subset) ------------------------------------------
const named = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', aqua: '#00ffff',
  magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000', olive: '#808000', lime: '#00ff00',
  teal: '#008080', navy: '#000080', purple: '#800080', orange: '#ffa500', darkgray: '#a9a9a9', darkgrey: '#a9a9a9', lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3', dimgray: '#696969', dimgrey: '#696969', gainsboro: '#dcdcdc', whitesmoke: '#f5f5f5', darkblue: '#00008b', darkred: '#8b0000',
  darkgreen: '#006400', rebeccapurple: '#663399', brown: '#a52a2a', pink: '#ffc0cb', gold: '#ffd700', indigo: '#4b0082', crimson: '#dc143c',
  // System colors in the light scheme; author Canvas/CanvasText resolve per used color-scheme in the cascade.
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
    visibility: style.visibility, pointerEvents: style['pointer-events'], fontSize: style['font-size'], fontWeight: style['font-weight'], position: style.position, decoration: style['text-decoration-line'],
    outlineStyle: style['outline-style'], outlineWidth: style['outline-width'], boxShadow: style['box-shadow'], cursor: style.cursor, listStyleType: style['list-style-type'],
    animation: style['animation-name'] === 'none' ? null : { name: style['animation-name'], duration: style['animation-duration'], count: style['animation-iteration-count'], playState: style['animation-play-state'] } };
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
  // ADR-0007: no implicit black-on-white. The UA text and canvas colors depend on the user's color scheme.
  if (String(self.color).toLowerCase() === 'canvastext') return { unknown: 'the text color is the user-agent default (canvastext); declare color' };
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
  if (!bg) return { unknown: 'no ancestor has an opaque background color; the canvas color depends on the user agent' };
  // Composite translucent layers bottom-up over the opaque one.
  let base = bg;
  for (const layer of layers.slice(0, bg ? -1 : undefined).reverse()) base = over(layer.color, base);
  return { fg: over(fg, base), bg: base, opaqueAt: bg ? layers.at(-1).index : -1 };
}
const px = value => { const m = /^(\d+(?:\.\d+)?)px$/.exec(String(value)); return m ? Number(m[1]) : undefined; };
const weight = value => value === 'bold' ? 700 : /^\d+$/.test(String(value)) ? Number(value) : 400;
// Large text: at least 18pt (24px), or 14pt (56/3 px) bold. An unknown size is not large (the stricter ratio).
const large = facts => { const size = px(facts.fontSize); return size !== undefined && (size >= 24 || (size >= 56 / 3 && weight(facts.fontWeight) >= 700)); };

// Accessible-name text comparison: case and white space folded.
const normalize = text => String(text).toLowerCase().replace(/\s+/g, ' ').trim();

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
  // An empty box overlaps nothing: both boxes need a positive area.
  for (const size of [a.inline, a.block, b.inline, b.block]) region = below(region, scalar(0), size);
  return region;
}

// --- circles (SC 2.5.8 spacing) -------------------------------------------
// Rational unit normals in the first quadrant (Pythagorean triples), at most
// about 2.5° apart. The circle of radius r lies between the polygon
// {n·p < r·c} (c a rational lower bound of cos(gap/2): inside the circle) and
// {n·p < r} (circumscribed: outside it, the point is outside the circle).
const normals = (() => {
  const found = [[q(1), q(0), 0], [q(0), q(1), Math.PI / 2]];
  for (let k = 1; k < 36; k++) {
    const target = k * Math.PI / 72;
    let best = null;
    for (let m = 2; m <= 80; m++) for (let n = 1; n < m; n++) {
      const angle = Math.atan2(2 * m * n, m * m - n * n);
      if (!best || Math.abs(angle - target) < Math.abs(best.angle - target)) best = { m, n, angle };
    }
    const d = BigInt(best.m * best.m + best.n * best.n);
    found.push([div(q(best.m * best.m - best.n * best.n), q(Number(d))), div(q(2 * best.m * best.n), q(Number(d))), best.angle]);
  }
  found.sort((a, b) => a[2] - b[2]);
  let gap = 0; for (let i = 1; i < found.length; i++) gap = Math.max(gap, found[i][2] - found[i - 1][2]);
  return { list: found.map(([a, b]) => [a, b]), cosine: q((Math.floor(Math.cos(gap / 2) * 1e6) - 1) / 1e6) };
})();
const isZero = a => !cmp(a.x, q(0)) && !cmp(a.y, q(0)) && !cmp(a.b, q(0));
const isConstant = a => !cmp(a.x, q(0)) && !cmp(a.y, q(0));
/**
 * Where the point (dx, dy) — affine in the viewport — is strictly inside the
 * circle of radius r: {yes} proven inside, {maybe} not decided (a thin band
 * at the circle when both offsets vary). Exact when an offset is constant zero
 * or both are constants.
 */
export function circleReach(region, dx, dy, r) {
  const yes = [], maybe = [];
  for (const [sx, px] of [[1, dx], [-1, times(dx, q(-1))]]) {
    const a = sx > 0 ? clip(region, px) : clip(region, px, true); // |dx| as px ≥ 0
    if (!a) continue;
    for (const [sy, py] of [[1, dy], [-1, times(dy, q(-1))]]) {
      const piece = sy > 0 ? clip(a, py) : clip(a, py, true);
      if (!piece) continue;
      if (isConstant(px) && isConstant(py)) {
        if (cmp(add(mul(px.b, px.b), mul(py.b, py.b)), mul(r, r)) < 0) yes.push(piece);
        continue;
      }
      if (isZero(px) || isZero(py)) { const one = below(piece, isZero(px) ? py : px, scalar(r)); if (one) yes.push(one); continue; }
      const dot = ([na, nb]) => sum(times(px, na), times(py, nb));
      let inner = piece, outer = piece;
      for (const n of normals.list) { inner = inner && below(inner, dot(n), scalar(mul(r, normals.cosine))); outer = outer && below(outer, dot(n), scalar(r)); }
      if (inner) yes.push(inner);
      if (outer) maybe.push(...(inner ? subtract(outer, inner) : [outer]));
    }
  }
  return { yes, maybe };
}

export function judgeAccessibility({ geometry, waived = [], root, domain }, { contrast = 'AA', targetLevel = 'AA', targetSize = targetLevel === 'AAA' ? 44 : 24, ranges, block, viewportMin }) {
  const findings = [], warnings = [], unknowns = [], notes = [], exempted = [];
  const witness = region => { const p = sample(region); return { viewport: number(p.x), viewportExact: exact(p.x), ...(block ? { viewportHeight: number(p.y), viewportHeightExact: exact(p.y) } : {}) }; };
  // `region` keeps the exact constraints: a 2-D region (e.g. width > height) is not the product of its two ranges.
  const report = (list, code, severity, message, row, region, extra) => list.push({ code, severity, message, box: row.box.label, path: row.path, source: row.box.source, ...ranges(region), ...(block ? { regionConstraints: serialize(region).constraints } : {}), witness: witness(region), ...extra });
  const visible = row => row.paint.visibility === 'visible';
  // Interactive: buttons, links with href (or a dynamic one), and form fields (not type=hidden or disabled-hidden).
  const field = box => ['select', 'textarea'].includes(box.tag) || (box.tag === 'input' && box.inputType !== 'hidden');
  // Widget roles that need focus and a name (WAI-ARIA 1.2), on any element.
  const widgetRoles = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'slider', 'spinbutton', 'textbox', 'searchbox', 'combobox', 'treeitem', 'gridcell']);
  const roleOf = box => box.role && box.role !== 'dynamic' ? box.role.split(/\s+/)[0] : undefined;
  const control = row => row.box.tag === 'button' || (row.box.tag === 'a' && row.box.focusable !== false) || widgetRoles.has(roleOf(row.box));
  const interactive = row => control(row) || field(row.box);
  const placed = geometry.filter(row => row.origin && row.block);
  const boxes = new Map(geometry.map(row => [row.path, row.box]));
  // aria-hidden on any ancestor in the box tree (display: contents elements have no geometry row).
  const treeBoxes = new Map(); (function walk(box) { treeBoxes.set(box.path, box); for (const child of [...(box.children ?? []), ...(box.inline ?? [])]) walk(child); })(root);
  const hiddenFrom = path => { for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') if (treeBoxes.get(p)?.ariaHidden) return true; return false; };

  // accessible-name: no name attribute, and no visible text rendered inside.
  // aria-labelledby names through the text of the referenced elements, rendered or not (accname 2.B).
  const byId = new Map();
  (function walk(box) { if (box.id && !byId.has(box.id)) byId.set(box.id, box); for (const child of box.children ?? []) walk(child); })(root);
  const hasText = box => box.text || (box.named === true) || (box.tag === 'img' && box.alt && box.alt !== 'dynamic') || (box.children ?? []).some(hasText);
  // Name from content: rendered, visible text leaves and images with a non-empty alt.
  const speaks = row => (row.box.text || (row.box.tag === 'img' && row.box.alt && row.box.alt !== 'dynamic')) && visible(row);
  const nameOf = box => {
    if (box.named === true) return true;
    if (box.labelledBy === 'dynamic') return 'dynamic';
    if (box.labelledBy?.some(id => byId.has(id) && hasText(byId.get(id)))) return true;
    return box.named;
  };
  // Hidden targets (visibility, or aria-hidden content) are not exposed and need no name.
  // Roles that require a name even when not focusable (WAI-ARIA 1.2 name required).
  const namedRoles = new Set(['img', 'dialog', 'alertdialog', 'progressbar', 'meter', 'tooltip', 'tree', 'treegrid', 'grid', 'table', 'radiogroup', 'listbox', 'menu', 'menubar', 'tablist', 'toolbar', 'region', 'form']);
  for (const target of geometry.filter(row => (control(row) || (row.box.role && namedRoles.has(roleOf(row.box)) && ['img', 'dialog', 'alertdialog', 'progressbar', 'meter', 'tooltip'].includes(roleOf(row.box)))) && visible(row) && nameOf(row.box) !== true && !hiddenFrom(row.path))) {
    const texts = geometry.filter(row => speaks(row) && (row.path === target.path || isAncestor(target.path, row.path)));
    let missing = [target.region];
    for (const text of texts) missing = missing.flatMap(region => subtract(region, text.region));
    // A dynamic name attribute may be empty: Unknown where no text names the target.
    if (nameOf(target.box) === 'dynamic') { for (const region of missing) report(unknowns, 'U_A11Y_NAME', 'unknown', `${target.box.label} is named only by a dynamic attribute, which may be empty`, target, region, { rule: 'accessible-name' }); continue; }
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
    // Floating-point luminance: a ratio within numeric error of the threshold is not decided (ADR-0007).
    if (Math.abs(ratio - required) < 1e-9) { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${text.box.label} has contrast ${ratio}:1, at the ${required}:1 threshold within numeric error`, text, text.region, { rule: 'text-contrast', ratio, required }); continue; }
    if (ratio < required) report(findings, 'E_A11Y_CONTRAST', 'error', `${text.box.label} has contrast ${ratio.toFixed(2)}:1, below ${required}:1`, text, text.region,
      { rule: 'text-contrast', ratio, required, foreground: result.fg, background: result.bg });
  }

  // occluded-target: a hit-testable box from a later paint layer covers a target.
  const layer = row => { for (let p = row.path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const r = geometry.find(g => g.path === p); if (r && r.position !== 'static') return p; } return null; };
  const paintsAbove = (cover, above, target, own) => {
    if (!above) return !own && treeOrder(cover.path, target.path) > 0;
    return !(own && (isAncestor(above, own) || above === own || treeOrder(above, own) < 0));
  };
  const targets = placed.filter(row => interactive(row) && visible(row));
  for (const target of targets) {
    const own = layer(target);
    for (const cover of placed) {
      if (related(cover.path, target.path) || !visible(cover) || cover.paint.pointerEvents === 'none') continue;
      const above = layer(cover);
      // Positioned layers paint after in-flow content, and among themselves in tree order (z-index is not modeled);
      // two in-flow block boxes paint (and hit-test) in tree order, the later one on top.
      if (!paintsAbove(cover, above, target, own)) continue;
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
  const hidden = path => { let found = false; for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const value = treeBoxes.get(p)?.ariaHidden; if (value === true) return true; if (value) found = 'dynamic'; } return found; };
  for (const row of geometry.filter(row => (row.box.focusable ?? row.box.tag === 'button') && visible(row))) {
    const under = hidden(row.path);
    if (!under) continue;
    if (under === 'dynamic' || row.box.focusable === 'dynamic') report(unknowns, 'U_A11Y_HIDDEN_FOCUSABLE', 'unknown', `${row.box.label}: a dynamic aria-hidden or tabindex decides whether it can take focus inside hidden content`, row, row.region, { rule: 'hidden-focusable' });
    else report(findings, 'E_A11Y_HIDDEN_FOCUSABLE', 'error', `${row.box.label} can take focus inside aria-hidden content`, row, row.region, { rule: 'hidden-focusable' });
  }

  // empty-heading: like accessible-name, for exposed headings.
  const level = row => /^h([1-6])$/.exec(row.box.tag)?.[1];
  const headings = geometry.filter(row => level(row) && visible(row) && !hiddenFrom(row.path));
  for (const head of headings.filter(row => nameOf(row.box) !== true)) {
    let missing = [head.region];
    for (const text of geometry.filter(row => row.box.text && visible(row) && (row.path === head.path || isAncestor(head.path, row.path)))) missing = missing.flatMap(region => subtract(region, text.region));
    const dynamic = nameOf(head.box) === 'dynamic';
    for (const region of missing) report(dynamic ? unknowns : findings, dynamic ? 'U_A11Y_EMPTY_HEADING' : 'E_A11Y_EMPTY_HEADING', dynamic ? 'unknown' : 'error',
      `${head.box.label} is an empty heading here`, head, region, { rule: 'empty-heading' });
  }

  // heading-order: b follows a with no rendered heading between them, and skips a level.
  const ordered = [...headings].sort((x, y) => treeOrder(x.path, y.path));
  for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
    const a = ordered[i], b = ordered[j];
    if (a.path === b.path || Number(level(b)) <= Number(level(a)) + 1) continue;
    let pieces = [intersect(a.region, b.region)].filter(Boolean);
    for (const between of ordered.slice(i + 1, j)) if (between.path !== a.path && between.path !== b.path) pieces = pieces.flatMap(region => subtract(region, between.region));
    for (const region of pieces) report(warnings, 'W_A11Y_HEADING_ORDER', 'warning', `${b.box.label} (h${level(b)}) follows h${level(a)} ${a.box.label}, skipping a level`, b, region, { rule: 'heading-order', previous: a.path });
  }

  // nested-interactive: an interactive element rendered inside another.
  for (const inner of geometry.filter(interactive)) for (const outer of geometry.filter(row => interactive(row) && isAncestor(row.path, inner.path))) {
    const region = intersect(inner.region, outer.region);
    if (region) report(findings, 'E_A11Y_NESTED_INTERACTIVE', 'error', `${inner.box.label} is interactive inside ${outer.box.label}`, inner, region, { rule: 'nested-interactive', outer: outer.path });
  }

  // DOM-only facts hold at every width: duplicate ids, dangling references, positive tabindex.
  const all = [];
  (function walk(box) { all.push(box); for (const child of box.children ?? []) walk(child); })(root);
  const ids = new Map();
  for (const box of all) if (box.id) ids.set(box.id, [...(ids.get(box.id) ?? []), box]);
  const whole = box => ({ box, path: box.path });
  for (const [id, owners] of ids) if (owners.length > 1) report(findings, 'E_A11Y_DUPLICATE_ID', 'error', `id ${JSON.stringify(id)} is used by ${owners.length} elements`, whole(owners[1]), domain, { rule: 'duplicate-id', id, first: owners[0].path });
  for (const box of all) {
    if (box.labelledBy === 'dynamic' && box.references === undefined) report(unknowns, 'U_A11Y_REFERENCE', 'unknown', `${box.label}: a dynamic aria-labelledby may name a missing id`, whole(box), domain, { rule: 'aria-reference' });
    if (box.references === 'dynamic') { report(unknowns, 'U_A11Y_REFERENCE', 'unknown', `${box.label}: a dynamic aria reference may name a missing id`, whole(box), domain, { rule: 'aria-reference' }); continue; }
    for (const reference of box.references ?? []) if (!ids.has(reference)) report(findings, 'E_A11Y_REFERENCE', 'error', `${box.label} references the missing id ${JSON.stringify(reference)}`, whole(box), domain, { rule: 'aria-reference', reference });
    if (box.tabIndex > 0) report(warnings, 'W_A11Y_POSITIVE_TABINDEX', 'warning', `${box.label} has tabindex ${box.tabIndex}, which moves it ahead of the DOM focus order`, whole(box), domain, { rule: 'positive-tabindex' });
  }

  // multiple-main: two main elements render at the same viewport.
  const mains = geometry.filter(row => row.box.tag === 'main' && visible(row) && !hiddenFrom(row.path));
  for (let i = 0; i < mains.length; i++) for (let j = i + 1; j < mains.length; j++) {
    if (mains[i].path === mains[j].path) continue;
    const region = intersect(mains[i].region, mains[j].region);
    if (region) report(warnings, 'W_A11Y_MULTIPLE_MAIN', 'warning', `${mains[j].box.label} renders as a second main landmark`, mains[j], region, { rule: 'multiple-main', first: mains[i].path });
  }

  // scrollable-region-focusable: where content overflows a scroll container, keyboard users need a focusable way in.
  const focusable = row => (row.box.focusable === true || (row.box.focusable ?? row.box.tag === 'button') === true || row.box.tabIndex >= 0) && visible(row);
  const byPath = new Map(geometry.map(row => [row.path, row]));
  const scroller = path => { for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') for (const row of geometry) if (row.path === p && row.overflow === 'scroll') return row; return null; };
  // Only overflow of the container's own content box is a proved scroll range; an item
  // overflowing its track inside it may still fit the container (Unknown).
  const overflowing = new Map();
  for (const entry of waived) {
    const container = scroller(entry.self ? entry.path : entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : entry.path);
    if (!container) continue;
    const definite = entry.self && entry.path === container.path;
    overflowing.set(container.path, [...(overflowing.get(container.path) ?? []), { region: entry.region, definite }]);
  }
  for (const [path, entries] of overflowing) {
    const container = byPath.get(path);
    if (focusable(container)) continue;
    const inner = geometry.filter(row => isAncestor(path, row.path) && focusable(row));
    for (const { region: start, definite } of entries) {
      let missing = [start];
      for (const row of inner) missing = missing.flatMap(region => subtract(region, row.region));
      for (const region of missing) report(definite ? findings : unknowns, definite ? 'E_A11Y_SCROLL_FOCUS' : 'U_A11Y_SCROLL_FOCUS', definite ? 'error' : 'unknown',
        definite ? `${container.box.label} scrolls here but neither it nor anything inside it can take focus` : `${container.box.label} may scroll here (an item overflows its track) and nothing inside it can take focus`, container, region, { rule: 'scrollable-region-focusable' });
    }
  }

  // reflow: no horizontal page scrolling at 320 CSS px (or narrower widths in the domain).
  if (viewportMin !== undefined && viewportMin > 320) notes.push('reflow: the viewport domain starts above 320px, so SC 1.4.10 at 320 CSS px is not checked');
  for (const row of placed) {
    const narrow = row.region && clip(row.region, diff(scalar(320), domainWidth));
    const failed = narrow && below(narrow, domainWidth, right(row));
    if (failed) report(findings, 'E_A11Y_REFLOW', 'error', `${row.box.label} makes the page scroll horizontally at 320 CSS px`, row, failed, { rule: 'reflow' });
  }

  // focus-obscured: a later painted box contains a focusable box. focus-area: nothing to show focus on.
  for (const target of placed.filter(focusable)) {
    const own = layer(target);
    for (const cover of placed) {
      if (related(cover.path, target.path) || !visible(cover) || !cover.painted) continue;
      // A zero-size box is reported by focus-area, not as obscured.
      const above = layer(cover);
      if (!paintsAbove(cover, above, target, own)) continue;
      let region = intersect(target.region, cover.region);
      region = below(below(region, scalar(0), target.inline), scalar(0), target.block);
      region = atMost(region, cover.origin.inline, target.origin.inline); region = atMost(region, cover.origin.block, target.origin.block);
      region = atMost(region, right(target), right(cover)); region = atMost(region, bottom(target), bottom(cover));
      if (region) { report(findings, 'E_A11Y_FOCUS_OBSCURED', 'error', `${target.box.label} is entirely hidden behind ${cover.box.label} when focused`, target, region, { rule: 'focus-obscured', cover: cover.path }); break; }
    }
    for (const size of [target.inline, target.block]) {
      const region = atMost(target.region, size, scalar(0));
      if (region) { report(findings, 'E_A11Y_FOCUS_AREA', 'error', `${target.box.label} can take focus but has no area to show it`, target, region, { rule: 'focus-area' }); break; }
    }
  }

  // pointer-disabled: keyboard can reach it, a pointer cannot.
  for (const row of geometry.filter(row => interactive(row) && visible(row) && !hiddenFrom(row.path) && row.paint.pointerEvents === 'none'))
    report(findings, 'E_A11Y_POINTER_DISABLED', 'error', `${row.box.label} cannot be clicked: pointer-events is none here`, row, row.region, { rule: 'pointer-disabled' });

  // small-text: a px font size below 12 (relative sizes are not resolved here).
  for (const row of geometry.filter(row => row.box.text && visible(row))) {
    const size = px(row.paint.fontSize);
    if (size !== undefined && size < 12) report(warnings, 'W_A11Y_SMALL_TEXT', 'warning', `${row.box.label} is set at ${size}px`, row, row.region, { rule: 'small-text', fontSize: size });
  }

  // image-alt: every rendered, exposed image needs an alt attribute.
  for (const row of geometry.filter(row => row.box.tag === 'img' && visible(row) && !hiddenFrom(row.path))) {
    if (row.box.alt === 'dynamic') report(unknowns, 'U_A11Y_IMAGE_ALT', 'unknown', `${row.box.label}: a dynamic alt may be missing`, row, row.region, { rule: 'image-alt' });
    else if (row.box.alt === undefined) report(findings, 'E_A11Y_IMAGE_ALT', 'error', `${row.box.label} has no alt; use alt="" if it is decorative`, row, row.region, { rule: 'image-alt' });
  }

  // form-label: aria-label/title/labelledby, a wrapping label, or label[for] with text (HTML-AAM).
  const labels = []; (function walk(box) { if (box.tag === 'label') labels.push(box); for (const child of box.children ?? []) walk(child); })(root);
  const ancestorsOf = path => { const out = []; for (let p = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const box = boxOf.get(p); if (box) out.push(box); } return out; };
  const boxOf = new Map(); (function walk(box) { boxOf.set(box.path, box); for (const child of box.children ?? []) walk(child); })(root);
  for (const row of geometry.filter(row => field(row.box) && visible(row) && !hiddenFrom(row.path) && !['submit', 'reset', 'button', 'image'].includes(row.box.inputType))) {
    const box = row.box;
    const name = nameOf(box);
    const wrapped = ancestorsOf(row.path).find(a => a.tag === 'label');
    const pointed = box.id ? labels.filter(l => l.labelFor === box.id) : [];
    const dynamic = name === 'dynamic' || box.inputType === 'dynamic' || labels.some(l => l.labelFor === 'dynamic');
    if (name === true) { if (box.nameSource === 'title' && !wrapped && !pointed.length) report(warnings, 'W_A11Y_TITLE_ONLY', 'warning', `${box.label} is named only by its title, which is not shown persistently`, row, row.region, { rule: 'title-only' }); continue; }
    // A label names its field only where the label's text renders and is visible (Chromium; unlike aria-labelledby).
    let missing = [row.region];
    for (const label of [wrapped, ...pointed].filter(Boolean)) for (const text of geometry.filter(t => speaks(t) && t.box !== box && (t.path === label.path || isAncestor(label.path, t.path)) && !isAncestor(box.path, t.path)))
      missing = missing.flatMap(region => subtract(region, text.region));
    for (const region of missing) {
      if (dynamic) report(unknowns, 'U_A11Y_LABEL', 'unknown', `${box.label}: a dynamic name, type or label[for] decides whether it is labelled`, row, region, { rule: 'form-label' });
      else if (box.placeholder) report(warnings, 'W_A11Y_PLACEHOLDER_LABEL', 'warning', `${box.label} is named only by its placeholder here, which disappears on input`, row, region, { rule: 'form-label' });
      else report(findings, 'E_A11Y_LABEL', 'error', `${box.label} has no label here: add a visible <label>, aria-label, aria-labelledby or title`, row, region, { rule: 'form-label' });
    }
  }
  // label-for: the id must name a labelable element (button, input other than hidden, select, textarea, output).
  const labelable = box => box && (['button', 'select', 'textarea', 'output'].includes(box.tag) || (box.tag === 'input' && box.inputType !== 'hidden'));
  for (const label of labels.filter(l => l.labelFor !== undefined)) {
    if (label.labelFor === 'dynamic') { report(unknowns, 'U_A11Y_LABEL_FOR', 'unknown', `${label.label}: a dynamic for= may name no field`, whole(label), domain, { rule: 'label-for' }); continue; }
    if (!labelable(byId.get(label.labelFor))) report(findings, 'E_A11Y_LABEL_FOR', 'error', `${label.label} is for ${JSON.stringify(label.labelFor)}, which is not a labelable element`, whole(label), domain, { rule: 'label-for', reference: label.labelFor });
  }

  // list-structure: list semantics follow the DOM (CSS display does not change it here).
  for (const row of geometry.filter(row => visible(row) && !hiddenFrom(row.path))) {
    const parentBox = boxOf.get(row.path.slice(0, row.path.lastIndexOf('/')));
    if (row.box.tag === 'li' && !['ul', 'ol'].includes(parentBox?.tag)) report(findings, 'E_A11Y_LIST', 'error', `${row.box.label} is a list item outside ul/ol`, row, row.region, { rule: 'list-structure' });
    if (['ul', 'ol'].includes(row.box.tag) && (row.box.children ?? []).some(child => child.tag !== 'li')) report(findings, 'E_A11Y_LIST', 'error', `${row.box.label} has a child that is not li`, row, row.region, { rule: 'list-structure' });
  }

  // radio-group: radios sharing a name should be grouped (fieldset, or role=radiogroup/group).
  const radios = geometry.filter(row => row.box.tag === 'input' && row.box.inputType === 'radio' && row.box.inputName && row.box.inputName !== 'dynamic' && visible(row) && !hiddenFrom(row.path));
  const grouped = row => ancestorsOf(row.path).some(a => a.tag === 'fieldset' || ['radiogroup', 'group'].includes(a.role));
  for (let i = 0; i < radios.length; i++) for (let j = i + 1; j < radios.length; j++) {
    const a = radios[i], b = radios[j];
    if (a.path === b.path || a.box.inputName !== b.box.inputName || (grouped(a) && grouped(b))) continue;
    const region = intersect(a.region, b.region);
    if (region) report(warnings, 'W_A11Y_RADIO_GROUP', 'warning', `radios named ${JSON.stringify(a.box.inputName)} are not grouped in a fieldset or radiogroup`, b, region, { rule: 'radio-group', name: a.box.inputName });
  }

  // landmark-name: navigation landmarks rendered together need names that tell them apart.
  const navs = geometry.filter(row => (row.box.tag === 'nav' || row.box.role === 'navigation') && visible(row) && !hiddenFrom(row.path));
  for (let i = 0; i < navs.length; i++) for (let j = i + 1; j < navs.length; j++) {
    const a = navs[i], b = navs[j];
    const same = typeof a.box.ariaLabel === 'string' && typeof b.box.ariaLabel === 'string' && a.box.ariaLabel !== 'dynamic' && b.box.ariaLabel !== 'dynamic' && normalize(a.box.ariaLabel) === normalize(b.box.ariaLabel);
    if (a.path === b.path || (nameOf(a.box) === true && nameOf(b.box) === true && !same)) continue;
    const region = intersect(a.region, b.region);
    if (region) report(warnings, 'W_A11Y_LANDMARK_NAME', 'warning', `${b.box.label} and ${a.box.label} are navigation landmarks without names to tell them apart`, b, region, { rule: 'landmark-name', other: a.path });
  }

  // role-valid / interactive-role-focusable.
  const ariaRoles = new Set([...widgetRoles, 'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'caption', 'cell', 'code', 'columnheader', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory', 'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'group', 'heading', 'img', 'image', 'insertion', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'meter', 'navigation', 'none', 'note', 'paragraph', 'presentation', 'progressbar', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'separator', 'status', 'strong', 'subscript', 'superscript', 'table', 'tablist', 'tabpanel', 'term', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid']);
  for (const box of all) {
    if (box.role === 'dynamic') { report(unknowns, 'U_A11Y_ROLE', 'unknown', `${box.label}: a dynamic role decides its semantics`, whole(box), domain, { rule: 'role-valid' }); continue; }
    if (box.role && !ariaRoles.has(roleOf(box))) report(findings, 'E_A11Y_ROLE', 'error', `${box.label} has role ${JSON.stringify(roleOf(box))}, which is not a WAI-ARIA role`, whole(box), domain, { rule: 'role-valid', role: roleOf(box) });
  }
  for (const row of geometry.filter(row => widgetRoles.has(roleOf(row.box)) && visible(row) && !hiddenFrom(row.path)))
    if (!(row.box.focusable === true || row.box.tabIndex >= 0 || ['button', 'input', 'select', 'textarea'].includes(row.box.tag) || (row.box.tag === 'a' && row.box.focusable !== false)))
      report(findings, 'E_A11Y_ROLE_FOCUS', 'error', `${row.box.label} has role ${roleOf(row.box)} but cannot take focus; add tabindex="0"`, row, row.region, { rule: 'interactive-role-focusable' });

  // focus-area for inline content: an inline box with no text or image (and no horizontal edges, which
  // inline content requires) has no width.
  for (const row of geometry.filter(row => row.inlineFlow && focusable(row) && !hiddenFrom(row.path) && !hasText({ ...row.box, named: false })))
    report(findings, 'E_A11Y_FOCUS_AREA', 'error', `${row.box.label} can take focus but is an empty inline box with no area to show it`, row, row.region, { rule: 'focus-area' });

  // link-in-text-block: a link inside running text is told apart without color alone.
  for (const row of geometry.filter(row => row.inlineFlow && row.box.tag === 'a' && row.box.focusable !== false && visible(row) && !hiddenFrom(row.path))) {
    const leaf = row.chain.at(-2), own = row.chain.at(-1);
    const lines = value => String(value ?? 'none').split(/\s+/);
    if (lines(own.decoration).some(line => line !== 'none') && !lines(own.decoration).every(line => lines(leaf.decoration).includes(line))) continue;
    const link = parseColor(own.color), text = parseColor(leaf.color);
    if (!link || !text || String(own.color).toLowerCase() === 'canvastext') { report(unknowns, 'U_A11Y_LINK_IN_TEXT', 'unknown', `${row.box.label}: the link or text color is not a modeled color`, row, row.region, { rule: 'link-in-text-block' }); continue; }
    const backdropOf = backdrop(row.chain.slice(0, -1));
    if (backdropOf.unknown) { report(unknowns, 'U_A11Y_LINK_IN_TEXT', 'unknown', `${row.box.label}: ${backdropOf.unknown}`, row, row.region, { rule: 'link-in-text-block' }); continue; }
    const ratio = contrastRatio(over(link, backdropOf.bg), over(text, backdropOf.bg));
    if (ratio < 3) report(findings, 'E_A11Y_LINK_IN_TEXT', 'error', `${row.box.label} is told apart from the text only by color (${ratio.toFixed(2)}:1, below 3:1) and has no underline`, row, row.region, { rule: 'link-in-text-block', ratio });
  }

  // Tables: data cells need rendered headers; headers= must name th of the same table.
  const descendants = (box, test) => { const out = []; (function walk(b) { for (const child of b.children ?? []) { if (test(child)) out.push(child); if (child.tag !== 'table') walk(child); } })(box); return out; };
  const rowsFor = box => geometry.filter(row => row.box === box && visible(row));
  for (const tableBox of all.filter(box => box.tag === 'table' && !['presentation', 'none'].includes(roleOf(box)))) {
    const cells = descendants(tableBox, box => box.tag === 'td'), heads = descendants(tableBox, box => box.tag === 'th' || ['columnheader', 'rowheader'].includes(roleOf(box)));
    const tableRow = rowsFor(tableBox)[0] ?? { box: tableBox, path: tableBox.path };
    let missing = cells.flatMap(rowsFor).map(row => row.region);
    for (const head of heads) for (const row of rowsFor(head)) missing = missing.flatMap(region => subtract(region, row.region));
    for (const region of missing) report(heads.length ? findings : warnings, heads.length ? 'E_A11Y_TABLE_HEADERS' : 'W_A11Y_TABLE_HEADERS', heads.length ? 'error' : 'warning',
      heads.length ? `${tableBox.label} shows data cells here but none of its headers renders` : `${tableBox.label} has data cells and no th; mark headers, or role="presentation" for layout`, tableRow, region, { rule: 'table-headers' });
    const ids = new Set(heads.filter(head => head.tag === 'th' && head.id).map(head => head.id));
    for (const box of [...cells, ...heads]) {
      if (box.headers === 'dynamic') { report(unknowns, 'U_A11Y_TABLE_HEADERS_REF', 'unknown', `${box.label}: a dynamic headers= may name no th`, whole(box), domain, { rule: 'td-headers' }); continue; }
      for (const id of box.headers ?? []) if (!ids.has(id)) report(findings, 'E_A11Y_TABLE_HEADERS_REF', 'error', `${box.label} has headers=${JSON.stringify(id)}, which is not a th of this table`, whole(box), domain, { rule: 'td-headers', reference: id });
    }
  }

  // fieldset-name: a fieldset groups controls under a name (its legend, or aria-label/labelledby/title).
  for (const set of all.filter(box => box.tag === 'fieldset' && !hiddenFrom(box.path))) {
    if ((set.children ?? []).some(child => child.tag === 'legend') || nameOf(set) === true) continue;
    // Rendered where any descendant (or the fieldset itself) renders.
    const own = geometry.filter(row => row.path === set.path);
    for (const row of own.length ? own : geometry.filter(row => isAncestor(set.path, row.path) && visible(row) && !row.inlineFlow))
      report(warnings, 'W_A11Y_FIELDSET_NAME', 'warning', `${set.label} groups controls without a legend`, { box: set, path: set.path }, row.region, { rule: 'fieldset-name' });
  }

  // Text comparisons. A control's visible text: rendered, visible text rows in its subtree.
  const textRows = target => geometry.filter(row => row.box.text && visible(row) && (row.path === target.path || isAncestor(target.path, row.path)));
  for (const target of geometry.filter(row => control(row) && visible(row) && !hiddenFrom(row.path) && typeof row.box.ariaLabel === 'string')) {
    for (const text of textRows(target)) {
      const label = target.box.ariaLabel, words = text.box.textContent;
      if (label === 'dynamic' || words === 'dynamic') { const region = intersect(target.region, text.region); if (region) report(unknowns, 'U_A11Y_LABEL_IN_NAME', 'unknown', `${target.box.label}: a dynamic aria-label or text decides whether the name contains the visible text`, target, region, { rule: 'label-in-name' }); continue; }
      if (!words || normalize(label).includes(normalize(words))) continue;
      const region = intersect(target.region, text.region);
      if (region) report(findings, 'E_A11Y_LABEL_IN_NAME', 'error', `${target.box.label} is named ${JSON.stringify(label)}, which does not contain its visible text ${JSON.stringify(words)}`, target, region, { rule: 'label-in-name', visible: words });
    }
  }
  // A link's name as a string: aria-label, else its static text content (undefined when it cannot be known).
  const linkName = box => {
    if (box.ariaLabel !== undefined) return box.ariaLabel === 'dynamic' ? undefined : normalize(box.ariaLabel);
    const parts = []; let known = true;
    (function walk(b) { if (b.textContent === 'dynamic') known = false; else if (b.textContent) parts.push(b.textContent); for (const child of [...(b.inline ?? []), ...(b.children ?? [])]) walk(child); })(box);
    return known ? normalize(parts.join(' ')) : undefined;
  };
  const links = geometry.filter(row => row.box.tag === 'a' && typeof row.box.href === 'string' && row.box.href !== 'dynamic' && visible(row) && !hiddenFrom(row.path));
  for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) {
    const a = links[i], b = links[j], name = linkName(a.box);
    if (a.path === b.path || !name || name !== linkName(b.box) || a.box.href === b.box.href) continue;
    const region = intersect(a.region, b.region);
    if (region) report(warnings, 'W_A11Y_LINK_PURPOSE', 'warning', `${b.box.label} and ${a.box.label} are both named ${JSON.stringify(name)} but go to different places`, b, region, { rule: 'link-purpose', other: a.path });
  }
  const generic = /^(?:click here|here|read more|more|learn more|link|this|go|details|こちら|ここ|詳細|詳しくはこちら|もっと見る|続きを読む|クリック)$/;
  for (const row of links) { const name = linkName(row.box); if (name && generic.test(name)) report(warnings, 'W_A11Y_LINK_TEXT', 'warning', `${row.box.label} is named ${JSON.stringify(name)}, which does not say where it goes`, row, row.region, { rule: 'link-text' }); }

  // --- WAI-ARIA 1.2 structure and values ---
  const implicitRole = box => {
    const explicit = roleOf(box);
    if (explicit && ariaRoles.has(explicit)) return explicit;
    const t = box.tag;
    if (t === 'a') return box.focusable !== false ? 'link' : 'generic';
    if (/^h[1-6]$/.test(t)) return 'heading';
    if (t === 'input') return { checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button', reset: 'button', image: 'button', range: 'slider', search: 'searchbox' }[box.inputType] ?? 'textbox';
    return { button: 'button', nav: 'navigation', main: 'main', aside: 'complementary', article: 'article', ul: 'list', ol: 'list', li: 'listitem', table: 'table', thead: 'rowgroup', tbody: 'rowgroup', tfoot: 'rowgroup', tr: 'row', th: 'columnheader', td: 'cell', img: box.alt === '' ? 'presentation' : 'img', select: 'combobox', textarea: 'textbox', p: 'paragraph', fieldset: 'group', output: 'status' }[t] ?? 'generic';
  };
  const transparent = role => ['generic', 'none', 'presentation'].includes(role);
  const requiredParent = { listitem: ['list', 'directory'], option: ['listbox', 'group'], tab: ['tablist'], menuitem: ['menu', 'menubar', 'group'], menuitemcheckbox: ['menu', 'menubar', 'group'], menuitemradio: ['menu', 'menubar', 'group'], treeitem: ['tree', 'group'], row: ['table', 'grid', 'treegrid', 'rowgroup'], cell: ['row'], gridcell: ['row'], columnheader: ['row'], rowheader: ['row'], rowgroup: ['table', 'grid', 'treegrid'] };
  const requiredChildren = { list: ['listitem'], listbox: ['option', 'group'], tablist: ['tab'], menu: ['menuitem', 'menuitemcheckbox', 'menuitemradio', 'group', 'separator'], menubar: ['menuitem', 'menuitemcheckbox', 'menuitemradio', 'group', 'separator'], tree: ['treeitem', 'group'], grid: ['row', 'rowgroup'], table: ['row', 'rowgroup', 'caption'], row: ['cell', 'gridcell', 'columnheader', 'rowheader'] };
  const parentRole = box => { for (const a of ancestorsOf(box.path)) { const r = implicitRole(a); if (!transparent(r)) return r; } return null; };
  const ownedChildren = box => (box.children ?? []).flatMap(child => transparent(implicitRole(child)) && child.tag !== 'caption' ? ownedChildren(child) : [child]);
  for (const box of all.filter(b => !hiddenFrom(b.path))) {
    const role = roleOf(box);
    if (!role || !ariaRoles.has(role)) continue;
    if (requiredParent[role] && !requiredParent[role].includes(parentRole(box))) report(findings, 'E_A11Y_ROLE_PARENT', 'error', `${box.label} has role ${role} outside ${requiredParent[role].join('/')}`, whole(box), domain, { rule: 'role-parent', role });
    if (requiredChildren[role]) for (const child of ownedChildren(box)) if (!requiredChildren[role].includes(implicitRole(child)) && child.tag !== 'caption')
      report(findings, 'E_A11Y_ROLE_CHILDREN', 'error', `${box.label} (role ${role}) owns ${child.label}, which is not ${requiredChildren[role].join('/')}`, whole(box), domain, { rule: 'role-children', child: child.path });
  }
  const requiredAttributes = { checkbox: ['aria-checked'], radio: ['aria-checked'], switch: ['aria-checked'], menuitemcheckbox: ['aria-checked'], menuitemradio: ['aria-checked'], slider: ['aria-valuenow'], scrollbar: ['aria-controls', 'aria-valuenow'], combobox: ['aria-expanded'], heading: ['aria-level'], meter: ['aria-valuenow'] };
  const nativeFor = { checkbox: b => b.tag === 'input' && b.inputType === 'checkbox', radio: b => b.tag === 'input' && b.inputType === 'radio', heading: b => /^h[1-6]$/.test(b.tag), slider: b => b.tag === 'input' && b.inputType === 'range', combobox: b => b.tag === 'select' };
  const ariaAttributes = new Set('activedescendant atomic autocomplete braillelabel brailleroledescription busy checked colcount colindex colindextext colspan controls current describedby description details disabled dropeffect errormessage expanded flowto grabbed haspopup hidden invalid keyshortcuts label labelledby level live modal multiline multiselectable orientation owns placeholder posinset pressed readonly relevant required roledescription rowcount rowindex rowindextext rowspan selected setsize sort valuemax valuemin valuenow valuetext'.split(' ').map(n => `aria-${n}`));
  const booleans = new Set(['aria-hidden', 'aria-disabled', 'aria-modal', 'aria-multiline', 'aria-multiselectable', 'aria-readonly', 'aria-required', 'aria-atomic', 'aria-busy']);
  const optionals = new Set(['aria-expanded', 'aria-selected']), tristates = new Set(['aria-checked', 'aria-pressed']);
  for (const box of all) {
    const role = roleOf(box), aria = box.aria ?? {};
    for (const attribute of requiredAttributes[role] ?? []) if (!(attribute in aria) && !nativeFor[role]?.(box)) report(findings, 'E_A11Y_ROLE_ATTR', 'error', `${box.label} has role ${role} without ${attribute}`, whole(box), domain, { rule: 'role-attr', attribute });
    for (const [attribute, raw] of Object.entries(aria)) {
      if (!ariaAttributes.has(attribute)) { report(findings, 'E_A11Y_ARIA_ATTR', 'error', `${box.label} has ${attribute}, which is not an ARIA attribute`, whole(box), domain, { rule: 'aria-attr', attribute }); continue; }
      if (raw === 'dynamic') { if (booleans.has(attribute) || optionals.has(attribute) || tristates.has(attribute)) report(unknowns, 'U_A11Y_ARIA_VALUE', 'unknown', `${box.label}: a dynamic ${attribute} may be invalid`, whole(box), domain, { rule: 'aria-value', attribute }); continue; }
      const v = raw.trim().toLowerCase();
      const ok = booleans.has(attribute) ? ['true', 'false'].includes(v) : optionals.has(attribute) ? ['true', 'false', 'undefined'].includes(v) : tristates.has(attribute) ? ['true', 'false', 'mixed', 'undefined'].includes(v) : true;
      if (!ok) report(findings, 'E_A11Y_ARIA_VALUE', 'error', `${box.label} has ${attribute}=${JSON.stringify(raw)}, not a valid value`, whole(box), domain, { rule: 'aria-value', attribute });
    }
    const global = ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-live', 'aria-owns', 'aria-controls'].some(a => a in aria) || (box.named === true && box.nameSource !== 'title');
    if (['none', 'presentation'].includes(role) && (box.focusable === true || box.tabIndex >= 0 || ['button', 'input', 'select', 'textarea'].includes(box.tag) || global))
      report(findings, 'E_A11Y_PRESENTATION_CONFLICT', 'error', `${box.label} has role ${role} but is focusable or labelled, so the role is ignored`, whole(box), domain, { rule: 'presentation-conflict' });
  }

  // --- content ---
  for (const head of geometry.filter(row => row.box.tag === 'th' && visible(row) && !hiddenFrom(row.path) && nameOf(row.box) !== true)) {
    let missing = [head.region];
    for (const text of geometry.filter(row => speaks(row) && (row.path === head.path || isAncestor(head.path, row.path)))) missing = missing.flatMap(region => subtract(region, text.region));
    for (const region of missing) report(findings, 'E_A11Y_EMPTY_TH', 'error', `${head.box.label} is an empty table header here`, head, region, { rule: 'empty-th' });
  }
  for (const row of geometry.filter(row => row.box.tag === 'img' && row.inlineFlow && typeof row.box.alt === 'string' && row.box.alt && row.box.alt !== 'dynamic')) {
    const leaf = treeBoxes.get(row.parentText);
    if (leaf?.textContent && leaf.textContent !== 'dynamic' && normalize(leaf.textContent) === normalize(row.box.alt)) report(warnings, 'W_A11Y_REDUNDANT_ALT', 'warning', `${row.box.label} has alt ${JSON.stringify(row.box.alt)}, which repeats the text beside it`, row, row.region, { rule: 'redundant-alt' });
  }
  for (const row of geometry.filter(row => row.box.tag === 'input' && visible(row) && !hiddenFrom(row.path))) {
    if (row.box.inputType === 'button' && (row.box.value === undefined || (row.box.value !== 'dynamic' && !row.box.value.trim())) && nameOf(row.box) !== true) report(findings, 'E_A11Y_INPUT_BUTTON_NAME', 'error', `${row.box.label} is an input button without a value`, row, row.region, { rule: 'input-button-name' });
  }
  const fieldNames = new Set('name honorific-prefix given-name additional-name family-name honorific-suffix nickname username new-password current-password one-time-code organization-title organization street-address address-line1 address-line2 address-line3 address-level4 address-level3 address-level2 address-level1 country country-name postal-code cc-name cc-given-name cc-additional-name cc-family-name cc-number cc-exp cc-exp-month cc-exp-year cc-csc cc-type transaction-currency transaction-amount language bday bday-day bday-month bday-year sex url photo tel tel-country-code tel-national tel-area-code tel-local tel-local-prefix tel-local-suffix tel-extension email impp'.split(' '));
  const contactFields = new Set(['tel', 'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local', 'tel-local-prefix', 'tel-local-suffix', 'tel-extension', 'email', 'impp']);
  const autofill = raw => {
    let t = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (t.length === 1 && ['on', 'off'].includes(t[0])) return true;
    if (t.at(-1) === 'webauthn') t = t.slice(0, -1);
    if (t[0]?.startsWith('section-') && t[0].length > 8) t = t.slice(1);
    if (['shipping', 'billing'].includes(t[0])) t = t.slice(1);
    if (['home', 'work', 'mobile', 'fax', 'pager'].includes(t[0])) { t = t.slice(1); if (!contactFields.has(t[0])) return false; }
    return t.length === 1 && fieldNames.has(t[0]);
  };
  for (const box of all.filter(b => typeof b.autocomplete === 'string' && b.autocomplete !== 'dynamic' && ['input', 'select', 'textarea'].includes(b.tag)))
    if (!autofill(box.autocomplete)) report(findings, 'E_A11Y_AUTOCOMPLETE', 'error', `${box.label} has autocomplete=${JSON.stringify(box.autocomplete)}, outside the HTML autofill tokens`, whole(box), domain, { rule: 'autocomplete', value: box.autocomplete });
  for (const box of all.filter(b => b.scope !== undefined && b.scope !== 'dynamic'))
    if (box.tag !== 'th' || !['row', 'col', 'rowgroup', 'colgroup'].includes(box.scope.trim().toLowerCase())) report(findings, 'E_A11Y_SCOPE', 'error', `${box.label} has scope=${JSON.stringify(box.scope)}${box.tag !== 'th' ? ' on a non-header cell' : ''}`, whole(box), domain, { rule: 'scope' });

  // --- language ---
  if (root.tag === 'html' && (root.lang === undefined || !String(root.lang).trim())) report(findings, 'E_A11Y_HTML_LANG', 'error', `${root.label} has no lang attribute`, whole(root), domain, { rule: 'html-lang' });
  for (const box of all.filter(b => b.lang && b.lang !== '<dynamic>' && !languageTag.test(b.lang))) report(findings, 'E_A11Y_LANG_VALID', 'error', `${box.label} has lang=${JSON.stringify(box.lang)}, which is not a language tag`, whole(box), domain, { rule: 'lang-valid' });

  // --- page roots (html or body) ---
  const pageRoot = ['html', 'body'].includes(root.tag);
  const landmarkRole = box => { const r = implicitRole(box); if (['main', 'navigation', 'complementary', 'search', 'form', 'region', 'banner', 'contentinfo'].includes(r)) return r; if ((box.tag === 'header' || box.tag === 'footer') && !ancestorsOf(box.path).some(a => ['article', 'aside', 'main', 'nav', 'section'].includes(a.tag))) return box.tag === 'header' ? 'banner' : 'contentinfo'; if (box.tag === 'section' && nameOf(box) === true) return 'region'; return null; };
  if (pageRoot) {
    const h1s = geometry.filter(row => row.box.tag === 'h1' && visible(row) && !hiddenFrom(row.path));
    let noH1 = [domain];
    for (const row of h1s) noH1 = noH1.flatMap(region => subtract(region, row.region));
    for (const region of noH1) report(warnings, 'W_A11Y_PAGE_H1', 'warning', 'no h1 renders here', whole(root), region, { rule: 'page-h1' });
    for (const row of geometry.filter(row => row.box.text && visible(row) && !hiddenFrom(row.path))) {
      const inLandmark = [row.box, ...ancestorsOf(row.path)].some(b => landmarkRole(b));
      const skipLink = row.box.tag === 'a' && typeof row.box.href === 'string' && row.box.href.startsWith('#');
      if (!inLandmark && !skipLink) report(warnings, 'W_A11Y_REGION', 'warning', `${row.box.label} is content outside any landmark`, row, row.region, { rule: 'region' });
    }
    const ordered = [...all].sort((a, b) => treeOrder(a.path, b.path));
    const firstNav = ordered.find(b => landmarkRole(b) === 'navigation'), firstMain = ordered.find(b => landmarkRole(b) === 'main');
    if (firstNav && firstMain && treeOrder(firstNav.path, firstMain.path) < 0) {
      const firstFocusable = ordered.find(b => b.focusable === true || (b.tag === 'button' && b.focusable !== false));
      const target = firstFocusable?.href?.startsWith('#') ? byId.get(firstFocusable.href.slice(1)) : null;
      const skips = target && (target === firstMain || isAncestor(firstMain.path, target.path) || isAncestor(target.path, firstMain.path) || target.path === firstMain.path);
      if (!skips) report(warnings, 'W_A11Y_BYPASS', 'warning', 'navigation comes before main, and the first focusable element is not a skip link to it', whole(firstNav), domain, { rule: 'bypass' });
    }
  }
  // Landmarks: main and complementary at top level; one banner and one contentinfo at a time.
  for (const row of geometry.filter(row => ['main', 'complementary'].includes(landmarkRole(row.box)) && visible(row) && !hiddenFrom(row.path))) {
    const inside = ancestorsOf(row.path).find(a => landmarkRole(a));
    if (inside) report(warnings, 'W_A11Y_LANDMARK_TOP_LEVEL', 'warning', `${row.box.label} (${landmarkRole(row.box)}) is inside ${inside.label}; keep it at the top level`, row, row.region, { rule: 'landmark-top-level', parent: inside.path });
  }
  for (const kind of ['banner', 'contentinfo']) {
    const rows = geometry.filter(row => landmarkRole(row.box) === kind && visible(row) && !hiddenFrom(row.path));
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].path === rows[j].path) continue;
      const region = intersect(rows[i].region, rows[j].region);
      if (region) report(warnings, 'W_A11Y_DUPLICATE_LANDMARK', 'warning', `${rows[j].box.label} is a second ${kind} landmark`, rows[j], region, { rule: 'duplicate-landmark', other: rows[i].path });
    }
  }

  // --- CSS that changes what the DOM says ---
  for (const row of geometry.filter(row => row.box.tag === 'p' && row.box.text && visible(row))) {
    const parentBox = boxOf.get(row.path.slice(0, row.path.lastIndexOf('/'))), siblings = parentBox?.children ?? [];
    const next = siblings[siblings.indexOf(row.box) + 1];
    if (next?.tag !== 'p') continue;
    for (const after of geometry.filter(r => r.box === next && visible(r))) {
      const region = intersect(row.region, after.region);
      if (!region) continue;
      const bold = weight(row.paint.fontWeight) >= 600 && weight(after.paint.fontWeight) < 600;
      const a = px(row.paint.fontSize), b = px(after.paint.fontSize), bigger = a !== undefined && b !== undefined && a >= b * 1.2;
      if (bold || bigger) report(warnings, 'W_A11Y_P_AS_HEADING', 'warning', `${row.box.label} is styled as a heading (${bold ? 'bold' : 'larger'}) but is a paragraph`, row, region, { rule: 'p-as-heading' });
    }
  }
  if (block) {
    const portrait = clip(domain, diff(height, domainWidth)), landscape = clip(domain, diff(domainWidth, height), true);
    const mains = geometry.filter(row => landmarkRole(row.box) === 'main' && !hiddenFrom(row.path));
    if (portrait && landscape && mains.length) {
      const shows = part => mains.some(row => intersect(row.region, part));
      for (const [name, part, other] of [['landscape', landscape, portrait], ['portrait', portrait, landscape]])
        if (!shows(part) && shows(other)) report(findings, 'E_A11Y_ORIENTATION', 'error', `the main content does not render in ${name} viewports`, whole(mains[0].box), part, { rule: 'orientation', missing: name });
    }
  }

  // focus-visible: the focused state must look different. The UA :focus-visible ring applies unless an
  // author rule sets outline-style; then an outline, a box-shadow, or a color/background change must show.
  for (const row of geometry.filter(row => row.focusStates && visible(row) && !hiddenFrom(row.path))) {
    for (const state of row.focusStates) {
      const region = intersect(row.region, state.region);
      if (!region) continue;
      const f = state.paint, b = row.paint;
      const outline = !state.authorOutline || (!['none', 'hidden'].includes(f.outlineStyle) && !['0', '0px'].includes(String(f.outlineWidth)));
      const changed = (f.boxShadow !== 'none' && f.boxShadow !== b.boxShadow) || f.color !== b.color || f.backgroundColor !== b.backgroundColor || f.backgroundImage !== b.backgroundImage || f.decoration !== b.decoration;
      if (!outline && !changed) report(findings, 'E_A11Y_FOCUS_VISIBLE', 'error', `${row.box.label} shows no focus indicator: the outline is removed and nothing else changes on focus`, row, region, { rule: 'focus-visible' });
    }
  }

  // hover-only (SC 2.1.1, 1.4.13): content a pointer can reveal must be revealed by focus as well.
  const shown = paint => paint.visibility === 'visible' && !/^(?:0|0?\.0+|0%)$/.test(String(paint.opacity));
  for (const row of geometry.filter(row => row.hoverStates && !hiddenFrom(row.path) && !shown(row.paint))) {
    for (const hover of row.hoverStates.filter(state => shown(state.paint))) {
      const revealed = intersect(row.region, hover.region);
      if (!revealed) continue;
      let hidden = [revealed];
      for (const focus of (row.focusStates ?? []).filter(state => shown(state.paint))) hidden = hidden.flatMap(region => subtract(region, focus.region));
      for (const region of hidden) report(findings, 'E_A11Y_HOVER_ONLY', 'error', `${row.box.label} appears on :hover but stays hidden when focused, so keyboard users cannot see it`, row, region, { rule: 'hover-only' });
    }
  }

  // state-contrast: a text control keeps the contrast minimum when hovered or focused.
  for (const row of geometry.filter(row => row.box.text && visible(row) && (row.hoverStates || row.focusStates))) {
    for (const [name, states] of [['hover', row.hoverStates ?? []], ['focus', row.focusStates ?? []]]) for (const state of states) {
      const region = intersect(row.region, state.region);
      if (!region || (state.paint.color === row.paint.color && state.paint.backgroundColor === row.paint.backgroundColor)) continue;
      const result = backdrop([...row.chain.slice(0, -1), state.paint]);
      if (result.unknown) { report(unknowns, 'U_A11Y_CONTRAST', 'unknown', `${row.box.label} (${name}): ${result.unknown}`, row, region, { rule: 'state-contrast' }); continue; }
      const ratio = contrastRatio(result.fg, result.bg), required = large(state.paint) ? (contrast === 'AAA' ? 4.5 : 3) : (contrast === 'AAA' ? 7 : 4.5);
      if (ratio < required) report(findings, 'E_A11Y_STATE_CONTRAST', 'error', `${row.box.label} has contrast ${ratio.toFixed(2)}:1 when ${name === 'hover' ? 'hovered' : 'focused'}, below ${required}:1`, row, region, { rule: 'state-contrast', state: name, ratio, required });
    }
  }

  // text-spacing, inline axis: a fixed single-line string grows by letter-spacing 0.12em per character
  // and word-spacing 0.16em per space; a clipping box narrower than that cuts it.
  for (const row of geometry.filter(row => row.box.contract?.font && row.box.contract.textMetrics?.kind === 'content' && row.box.contract.wrap === 'nowrap' && row.overflow === 'clip' && visible(row))) {
    const text = row.box.contract.textMetrics.text ?? '', size = row.box.contract.font.size;
    const extra = 0.12 * size * [...text].length + 0.16 * size * (text.match(/ /g) ?? []).length;
    const needed = Math.ceil((row.box.contract.minInlineSize + extra) * 64) / 64;
    const failed = below(row.region, row.content.inline, scalar(q(needed)));
    if (failed) report(findings, 'E_A11Y_TEXT_SPACING', 'error', `${row.box.label} clips its text with letter-spacing 0.12em and word-spacing 0.16em (needs ${needed}px)`, row, failed, { rule: 'text-spacing', axis: 'inline', required: needed });
  }

  // text-spacing: a font-measured leaf that clips must still fit its lines at line-height 1.5 × font size
  // (more letter/word spacing can only add lines, so this is a definite failure).
  for (const row of geometry.filter(row => row.box.contract?.font && row.overflow === 'clip' && row.contentBlockSize && visible(row))) {
    const font = row.box.contract.font, metrics = row.box.contract.textMetrics;
    const spaced = Math.max(font.lineHeight, 1.5 * font.size);
    // With a measured spaced profile (letter 0.12em, word 0.16em), the line count under all of SC 1.4.12.
    const steps = metrics?.kind === 'lines' ? (metrics.spacedProfile ?? metrics.profile) : [{ atLeastInlineSize: 0, lines: 1 }];
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].lines === null) continue;
      let region = clip(row.region, diff(row.content.inline, scalar(steps[i].atLeastInlineSize)));
      if (steps[i + 1]) region = below(region, row.content.inline, scalar(steps[i + 1].atLeastInlineSize));
      const failed = below(region, row.contentBlockSize, scalar(q(Math.round(steps[i].lines * spaced * 1e6) / 1e6)));
      if (failed) report(findings, 'E_A11Y_TEXT_SPACING', 'error', `${row.box.label} clips its ${steps[i].lines} line(s) when line-height is 1.5 × ${font.size}px (${steps[i].lines * spaced}px)`, row, failed, { rule: 'text-spacing', axis: 'block', lines: steps[i].lines, required: steps[i].lines * spaced });
    }
  }

  // Frames and media.
  for (const row of geometry.filter(row => visible(row) && !hiddenFrom(row.path) && ['iframe', 'video', 'audio'].includes(row.box.tag))) {
    const box = row.box;
    if (box.tag === 'iframe' && nameOf(box) !== true) report(nameOf(box) === 'dynamic' ? unknowns : findings, nameOf(box) === 'dynamic' ? 'U_A11Y_FRAME_TITLE' : 'E_A11Y_FRAME_TITLE', nameOf(box) === 'dynamic' ? 'unknown' : 'error', `${box.label} is a frame without a title`, row, row.region, { rule: 'frame-title' });
    if (box.tag === 'video') {
      const kinds = (box.children ?? []).filter(child => child.tag === 'track').map(child => child.trackKind);
      if (kinds.includes('dynamic')) report(unknowns, 'U_A11Y_VIDEO_CAPTION', 'unknown', `${box.label}: a dynamic track kind decides whether it has captions`, row, row.region, { rule: 'video-caption' });
      else if (!kinds.some(kind => ['captions', 'subtitles'].includes(kind))) report(findings, 'E_A11Y_VIDEO_CAPTION', 'error', `${box.label} has no captions track`, row, row.region, { rule: 'video-caption' });
    }
  }
  for (const box of all.filter(b => ['video', 'audio'].includes(b.tag) && b.autoplay && !b.muted && !hiddenFrom(b.path)))
    report(warnings, 'W_A11Y_AUTOPLAY_AUDIO', 'warning', `${box.label} plays automatically with sound; mute it or offer a control within 3 seconds`, whole(box), domain, { rule: 'autoplay-audio' });

  // target-size: SC 2.5.8 (AA, 24px, with the spacing exception) or SC 2.5.5 (AAA, 44px, no spacing exception).
  // Violations are collected per target, then the declared exceptions are applied.
  const violations = new Map(), undecided = new Map();
  const add = (map, target, entry) => map.set(target.path, [...(map.get(target.path) ?? []), entry]);
  const S = q(targetSize), radius = div(S, q(2));
  const center = row => ({ inline: sum(row.origin.inline, times(row.inline, q(1 / 2))), block: sum(row.origin.block, times(row.block, q(1 / 2))) });
  const undersized = row => { const narrow = below(row.region, row.inline, scalar(S)), wide = row.region && clip(row.region, diff(row.inline, scalar(S))); return [narrow, below(wide, row.block, scalar(S))].filter(Boolean); };
  // Inline targets (in a sentence) are exempt from SC 2.5.8 and 2.5.5.
  const exposed = geometry.filter(row => interactive(row) && visible(row) && !hiddenFrom(row.path) && !row.inlineFlow);
  for (const target of exposed) {
    const small = undersized(target);
    if (!small.length) continue;
    if (targetLevel === 'AAA') { for (const region of small) add(violations, target, { region, other: null }); continue; }
    if (!target.origin) { for (const region of small) add(undecided, target, { region, other: null, reason: 'its position is not proved, so the spacing exception cannot be checked' }); continue; }
    const hits = [], doubtful = [];
    for (const other of exposed) {
      if (related(other.path, target.path)) continue;
      for (const piece of small) {
        const shared = intersect(piece, other.region);
        if (!shared) continue;
        if (!other.origin) { doubtful.push({ region: shared, other }); continue; }
        // The circle against the other target's box: offset to the nearest point of the box.
        const c = center(target), left = other.origin.inline, top = other.origin.block, r = right(other), b = bottom(other);
        const axis = (value, low, high) => [[clip(shared, diff(low, value), true), diff(low, value)], [atMost(clip(shared, diff(value, low)), value, high), scalar(0)], [clip(shared, diff(value, high), true), diff(value, high)]];
        for (const [xs, dx] of axis(c.inline, left, r)) if (xs) for (const [ys, dy] of axis(c.block, top, b)) {
          const part = ys && intersect(xs, ys);
          if (!part) continue;
          const reach = circleReach(part, dx, dy, radius);
          hits.push(...reach.yes.map(region => ({ region, other }))); doubtful.push(...reach.maybe.map(region => ({ region, other })));
        }
        // Two undersized circles meet when the centres are closer than the target size.
        for (const otherSmall of undersized(other)) {
          const both = intersect(shared, otherSmall);
          if (!both) continue;
          const d = center(other), reach = circleReach(both, diff(c.inline, d.inline), diff(c.block, d.block), S);
          hits.push(...reach.yes.map(region => ({ region, other }))); doubtful.push(...reach.maybe.map(region => ({ region, other })));
        }
      }
    }
    // Keep the largest proven pieces; undecided bands only matter where nothing is proven.
    // h ⊆ g exactly: no point of h violates a constraint of g (strictness included).
    const within = (h, g) => g.constraints.every(c => !clip(h, times(c.slack, q(-1)), !c.strict));
    const kept = hits.filter((h, i) => !hits.some((g, j) => j !== i && within(h.region, g.region) && (!within(g.region, h.region) || j < i)));
    for (const hit of kept) add(violations, target, hit);
    if (!kept.length) for (const piece of doubtful) add(undecided, target, { ...piece, reason: `its circle's distance to ${piece.other.box.label} is not decided here` });
  }
  // Exceptions: an equivalent control that renders and passes where the violation holds, or an essential presentation.
  const rowsOf = path => exposed.filter(row => row.path === path);
  for (const target of new Set([...violations.keys(), ...undecided.keys()])) {
    const row = rowsOf(target)[0], box = row.box;
    let pieces = violations.get(target) ?? [], doubtfulPieces = undecided.get(target) ?? [];
    const describe = hit => hit.other ? `its ${targetSize}px circle meets ${hit.other.box.label}` : targetLevel === 'AAA' ? `SC 2.5.5 allows no spacing exception` : '';
    if (box.essential === 'dynamic' || box.equivalent === 'dynamic') {
      for (const hit of [...pieces, ...doubtfulPieces]) report(unknowns, 'U_A11Y_TARGET_SIZE', 'unknown', `${box.label} is under ${targetSize}px and a dynamic exception attribute decides whether it applies`, row, hit.region, { rule: 'target-size' });
      continue;
    }
    if (box.essential) {
      for (const hit of [...pieces, ...doubtfulPieces]) exempted.push({ code: 'E_A11Y_TARGET_SIZE', rule: 'target-size', box: box.label, path: target, ...ranges(hit.region), reason: `essential: ${box.essential}` });
      continue;
    }
    if (box.equivalent) {
      // Where the equivalent renders, is visible and has no violation of its own.
      const equivalentBox = byId.get(box.equivalent);
      let passing = equivalentBox ? exposed.filter(other => other.box === equivalentBox).map(other => other.region) : [];
      for (const own of [...(violations.get(equivalentBox?.path) ?? []), ...(undecided.get(equivalentBox?.path) ?? [])]) passing = passing.flatMap(region => subtract(region, own.region));
      const excuse = list => list.flatMap(hit => {
        let rest = [hit.region];
        for (const region of passing) {
          const covered = intersect(hit.region, region);
          if (covered) exempted.push({ code: 'E_A11Y_TARGET_SIZE', rule: 'target-size', box: box.label, path: target, ...ranges(covered), reason: `equivalent: ${equivalentBox.label} meets the target size here`, equivalent: equivalentBox.path });
          rest = rest.flatMap(piece => subtract(piece, region));
        }
        return rest.map(region => ({ ...hit, region }));
      });
      pieces = excuse(pieces); doubtfulPieces = excuse(doubtfulPieces);
    }
    for (const hit of pieces) report(findings, 'E_A11Y_TARGET_SIZE', 'error', `${box.label} is under ${targetSize}px${describe(hit) ? ` and ${describe(hit)}` : ''}`, row, hit.region, { rule: 'target-size', required: targetSize, level: targetLevel, ...(hit.other ? { other: hit.other.path } : {}) });
    for (const hit of doubtfulPieces) report(unknowns, 'U_A11Y_TARGET_SIZE', 'unknown', `${box.label} is under ${targetSize}px and ${hit.reason}`, row, hit.region, { rule: 'target-size', ...(hit.other ? { other: hit.other.path } : {}) });
  }


  // clickable-look: a pointer cursor set on this element (not inherited) promises a click target;
  // without focus or an interactive role a keyboard cannot reach it (any click handler is outside the tree).
  for (const row of geometry.filter(row => row.paint.cursor === 'pointer' && row.chain?.at(-2)?.cursor !== 'pointer' && visible(row) && !hiddenFrom(row.path))) {
    const box = row.box;
    if (interactive(row) || box.focusable === true || box.focusable === 'dynamic' || box.tabIndex >= 0 || ['label', 'summary', 'option'].includes(box.tag) || ancestorsOf(row.path).some(a => interactive({ box: a }) || a.tag === 'label')) continue;
    report(warnings, 'W_A11Y_CLICK_LOOK', 'warning', `${box.label} has cursor: pointer but is neither focusable nor an interactive role; if it handles clicks, keyboard users cannot reach it`, row, row.region, { rule: 'clickable-look' });
  }
  // list-style-semantics: WebKit (VoiceOver) exposes a list without markers as no list, unless role=list (outside nav).
  for (const row of geometry.filter(row => ['ul', 'ol'].includes(row.box.tag) && visible(row) && !hiddenFrom(row.path) && row.box.role === undefined && !ancestorsOf(row.path).some(a => a.tag === 'nav'))) {
    const items = geometry.filter(item => item.box.tag === 'li' && item.path.slice(0, item.path.lastIndexOf('/')) === row.path && intersect(item.region, row.region));
    if (items.length && items.every(item => item.paint.listStyleType === 'none'))
      report(warnings, 'W_A11Y_LIST_STYLE', 'warning', `${row.box.label} has list-style-type: none; Safari/VoiceOver then drops its list semantics unless it has role="list"`, row, row.region, { rule: 'list-style-semantics' });
  }
  // motion: an animation longer than 5s (or infinite) needs a way to stop; prefers-reduced-motion: reduce should stop it.
  const seconds = value => { const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(m?s)$/.exec(String(value)); return m ? Number(m[1]) / (m[2] === 'ms' ? 1000 : 1) : null; };
  const lasting = a => a && a.playState !== 'paused' && seconds(a.duration) > 0 && (a.count === 'infinite' || seconds(a.duration) * Number(a.count) > 5);
  for (const row of geometry.filter(row => lasting(row.paint.animation) && visible(row) && !hiddenFrom(row.path))) {
    const still = (row.reducedMotion ?? []).filter(s => lasting(s.paint.animation) || (s.paint.animation && s.paint.animation.playState !== 'paused' && seconds(s.paint.animation.duration) > 0 && s.paint.animation.count === 'infinite'));
    for (const s of still) report(warnings, 'W_A11Y_MOTION', 'warning', `${row.box.label} runs animation ${row.paint.animation.name} (${row.paint.animation.duration} × ${row.paint.animation.count}) and prefers-reduced-motion: reduce does not stop it; moving content over 5s needs a pause mechanism`, row, s.region, { rule: 'motion', animation: row.paint.animation });
  }
  // blink: marquee and blink move or flash with no pause mechanism.
  for (const row of geometry.filter(row => ['marquee', 'blink'].includes(row.box.tag) && visible(row)))
    report(findings, 'E_A11Y_BLINK', 'error', `${row.box.label} is a <${row.box.tag}>, which moves or blinks without a way to pause it`, row, row.region, { rule: 'blink' });
  // definition-list: dl contains dt/dd groups (optionally wrapped in div); dt/dd live in dl.
  for (const row of geometry.filter(row => visible(row) && !hiddenFrom(row.path))) {
    const box = row.box, parentBox = boxOf.get(row.path.slice(0, row.path.lastIndexOf('/')));
    const grouped = child => ['dt', 'dd'].includes(child.tag);
    if (box.tag === 'dl' && box.role === undefined && (box.children ?? []).some(child => !grouped(child) && !['script', 'template'].includes(child.tag) && !(child.tag === 'div' && (child.children ?? []).every(grouped))))
      report(findings, 'E_A11Y_DL', 'error', `${box.label} has a child that is not dt, dd or a div of them`, row, row.region, { rule: 'definition-list' });
    if (['dt', 'dd'].includes(box.tag) && !(parentBox?.tag === 'dl' || (parentBox?.tag === 'div' && boxOf.get(parentBox.path.slice(0, parentBox.path.lastIndexOf('/')))?.tag === 'dl')))
      report(findings, 'E_A11Y_DL', 'error', `${box.label} is outside a dl`, row, row.region, { rule: 'definition-list' });
  }
  // accesskeys: one key, one element.
  const keyed = new Map();
  for (const box of treeBoxes.values()) if (box.accessKey && box.accessKey !== 'dynamic') keyed.set(box.accessKey, [...(keyed.get(box.accessKey) ?? []), box]);
  for (const [key, list] of keyed) for (const box of list.slice(1)) report(warnings, 'W_A11Y_ACCESSKEY', 'warning', `${box.label} repeats accesskey ${JSON.stringify(key)} of ${list[0].label}`, whole(box), domain, { rule: 'accesskeys', accessKey: key });
  // server-side-image-map: ismap sends pointer coordinates only.
  for (const row of geometry.filter(row => row.box.tag === 'img' && row.box.ismap && visible(row) && !hiddenFrom(row.path)))
    report(warnings, 'W_A11Y_ISMAP', 'warning', `${row.box.label} is a server-side image map (ismap); its regions cannot be reached by keyboard`, row, row.region, { rule: 'server-side-image-map' });
  // aria-hidden-body: hides the document from assistive technology.
  for (const box of treeBoxes.values()) if (box.tag === 'body' && box.ariaHidden === true) report(findings, 'E_A11Y_ARIA_HIDDEN_BODY', 'error', `${box.label} has aria-hidden="true", which hides the whole document`, whole(box), domain, { rule: 'aria-hidden-body' });

  return { findings: dedupe(findings), warnings: dedupe(warnings), unknowns: dedupe(unknowns), exempted: dedupe(exempted), notes };
}

function dedupe(rows) {
  const seen = new Set();
  return rows.filter(row => { const key = JSON.stringify([row.code, row.path, row.other, row.cover, row.before, row.previous, row.outer, row.reference, row.id, row.name, row.range, row.heightRange]); if (seen.has(key)) return false; seen.add(key); return true; });
}
