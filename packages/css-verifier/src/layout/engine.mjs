import { q, add, sub, mul, cmp, div, exact, number } from './linear.mjs';
import { scalar, width, height, sum, diff, times, evaluate, affine, sample, rectangle, clip, partition, projection, serialize } from './region.mjs';
import { validateOptions } from './input.mjs';
import { parseLayoutCSS, computeStyle, matches, px, setRootFontSize, setSafeArea, containsFixed, setUAProfile } from './css.mjs';
import { resolveUAProfile } from './ua-profile.mjs';
import { parseCondition } from './conditions.mjs';
import { tracks, tracks as gridTracks, place, parseAreas, expandTracks } from './grid.mjs';
import { compileSelector, PARENT, dynamicAttributeTests } from './selectors.mjs';
import { selectorUsage } from './selector-usage.mjs';
import { selectorScope } from './selector-scope.mjs';
import { viewportFont, zoomShortfall } from './zoom-font.mjs';
import { gapSize, trackArea, trackSlice, inheritTracks } from './subgrid.mjs';
import { scrollbarFrames } from './scrollbars.mjs';
import {absoluteOrigin} from './positioned.mjs';
import {textFontMismatch, textBrowserMismatch, textLinesMismatch, textLangMismatch, fittingLength, fittingLines} from './text-font.mjs';
import {validateFlexContainer, flexItem, crossAlignment, distribution, flexUnknown} from './flex.mjs';
import {judgeIntegrity, intersect } from './integrity.mjs';
import {judgeAccessibility, accessibilityRules, accessibilityProfiles, ruleTier, paintFacts} from './accessibility.mjs';
import {fact, sizeChain, sizeProperties, trackProperties, contractFact, explanation} from './explain.mjs';
import {phrasingTags} from '../tree.mjs';

const zero = q(0), one = q(1), minusOne = q(-1);
const total = values => values.reduce(sum, scalar(0));
const trackStart = (values,gap,index) => sum(total(values.slice(0,index)),scalar(mul(gap,q(index))));
// Visually hidden (the "sr-only" pattern): clipped to nothing, or a box of at most 1px that hides its overflow. Its
// content is meant not to be seen, so it is not judged for fit or clipping.
const visuallyHiddenStyle = style => style['clip-path'] === 'empty' || style.clip === 'empty' || (['hidden', 'clip'].includes(style['overflow-x']) && /^\d+(?:\.\d+)?px$/.test(String(style['block-size'])) && Number(String(style['block-size']).slice(0, -2)) <= 1);
const offset = (origin,inline,block) => origin ? {inline:sum(origin.inline,inline),block:sum(origin.block,block)} : null;
const inlineFeature = feature => ['width', 'inline-size'].includes(feature);
const compare = (value, relation) => relation === '>=' ? value >= 0 : relation === '>' ? value > 0 : relation === '<=' ? value <= 0 : relation === '<' ? value < 0 : value === 0;
// Lengths as affine functions of the viewport (W, H): px, % of the containing size, vw, vh, vmin, vmax, rem (the
// html root's px font-size), em (the element's px font-size), and calc() with + − × ÷ and min()/max()/clamp().
// vmin/vmax and min()/max() split the region where their arguments cross; each piece is {region, value}.
const unitContext = { rootFontSize: null, heightKnown: false };
let uaEngine; // the engine of the ua option's profile (set per analysis, like the UA profile in css.mjs)
function lengthPieces(value, parent, region, style) {
  const text = String(value).trim().toLowerCase();
  let i = 0;
  const fail = () => { throw new Error(`Unsupported CSS length: ${value}`); };
  const space = () => { while (/\s/.test(text[i] ?? '')) i++; };
  // A value is a list of pieces; `number` marks a unitless factor.
  const constant = (v, number = false) => [{ region, value: v, number }];
  // A piece's region is the base region or a sub-region of it; meeting the base keeps the other side as it is.
  const meet = (a, b) => a === region ? b : b === region ? a : a === b ? a : intersect(a, b);
  const combine = (a, b, f) => a.flatMap(x => b.flatMap(y => { const r = x.region && y.region ? meet(x.region, y.region) : x.region ?? y.region; return r || (x.region === null && y.region === null) ? [{ region: r ?? null, ...f(x, y) }] : []; }));
  const pick = (list, larger) => list.reduce((acc, next) => combine(acc, next, (x, y) => ({ value: null, both: [x.value, y.value], number: x.number && y.number })).flatMap(entry => {
    if (entry.both === undefined) return [entry];
    const [a, b] = entry.both;
    if (!entry.region) { const d = diff(a, b); if (cmp(d.x, zero) || cmp(d.y, zero)) fail(); return [{ region: null, value: (cmp(d.b, zero) >= 0) === larger ? a : b, number: entry.number }]; }
    const p = partition(entry.region, diff(a, b), '>=');
    return [...p.yes.map(r => ({ region: r, value: larger ? a : b, number: entry.number })), ...p.no.map(r => ({ region: r, value: larger ? b : a, number: entry.number }))];
  }));
  const unit = (n, u) => {
    const k = div(q(n), q(100));
    if (u === '') return constant(scalar(q(n)), true);
    if (u === 'px') return constant(scalar(q(n)));
    if (u === '%') { if (!parent) fail(); return constant(times(parent, k)); }
    if (u === 'vw') return constant(times(width, k));
    if (['vh', 'vmin', 'vmax'].includes(u) && !unitContext.heightKnown) throw new Error(`${value}: viewport-height units need a viewport height range`);
    if (u === 'vh') return constant(times(height, k));
    if (u === 'vmin' || u === 'vmax') return pick([constant(times(width, k)), constant(times(height, k))], u === 'vmax');
    if (u === 'rem') { if (!unitContext.rootFontSize) throw new Error(`${value}: rem needs the html root with a px font-size in the analysed tree`); return constant(scalar(mul(q(n), unitContext.rootFontSize))); }
    if (u === 'em') { if (!/^\d+(?:\.\d{1,6})?px$/.test(style?.['font-size'] ?? '')) throw new Error(`${value}: em needs a px font-size`); return constant(scalar(mul(q(n), px(style['font-size'])))); }
    fail();
  };
  const primary = () => {
    space();
    const fn = /^(calc|min|max|clamp)\(/.exec(text.slice(i));
    if (fn) {
      i += fn[0].length; const args = [sumExpr()]; space();
      while (text[i] === ',') { i++; args.push(sumExpr()); space(); }
      if (text[i++] !== ')') fail();
      if (fn[1] === 'calc') { if (args.length !== 1) fail(); return args[0]; }
      if (fn[1] === 'clamp') { if (args.length !== 3) fail(); return pick([args[0], pick([args[1], args[2]], false)], true); }
      return pick(args, fn[1] === 'max');
    }
    if (text[i] === '(') { i++; const v = sumExpr(); space(); if (text[i++] !== ')') fail(); return v; }
    // s/l/d viewport units (small, large, dynamic) equal the v units in the static viewport the options declare
    // (browser UI that resizes the viewport, such as a mobile toolbar, is not modeled).
    const m = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|%|[sld]?(?:vw|vh|vmin|vmax)|rem|em)?/.exec(text.slice(i));
    if (!m) fail();
    i += m[0].length;
    return unit(m[1].replace(/^\+/, '').replace(/^(-?)\./, '$10.'), (m[2] ?? '').replace(/^[sld](?=v)/, ''));
  };
  const product = () => {
    let left = primary();
    for (;;) {
      space(); const op = text[i];
      if (op !== '*' && op !== '/') return left;
      i++; const right = primary();
      left = combine(left, right, (x, y) => {
        if (op === '/') { if (!y.number || cmp(y.value.b, zero) === 0) fail(); return { value: times(x.value, div(one, y.value.b)), number: x.number }; }
        if (x.number) return { value: times(y.value, x.value.b), number: y.number };
        if (y.number) return { value: times(x.value, y.value.b), number: false };
        return fail();
      });
    }
  };
  const sumExpr = () => {
    let left = product();
    for (;;) {
      space(); const op = text[i];
      if (op !== '+' && op !== '-') return left;
      i++; const right = product();
      left = combine(left, right, (x, y) => { if (x.number !== y.number) fail(); return { value: op === '+' ? sum(x.value, y.value) : diff(x.value, y.value), number: x.number }; });
    }
  };
  const out = sumExpr(); space();
  if (i !== text.length || out.some(piece => piece.number && text !== '0')) fail();
  // A size is never negative: the top-level result clamps at 0 (CSS Values 4 §10.12), splitting where it crosses 0.
  return out.flatMap(piece => {
    if (!piece.region) return [{ region: null, value: cmp(piece.value.b, zero) < 0 && !cmp(piece.value.x, zero) && !cmp(piece.value.y, zero) ? scalar(zero) : piece.value }];
    const p = partition(piece.region, piece.value, '>=');
    return [...p.yes.map(r => ({ region: r, value: piece.value })), ...p.no.map(r => ({ region: r, value: scalar(zero) }))];
  });
}
// Where a box's layout start differs between two layouts of the same page: rows of the same path are compared on
// the intersection of their condition regions (and `within`), at its vertices (an affine difference vanishes on a
// convex region exactly when it vanishes there). Returns the first change per path, or null when a compared row has
// no layout rectangle.
function layoutStartMoves(before, after, keep = () => true, within = null) {
  const rect = row => row.layoutRect !== undefined ? row.layoutRect : row.rect;
  const r = v => { const [n, d = '1'] = String(v ?? '0').split('/'); return div(q(n), q(d)); };
  const at = (a, w, h) => add(add(r(a.constant), mul(r(a.coefficient), w)), mul(r(a.heightCoefficient), h));
  const rows = before.filter(keep), others = after.filter(keep);
  const undecided = [...rows, ...others].find(row => !rect(row) || !row.$shown?.region);
  if (undecided) return { undecided };
  const moves = [];
  for (const row of rows) for (const other of others.filter(o => o.path === row.path)) {
    if (moves.some(m => m.row.path === row.path)) break;
    for (const limit of within ?? [null]) {
      const both = intersect(row.$shown.region, other.$shown.region), shared = both && (limit ? intersect(both, limit) : both);
      if (!shared) continue;
      const change = ['inlineStart', 'blockStart'].flatMap(field => shared.vertices.map(v => ({ field, v, delta: sub(at(rect(other)[field], v.x, v.y), at(rect(row)[field], v.x, v.y)) })).filter(c => cmp(c.delta, zero) !== 0).slice(0, 1))[0];
      if (change) { moves.push({ row, shared, ...change }); break; }
    }
  }
  return { moves };
}
// An upper bound of the Layout Instability score of one change (a frame), at viewport point p = {x: W, y: H}:
// impact fraction (the union of every moved box's before and after layout rectangles, inside the viewport, over the
// viewport area) × distance fraction (the largest horizontal or vertical move over max(W, H)). Every moved layout box
// is counted, a superset of the boxes Chromium counts (those it paints), so both factors only grow: the result bounds
// the browser's score of that frame from above (initial scroll position).
function shiftScoreBound(before, after, keep, p) {
  const rect = row => row.layoutRect !== undefined ? row.layoutRect : row.rect;
  const r = v => { const [n, d = '1'] = String(v ?? '0').split('/'); return Number(n) / Number(d); };
  const W = Number(exact(p.x).split('/').reduce((n, d) => n / d)), H = Number(exact(p.y).split('/').reduce((n, d) => n / d));
  if (!(W > 0 && H > 0)) return null;
  const at = a => r(a.constant) + r(a.coefficient) * W + r(a.heightCoefficient) * H;
  const inside = row => row.$shown?.region && row.$shown.region.constraints.every(c => cmp(evaluate(c.slack, p), zero) >= 0);
  const box = row => { const b = rect(row); return b && { x: at(b.inlineStart), y: at(b.blockStart), w: at(b.inlineSize), h: at(b.blockSize) }; };
  const pieces = []; let distance = 0;
  for (const row of before.filter(row => keep(row) && inside(row))) {
    const other = after.find(o => o.path === row.path && keep(o) && inside(o));
    if (!other) continue;
    const a = box(row), b = box(other);
    if (!a || !b) return null;
    const move = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    if (move === 0) continue;
    distance = Math.max(distance, move);
    for (const c of [a, b]) { const x0 = Math.max(0, c.x), y0 = Math.max(0, c.y), x1 = Math.min(W, c.x + c.w), y1 = Math.min(H, c.y + c.h); if (x1 > x0 && y1 > y0) pieces.push([x0, y0, x1, y1]); }
  }
  if (!pieces.length) return 0;
  // Union area by coordinate compression (few rectangles).
  const xs = [...new Set(pieces.flatMap(q => [q[0], q[2]]))].sort((m, n) => m - n), ys = [...new Set(pieces.flatMap(q => [q[1], q[3]]))].sort((m, n) => m - n);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) if (pieces.some(q => q[0] <= xs[i] && q[2] >= xs[i + 1] && q[1] <= ys[j] && q[3] >= ys[j + 1])) area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
  return (area / (W * H)) * (distance / Math.max(W, H));
}
// A bound of the Layout Instability score summed over the frames of one continuous change from layout `before` to
// layout `after`, assuming every box moves monotonically between them (premise recorded with the result): each frame's
// unstable area lies in the hull of a moved box's two rectangles, and the frames' largest moves add up to at most the
// sum of every moved box's whole move. Returns {impact, distance} fractions, or null without layout rectangles.
function sweptBound(before, after, p) {
  const rect = row => row.layoutRect !== undefined ? row.layoutRect : row.rect;
  const r = v => { const [n, d = '1'] = String(v ?? '0').split('/'); return Number(n) / Number(d); };
  const W = Number(exact(p.x).split('/').reduce((n, d) => n / d)), H = Number(exact(p.y).split('/').reduce((n, d) => n / d));
  if (!(W > 0 && H > 0)) return null;
  const at = a => r(a.constant) + r(a.coefficient) * W + r(a.heightCoefficient) * H;
  const inside = row => row.$shown?.region && row.$shown.region.constraints.every(c => cmp(evaluate(c.slack, p), zero) >= 0);
  const box = row => { const b = rect(row); return b && { x: at(b.inlineStart), y: at(b.blockStart), w: at(b.inlineSize), h: at(b.blockSize) }; };
  const pieces = []; let moves = 0;
  for (const row of before.filter(inside)) {
    const other = after.find(o => o.path === row.path && inside(o));
    if (!other) continue;
    const a = box(row), b = box(other);
    if (!a || !b) return null;
    const move = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    if (move === 0) continue;
    moves += move;
    const x0 = Math.max(0, Math.min(a.x, b.x)), y0 = Math.max(0, Math.min(a.y, b.y)), x1 = Math.min(W, Math.max(a.x + a.w, b.x + b.w)), y1 = Math.min(H, Math.max(a.y + a.h, b.y + b.h));
    if (x1 > x0 && y1 > y0) pieces.push([x0, y0, x1, y1]);
  }
  const xs = [...new Set(pieces.flatMap(q => [q[0], q[2]]))].sort((m, n) => m - n), ys = [...new Set(pieces.flatMap(q => [q[1], q[3]]))].sort((m, n) => m - n);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) if (pieces.some(q => q[0] <= xs[i] && q[2] >= xs[i + 1] && q[1] <= ys[j] && q[3] >= ys[j + 1])) area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
  return { impact: area / (W * H), distance: moves / Math.max(W, H) };
}
function length(value, parent, style) {
  if (/^\d+(?:\.\d+)?%$/.test(value) && !parent) throw new Error('Percentage block size needs a definite containing size; intrinsic percentage cycles are not modeled');
  const pieces = lengthPieces(value, parent, null, style);
  return pieces[0].value;
}

// `preferences` (internal) names non-default user preferences, e.g. 'prefers-color-scheme:dark'.
export function analyzeBoxTree(root, options, scrollbarProfile, budget, inlineSheets=[], inputDiagnostics=[], preferences=[]) {
  // A hovered re-layout (hover-at:<path>) still needs its own untransformed re-layout, so it keeps a pristine copy.
  const hovered = preferences.find(p => p.startsWith('hover-at:'))?.slice(9);
  const carouselIn = box => /^carousel$/i.test(String(box.aria?.['aria-roledescription'] ?? '').trim()) || (box.children ?? []).some(carouselIn);
  const pristine = (options.accessibility || options.integrity || /:hover|@(?:-webkit-)?keyframes/i.test(String(options.css ?? '')) || inlineSheets.length || carouselIn(root)) && preferences.every(p => p.startsWith('hover-at:')) ? structuredClone(root) : null;
  // The untransformed re-layout (CSS transforms removed): the layout boxes, which is what a layout shift compares.
  const untransformed = preferences.includes('untransformed');
  let sawTransform = false;
  const layoutWarnings = [], generatedTexts = [], textFonts = new Map();
  const animated = []; // boxes with a running animation whose keyframes lay out: {box, region, name}
  const domain = validateOptions(options), block = options.block ?? Boolean(options.viewport.height);
  const component = options.name ?? 'Document';
  const h = options.viewport.height ?? { min: 0, max: 0 };
  const initial = rectangle(domain, { min: q(h.min), max: q(h.max) });
  const diagnostics = [...inputDiagnostics], findings = [], checks = [], policies = [], sizes = [], queries = [], queryFacts = [], sourceUse = new Map(), subgrids = [], scrollbars = [], invalidSubstitutions = [];
  // Live geometry and waived obligations for the opt-in integrity rules.
  const geometry = [], waived = [];
  // Paint facts of the options.ancestors chain (html, body, …) for the accessibility rules.
  let ancestorPaint = [];
  let work = 0;
  const spend = count => {
    work += count;
    if(budget) {budget.remaining-=count;if(budget.remaining<0) throw Object.assign(new Error('Combined layout analysis work limit exceeded'),{code:'U_LAYOUT_LIMIT'});}
    if (work > 2_000_000) throw Object.assign(new Error('Layout analysis work limit exceeded'),{code:'U_LAYOUT_LIMIT'});
  };
  const unknown = (code, message, line, box, file = options.cssFile ?? '<css>') => diagnostics.push({ code, severity: 'unknown', message, ...(line ? { css: { file, line } } : {}), ...(box ? { box: box.label, path: box.path, source: box.source } : {}) });
  const ranges = region => ({ range: projection(region, 'x'), ...(block ? { heightRange: projection(region, 'y'), region: serialize(region) } : {}) });
  const issue = (code, message, box, region, axis) => diagnostics.push({ code, severity: 'error', message, box: box.label, path: box.path, source: box.source, ...(axis ? { axis } : {}), ...ranges(region) });
  const subgridError = (message, box, region, axis) => Object.assign(new Error(message), { code: 'U_LAYOUT_SUBGRID', box, region, axis });
  const boxes = [];
  // Parent links for combinator matching (a symbol: a structuredClone of the tree drops them, so set them here).
  const collect = box => { if (box) { boxes.push(box); for (const child of [...box.children, ...(box.inline ?? [])]) child[PARENT] = box; box.children.forEach(collect); } };
  collect(root);
  // Contracts of generated boxes (selector::before / ::after) are applied when the pseudo-element is generated.
  const pseudoContracts = Object.entries(options.boxes ?? {}).flatMap(([selector, contract]) => { const m = /^(.*)::(before|after)$/.exec(selector); return m ? [{ base: m[1], kind: m[2], selector, contract }] : []; });
  for (const [selector, contract] of Object.entries(options.boxes ?? {}).filter(([selector]) => !/::(?:before|after)$/.test(selector))) {
    const selected = boxes.filter(box => matches(selector, box));
    if (!selected.length) throw new Error(`Layout contract does not match a box: ${selector}`);
    for (const box of selected) { if (box.contract) throw new Error(`Ambiguous layout contracts for ${box.label}`); box.contract = contract; box.contractSelector = selector; }
  }
  // A cell's textRuns contracts size its anonymous text blocks, in DOM order.
  for (const box of boxes.filter(box => box.anonymousRuns)) {
    const runs = box.contract?.textRuns ?? [], anonymous = box.children.filter(child => child.anonymous);
    if (runs.length !== anonymous.length) unknown('U_LAYOUT_INTRINSIC', `${box.label} has ${anonymous.length} anonymous text block(s); give its contract one textRuns entry per text run`, undefined, box);
    anonymous.forEach((child, k) => { if (runs[k]) { child.contract = runs[k]; child.contractSelector = `${box.contractSelector} text ${k}`; } });
  }
  const styleSources = [...(options.reset ?? []).map((sheet, index) => ({ ...sheet, kind: 'reset', file: sheet.file ?? `<reset:${index}>` })), { css: options.css, kind: 'app', file: options.cssFile ?? '<css>' },...inlineSheets];
  const { rules, layers, keyframeFrames, fontFaces, transitionNotes = [], keyframeImportant = [], importIgnored = [] } = parseLayoutCSS(styleSources, (code, message, line, file, detail) => {
    if(detail) diagnostics.push({code,message,...detail});
    else unknown(code,message,line,undefined,file);
  });
  // A selector testing the value of an attribute that is dynamic on an element (an adapter's placeholder): whether
  // the rule applies there is not known.
  // Likewise a structural pseudo-class on the root of a component: its siblings in the page are not known.
  for (const box of boxes) if (box.attributes || !box[PARENT]) for (const rule of rules) for (const selector of rule.selectors ?? []) {
    const tests = dynamicAttributeTests(selector, box);
    const attributes = tests.filter(t => t.kind === 'attribute'), structural = tests.filter(t => ['structural', 'has'].includes(t.kind));
    if (attributes.length && !diagnostics.some(d => d.code === 'U_LAYOUT_ATTRIBUTE' && d.path === box.path)) unknown('U_LAYOUT_ATTRIBUTE', `${box.label}: ${selector.source} tests the value of ${attributes.map(t => t.name).join(', ')}, which is dynamic here`, rule.line, box, rule.file);
    if (structural.length && !diagnostics.some(d => d.code === 'U_LAYOUT_STRUCTURAL' && d.path === box.path)) unknown('U_LAYOUT_STRUCTURAL', `${box.label}: ${selector.source} tests its position among its siblings, which are outside the analyzed root`, rule.line, box, rule.file);
  }
  // A media-query gap: max-width: M and min-width: m with M < m ≤ M + 1 (767px and 768px) leave the widths strictly
  // between them matched by neither (Media Queries 4 treats width as continuous and warns of exactly this; its range
  // syntax, width < 768px, has no gap). A zoomed page or a fractional device pixel ratio can make the CSS viewport
  // width fractional. Not measured: Chromium, Firefox and WebKit round an iframe's viewport width to whole pixels, and
  // browser zoom could not be driven here. Gaps of 0.02px or less (Bootstrap's 767.98px) are the common workaround and
  // are not reported. Reported where the two rules set the same property on the same selector.
  {
    const widthAtoms = rule => rule.contexts.filter(c => c.kind === 'media').flatMap(c => c.groups?.length === 1 ? c.groups[0].filter(a => a.feature === 'width') : []);
    const set = rule => new Set(rule.selectors.flatMap(sel => rule.declarations.map(d => `${sel.source}|${d.property}`)));
    const below = rules.flatMap(rule => widthAtoms(rule).filter(a => a.relation === '<=').map(a => ({ rule, value: a.value })));
    const above = rules.flatMap(rule => widthAtoms(rule).filter(a => a.relation === '>=').map(a => ({ rule, value: a.value })));
    for (const b of below) for (const a of above) {
      if (!(cmp(sub(a.value, b.value), div(q(1), q(50))) > 0 && cmp(sub(a.value, b.value), q(1)) <= 0)) continue;
      const shared = [...set(b.rule)].filter(key => set(a.rule).has(key));
      if (!shared.length || layoutWarnings.some(w => w.code === 'W_CSS_MEDIA_GAP' && w.max === number(b.value) && w.min === number(a.value))) continue;
      const [selector, property] = shared[0].split('|');
      layoutWarnings.push({ code: 'W_CSS_MEDIA_GAP', severity: 'warning', max: number(b.value), min: number(a.value), selector, property,
        message: `@media (max-width: ${number(b.value)}px) and @media (min-width: ${number(a.value)}px) leave the widths between them matched by neither (a zoomed page or a fractional device pixel ratio can make the viewport ${(number(b.value) + number(a.value)) / 2}px wide): there ${selector} gets neither rule's ${property}. Use max-width: ${number(a.value) - 0.02}px, or a range query (width < ${number(a.value)}px)` });
    }
  }
  for (const note of importIgnored) layoutWarnings.push({ code: 'W_CSS_IMPORT_IGNORED', severity: 'warning', css: [{ property: '@import', file: note.file, line: note.line, selector: '@import' }],
    message: `@import ${note.params} is ${note.nested ? 'inside another rule' : 'after other rules'}: @import is only valid before every other rule of the sheet (after @charset and @layer statements), so the browser ignores it and the sheet is never loaded. Move it to the top${note.nested ? ' (with the condition written as @import url(...) <media query>)' : ''}` });
  for (const note of keyframeImportant) layoutWarnings.push({ code: 'W_CSS_KEYFRAME_IMPORTANT', severity: 'warning', keyframes: note.name, css: [{ property: note.property, file: note.file, line: note.line, selector: `@keyframes ${note.name}` }],
    message: `@keyframes ${note.name}: ${note.property} is marked !important, which makes it invalid in a keyframe: the browser ignores the declaration and the animation never changes ${note.property} there. Remove !important (an animation already overrides every normal declaration)` });
  for (const note of transitionNotes) layoutWarnings.push({ code: 'W_CSS_TRANSITION_DISPLAY', severity: 'warning', selector: note.selector, css: [{ property: 'transition', file: note.file, line: note.line, selector: note.selector }],
    message: `${note.selector} transitions display, which does not animate without transition-behavior: allow-discrete: the box appears or disappears at once (a fade-out ends cut off). Add transition-behavior: allow-discrete (and @starting-style for the fade in), or transition opacity and visibility instead` });
  if (rules.some(rule => rule.stateLayout && !rule.hoverLayout) && !options.accessibility) unknown('U_LAYOUT_SELECTOR', 'A :focus rule changes the layout; the focused layout is modeled for the accessibility checks only');
  if (rules.some(rule => rule.stateGeometry) && !options.accessibility && !options.integrity) unknown('U_LAYOUT_SELECTOR', 'A state rule moves a box (focus insets or a transform); that is modeled for the accessibility and integrity checks only');
  // style attributes: each element's declarations as a rule that matches only it, element-attached in the cascade.
  for (const box of boxes.filter(box => box.inlineStyle !== undefined)) {
    if (box.inlineStyle === 'dynamic') { unknown('U_LAYOUT_CSS', `${box.label}: a dynamic style attribute decides its styles`, undefined, box); continue; }
    const attached = parseLayoutCSS([{ css: `*{${box.inlineStyle}}`, file: `${box.label} style attribute` }], (code, message, line, file, detail) => { if (detail) diagnostics.push({ code, message, ...detail }); else unknown(code, message, line, box, file); }).rules;
    for (const rule of attached) { rule.selectors = [{ source: `${box.label} [style]`, parts: [{ kind: 'path', value: box.path }], specificity: [0, 0, 0] }]; rule.attached = true; rules.push(rule); }
  }
  // An animation frame re-layout: the keyframe's layout declarations apply to that one box (animations override the
  // author's normal declarations, like an element-attached rule).
  if (options.$animationFrame) {
    const frame = parseLayoutCSS([{ css: `*{${options.$animationFrame.css}}`, file: 'keyframe' }], (code, message) => unknown(code, message)).rules;
    for (const rule of frame) { rule.selectors = [{ source: `${options.$animationFrame.path} [keyframe]`, parts: [{ kind: 'path', value: options.$animationFrame.path }], specificity: [0, 0, 0] }]; rule.attached = true; rules.push(rule); }
  }
  for (const rule of rules) rule.layerName = rule.layer === null ? undefined : layers[rule.layer];
  const bounded = values => { spend(values.length); if (values.length > 512) throw new Error('Layout state limit exceeded'); return values; };

  // Table cells do not overflow their height: the row grows with the content (not modeled), so it is Unknown there.
  function cellGrows(available, required, box, region) {
    const failed = clip(region, diff(required, available), true);
    if (failed) diagnostics.push({ code: 'U_LAYOUT_TABLE', severity: 'unknown', message: `${box.label}: the content is taller than the cell here; a table row grows with its content`, box: box.label, path: box.path, source: box.source, axis: 'block', ...ranges(failed) });
  }
  // scrollIntent: 'css' (an option; the component lint sets it): a container that scrolls on an axis (overflow auto or
  // scroll) states that its content may be scrolled to, as an overflow: 'scroll' contract does, so its tracks or items
  // going past its content box on that axis are not reported (hidden or clip, which cut the content off, still are).
  // By default the intent must be a contract (ADR: overflow policy), and CSS alone does not waive the obligation.
  const scrolls = (style, axis) => options.scrollIntent === 'css' && ['auto', 'scroll'].includes(String(style[`overflow-${axis}`]));
  function obligation(available, required, box, region, code, axis, enabled = true, explain, annotate) {
    checks.push({ box: box.label, path: box.path, code, axis, ...ranges(region), available: affine(available), required: affine(required), enforced: enabled });
    if (!enabled) {
      // A contract allowed this overflow; the integrity rules still report where it happens.
      const failed = clip(region, diff(required, available), true);
      if (failed) waived.push({ box, path: box.path, code, axis, region: failed, self: code !== 'E_LAYOUT_ITEM_SIZE' });
      return;
    }
    const failed = clip(region, diff(required, available), true);
    if (!failed) return;
    const p = sample(failed), need = evaluate(required, p), offered = evaluate(available, p);
    findings.push({ code, severity: 'error', box: box.label, path: box.path, source: box.source, axis,
      message: code === 'E_LAYOUT_ABSOLUTE_CLIPPED' ? `${box.label} reaches past its containing block ${box[PARENT]?.label ?? ''}, which hides its overflow: it needs ${exact(need)}px but only ${exact(offered)}px is visible on the ${axis} axis at viewport ${exact(p.x)}px${block ? ` × ${exact(p.y)}px` : ''}, so the rest is cut off`
        : `${box.label} requires ${exact(need)}px but receives ${exact(offered)}px on ${axis} axis at viewport ${exact(p.x)}px${block ? ` × ${exact(p.y)}px` : ''}`,
      ...ranges(failed), signature: JSON.stringify([box.path, code, axis, affine(available), affine(required)]),
      witness: { viewport: number(p.x), viewportExact: exact(p.x), ...(block ? { viewportHeight: number(p.y), viewportHeightExact: exact(p.y) } : {}), available: number(offered), required: number(need) },
      ...(explain ? { explanation: explain() } : {}),
      ...(annotate ? annotate(offered) : {}),
    });
  }

  // The file an img or source loads: its one srcset candidate, or (under a device pixel ratio) the smallest density at
  // least that ratio, else the densest. An img's src is its 1x candidate. 'dynamic' when not decided (w descriptors,
  // several candidates without a ratio, a dynamic attribute).
  function loadedSource(srcset, src) {
    if (srcset === undefined) return src;
    if (srcset === 'dynamic') return 'dynamic';
    const list = [];
    for (const part of srcset.split(',').map(p => p.trim()).filter(Boolean)) {
      const m = /^(\S+)(?:\s+(\d+(?:\.\d+)?)x)?$/.exec(part);
      if (!m || list.some(c => c.density === Number(m[2] ?? 1))) return 'dynamic';
      list.push({ url: m[1], density: Number(m[2] ?? 1) });
    }
    if (typeof src === 'string' && src !== 'dynamic' && !list.some(c => c.density === 1)) list.push({ url: src, density: 1 });
    if (list.length === 1) return list[0].url;
    const ratio = options.$devicePixelRatio;
    if (!list.length) return 'dynamic';
    if (ratio === undefined) return { candidates: list.map(c => c.url) };
    const sorted = [...list].sort((a, b) => a.density - b.density);
    return (sorted.find(c => c.density >= ratio) ?? sorted.at(-1)).url;
  }
  function context(condition, ancestors) {
    let target;
    if (condition.kind === 'media') target = { inline: width, block: options.viewport.height ? height : null };
    else {
      const needsBlock = condition.groups.flat().some(atom => !inlineFeature(atom.feature));
      target = ancestors.findLast(ancestor => (!condition.name || ancestor.names.includes(condition.name)) &&
        (ancestor.type === 'size' || (!needsBlock && ancestor.type === 'inline-size')));
      if (!target) return { groups: [], target: undefined };
    }
    const groups = condition.groups.map(group => group.map(atom => {
      // Device resolution: a constant under the analysed device pixel ratio (the devicePixelRatios option).
      if (atom.feature === 'resolution') {
        if (options.$devicePixelRatio === undefined) throw Object.assign(new Error('A resolution media query needs the devicePixelRatios option'), { code: 'U_LAYOUT_QUERY' });
        return { slack: scalar(sub(q(String(options.$devicePixelRatio)), atom.value)), relation: atom.relation };
      }
      if (atom.feature === 'orientation') {
        if (!target.block) throw new Error('An orientation query needs the viewport height domain');
        return { slack: atom.orientation === 'portrait' ? diff(target.block, target.inline) : diff(target.inline, target.block), relation: atom.relation };
      }
      const size = inlineFeature(atom.feature) ? target.inline : target.block;
      if (!size) throw new Error('Height condition needs a known container/viewport block size');
      return { slack: diff(size, scalar(atom.value)), relation: atom.relation };
    }));
    return { groups, target: target.box?.label, path: target.box?.path };
  }
  function styles(box, region, ancestors, inherited, emit, gridItem = true, state) {
    spend(rules.length + 1);
    if (preferences.length) state = new Set([...(state ?? []), ...preferences]);
    if (box.pseudo) state = new Set([...(state ?? []), `::${box.pseudo}`]);
    // The focused re-layout: the one focused box (focus-at:<path>) has :focus/:focus-visible, its ancestors :focus-within.
    const focusAt = preferences.find(p => p.startsWith('focus-at:'))?.slice(9);
    if (focusAt !== undefined && !box.pseudo && (box.path === focusAt || focusAt.startsWith(box.path + '/'))) state = new Set([...(state ?? []), 'focus-within', ...(box.path === focusAt ? ['focus', 'focus-visible'] : [])]);
    // The hovered re-layout: the hovered box and its ancestors match :hover.
    if (hovered !== undefined && !box.pseudo && (box.path === hovered || hovered.startsWith(box.path + '/'))) state = new Set([...(state ?? []), 'hover']);
    // :checked holds for a checkbox/radio with the checked attribute unless the unchecked state is asked for.
    if (box.nativeStates?.checked && !state?.has('unchecked')) state = new Set([...(state ?? []), 'checked']);
    const relevant = rules.filter(rule => rule.selectors.some(selector => matches(selector, box, state)));
    const contexts = new Map();
    for (const rule of relevant) for (const condition of rule.contexts) if (!contexts.has(condition)) contexts.set(condition, context(condition, ancestors));
    // An img in a picture: the first earlier source with a srcset whose media matches (and whose type Chromium
    // decodes) is selected; its media conditions split the region like a media rule.
    const pictureSources = (() => {
      const picture = box.tag === 'img' && !box.pseudo ? ancestors.at(-1)?.box : null;
      if (picture?.tag !== 'picture') return [];
      return (picture.children ?? []).slice(0, picture.children.indexOf(box)).filter(child => child.tag === 'source' && child.imageSize?.srcset !== undefined).map(source => {
        const facts = source.imageSize;
        if ([facts.srcset, facts.media, facts.type].includes('dynamic')) throw Object.assign(new Error(`${box.label}: a picture source with a dynamic srcset, media or type is not modeled`), { code: 'U_LAYOUT_IMAGE' });
        if (facts.type !== undefined && !/^image\/(?:avif|webp|png|jpeg|gif|svg\+xml)$/i.test(facts.type.trim())) throw Object.assign(new Error(`${box.label}: a picture source of type ${facts.type} may not be decoded`), { code: 'U_LAYOUT_IMAGE' });
        let condition = null;
        if (facts.media !== undefined && facts.media.trim() && facts.media.trim().toLowerCase() !== 'all') {
          try { condition = parseCondition(facts.media, 'media'); } catch (error) { throw Object.assign(new Error(`${box.label}: source media ${facts.media}: ${error.message}`), { code: 'U_LAYOUT_IMAGE' }); }
          if (condition.groups.flat().some(atom => atom.preference)) throw Object.assign(new Error(`${box.label}: a preference media query on a picture source is not modeled`), { code: 'U_LAYOUT_IMAGE' });
          contexts.set(condition, context(condition, ancestors));
        }
        return { condition, facts, src: loadedSource(facts.srcset) };
      });
    })();
    let regions = [region];
    const split = new Set();
    for (const compiled of contexts.values()) for (const atom of compiled.groups.flat()) {
      const key = JSON.stringify([affine(atom.slack), atom.relation]);
      if (split.has(key)) continue; split.add(key);
      regions = regions.flatMap(r => { const p = partition(r, atom.slack, atom.relation); return [...p.yes, ...p.no]; });
      if (regions.length > 512) throw new Error('Conditional region limit exceeded');
    }
    return regions.map(r => {
      const p = sample(r), activeContext = compiled => compiled.groups.some(group => group.every(atom => compare(cmp(evaluate(atom.slack, p), zero), atom.relation)));
      const active = rule => rule.contexts.every(condition => activeContext(contexts.get(condition)));
      let style;
      try {style=computeStyle(relevant,box,active,inherited,{spend,state});}
      catch(error) {error.box ??= box;throw error;}
      // reportTextFonts: the computed font of each text leaf (for a caller that measures it with a font file and
      // analyses again with a font contract); 'varied' where it differs across the domain.
      // (A text field's placeholder too: its text and the field's font.)
      if (options.reportTextFonts && !state && box.tag === 'input' && typeof box.attributes?.placeholder === 'string' && box.attributes.placeholder.trim()) {
        const facts = { placeholder: true, classes: box.classes, text: box.attributes.placeholder, family: style['font-family'], size: style['font-size'], lineHeight: style['line-height'], weight: style['font-weight'], style: style['font-style'], whiteSpace: 'nowrap', overflowWrap: 'normal', letterSpacing: style['letter-spacing'], lang: style.$lang };
        const seen = textFonts.get(box.path);
        textFonts.set(box.path, seen && (seen === 'varied' || JSON.stringify(seen) !== JSON.stringify(facts)) ? 'varied' : facts);
      }
      if (options.reportTextFonts && !state && box.text && !box.pseudo && !(box.inline ?? []).length && !box.anonymous) {
        const hint = name => box.attributes && Object.hasOwn(box.attributes, name) ? box.attributes[name] : undefined;
        const facts = { classes: box.classes, text: box.textContent ?? '', ...(hint('data-text-one-line') !== undefined ? { oneLine: true } : {}), ...(hint('data-text-max-length') !== undefined ? { maxLength: hint('data-text-max-length') } : {}), ...(hint('data-text-chars') !== undefined ? { characters: hint('data-text-chars') } : {}), family: style['font-family'], size: style['font-size'], lineHeight: style['line-height'], weight: style['font-weight'], style: style['font-style'], whiteSpace: style['white-space'], overflowWrap: style['overflow-wrap'], letterSpacing: style['letter-spacing'], lang: style.$lang, textOverflow: style['text-overflow'], overflowX: style['overflow-x'], label: box.label };
        const seen = textFonts.get(box.path);
        textFonts.set(box.path, seen && seen !== 'varied' && JSON.stringify(seen) !== JSON.stringify(facts) ? 'varied' : seen === 'varied' ? 'varied' : facts);
      }
      if (gridItem && inherited && ['inline', 'inline-block'].includes(style.display)) style = { ...style, display: 'block', $inlineLevel: true };
      // content-visibility: auto: on screen the box lays out as usual; offscreen it is size-contained. Admitted where
      // its width does not come from its content (block flow, or grid columns that are not content-sized), so that
      // only its height changes offscreen (W_LAYOUT_CONTENT_VISIBILITY_SIZE).
      if (style['content-visibility'] === 'auto') {
        const ps = ancestors.at(-1)?.style;
        const contentSized = !ps || !(ps.$blockFlow || ['block', 'list-item'].includes(ps.display) || (ps.display === 'grid' && !/\b(?:auto|min-content|max-content|fit-content)\b/.test(String(ps['grid-template-columns'])) && String(ps['grid-template-columns']) !== 'none')) || ['absolute', 'fixed'].includes(style.position) || style.$fixed;
        if (contentSized) throw Object.assign(new Error(`${box.label}: content-visibility: auto size-contains it offscreen, and its width depends on its content here; that is not modeled`), { code: 'U_LAYOUT_CSS', box });
      }
      // A list item lays out as a block: its outside marker takes no part in the layout (measured). An inside marker
      // is an inline box in the first line, which is not modeled.
      // resize lets the user drag the box's size, which the analysis does not know; it applies only to a box whose
      // overflow is not visible (CSS UI 4 §6.1). Elsewhere it does nothing (W_LAYOUT_DECLARATION_INERT).
      if (style.resize && style.resize !== 'none' && ['overflow-x', 'overflow-y'].some(key => !['visible', 'clip'].includes(String(style[key])))) throw Object.assign(new Error(`${box.label} is resize: ${style.resize}: the user can drag its size, which is not modeled`), { code: 'U_LAYOUT_CSS', box });
      if (style.display === 'list-item') {
        if (style['list-style-position'] === 'inside' && style['list-style-type'] !== 'none') throw Object.assign(new Error(`${box.label} has an inside list marker, which takes part in its first line; that is not modeled`), { code: 'U_LAYOUT_CSS', box });
        style = { ...style, display: 'block', $listItem: true };
      }
      // position: sticky with every inset auto never sticks (a sticky box is offset only by its inset properties):
      // it is laid out like position: relative, and the author probably forgot top: 0.
      if (style.$sticky && !box.pseudo && ['top', 'bottom', 'left', 'right'].every(side => style[side] === undefined || style[side] === 'auto')) {
        style = { ...style, $sticky: false };
        if (emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_STICKY_NO_INSET' && w.path === box.path)) layoutWarnings.push({ code: 'W_LAYOUT_STICKY_NO_INSET', severity: 'warning', box: box.label, path: box.path,
          message: `${box.label} is position: sticky with no top, bottom, left or right: a sticky box sticks only by its insets, so it scrolls away like position: relative. Add top: 0 (or the edge it should stick to)`, ...ranges(r) });
      }
      // An absolute box with both insets of an axis (inset: 0 overlays): an auto size fills the containing block
      // between them, width = 100% − start − end − its own padding and border under content-box (CSS 2 §10.3.7); with
      // an explicit size it is over-constrained and the end inset is ignored (right in ltr, left in rtl; bottom).
      // An absolute box with both insets of an axis auto sits at its static position. In a grid container that is the
      // container's padding edge (css-grid-1 §9.4); when that container is also the containing block (positioned),
      // it is an inset of 0 on the start side (the visually hidden "sr-only" pattern, a badge without offsets).
      if (style.position === 'absolute' && !style.$fixed && !box.pseudo) {
        const parentStyle = ancestors.at(-1)?.style;
        if (parentStyle && ['grid', 'inline-grid'].includes(parentStyle.display) && parentStyle.position !== 'static') {
          const none = side => style[side] === undefined || style[side] === 'auto';
          const inlineStart = style.direction === 'rtl' ? 'right' : 'left';
          if (none('left') && none('right')) style = { ...style, [inlineStart]: '0px', $staticPosition: true };
          // That edge is where the box sits only when it is not aligned: its align-self, or the grid's align-items, moves
          // the static position (measured: align-items: flex-end on an 80px grid puts a 20px absolute child at 60).
          const aligned = value => !['auto', 'normal', 'stretch', 'start', 'flex-start', 'self-start'].includes(String(value ?? 'auto'));
          const blockAlign = String(style['align-self'] ?? 'auto') === 'auto' ? parentStyle['align-items'] : style['align-self'];
          if (none('top') && none('bottom') && aligned(blockAlign)) throw Object.assign(new Error(`${box.label}: an absolute box with auto top and bottom aligned by ${String(style['align-self'] ?? 'auto') === 'auto' ? `its grid's align-items: ${blockAlign}` : `align-self: ${blockAlign}`} has a static position that is not modeled`), { code: 'U_LAYOUT_CSS', box });
          if (none('top') && none('bottom')) style = { ...style, top: '0px', $staticPosition: true };
        }
      }
      if (style.position === 'absolute') {
        const sized = (start, end, size, edges) => {
          const set = side => style[side] !== undefined && style[side] !== 'auto';
          if (!set(start) || !set(end)) return;
          if (style[size] === 'auto') {
            const own = style['box-sizing'] === 'content-box' ? edges.flatMap(edge => [style[`padding-${edge}`], style[`border-${edge}`]]).filter(v => v && !['0', '0px', 'ua'].includes(v)) : [];
            const minus = [style[start], style[end], ...own].filter(v => !['0', '0px'].includes(v));
            style = { ...style, [size]: minus.length ? `calc(100% - ${minus.join(' - ')})` : '100%', [end]: 'auto' };
          } else style = { ...style, [end]: 'auto' };
        };
        sized(style.direction === 'rtl' ? 'right' : 'left', style.direction === 'rtl' ? 'left' : 'right', 'inline-size', ['left', 'right']);
        sized('top', 'bottom', 'block-size', ['top', 'bottom']);
        // An auto width left after the insets shrinks to fit its content; under inline-size containment
        // (container-type: inline-size / size) the content counts for nothing, so it is its padding and border.
        if (style['inline-size'] === 'auto' && ['inline-size', 'size'].includes(style['container-type'])) {
          const sides = ['left', 'right'].flatMap(side => [style[`padding-${side}`], style[`border-${side}`]]).map(v => v === 'ua' || v === undefined ? '0' : String(v));
          if (sides.every(v => /^(?:0|\d+(?:\.\d+)?px)$/.test(v))) {
            const edges = sides.reduce((total, v) => total + (v === '0' ? 0 : Number(v.slice(0, -2))), 0);
            style = { ...style, 'inline-size': style['box-sizing'] === 'content-box' ? '0px' : `${edges}px`, $containerCollapse: true };
          }
        }
      }
      // A line-clamped text leaf (-webkit-box, vertical, -webkit-line-clamp: N): a block whose height is at most N lines.
      if (style.display === '-webkit-box' && !box.pseudo) {
        if (style['box-orient'] !== 'vertical' || !/^\d+$/.test(style['line-clamp']) || !box.text || (box.children ?? []).length || !/^\d+(?:\.\d+)?px$/.test(style['line-height'])) throw Object.assign(new Error(`${box.label}: display: -webkit-box is modeled as a line clamp of a text leaf (-webkit-box-orient: vertical, -webkit-line-clamp: N, a px line-height)`), { code: 'U_LAYOUT_CSS' });
        style = { ...style, display: 'block', $lineClamp: Number(style['line-clamp']) };
      }
      // An img's width/height attributes are presentational hints (below every author rule) for its width and height,
      // and set its aspect-ratio to auto w / h (HTML rendering §15.4.3; measured).
      const chosen = pictureSources.find(source => !source.condition || activeContext(contexts.get(source.condition)));
      if (emit && pictureSources.length) {
        const use = sourceUse.get(box.path) ?? { box, sources: pictureSources, chosen: new Set(), active: new Set() };
        sourceUse.set(box.path, use);
        if (chosen) use.chosen.add(pictureSources.indexOf(chosen));
        pictureSources.forEach((source, i) => { if (!source.condition || activeContext(contexts.get(source.condition))) use.active.add(i); });
      }
      // A selected source with width or height attributes is the image's dimension source; else the img's own.
      const imageFacts = chosen ? { ...((chosen.facts.width !== undefined || chosen.facts.height !== undefined) ? { width: chosen.facts.width, height: chosen.facts.height } : { width: box.imageSize?.width, height: box.imageSize?.height }), src: chosen.src } : box.imageSize && { ...box.imageSize, src: loadedSource(box.imageSize.srcset, box.imageSize.src) };
      // video: its width/height attributes are size hints and aspect-ratio auto w / h too (HTML rendering §15.4.3).
      // An iframe is a replaced box of 300×150 by default (its width/height attributes are presentational hints) with
      // no natural aspect ratio: an auto height stays 150px whatever its width, unless aspect-ratio sizes it.
      if (box.tag === 'iframe' && !box.pseudo && style.display === 'block') {
        const { width: w, height: hgt } = box.imageSize ?? {};
        if (style['inline-size'] === 'auto' && !style.$sources['inline-size'] && (w === undefined || Number.isFinite(w))) style = { ...style, 'inline-size': `${w ?? 300}px` };
        if (style['block-size'] === 'auto' && !style.$sources['block-size'] && (hgt === undefined || Number.isFinite(hgt)) && (style['aspect-ratio'] === 'auto' || !style.$sources['aspect-ratio']))
          style = { ...style, 'block-size': `${hgt ?? 150}px`, ...(hgt === undefined && style.$sources['inline-size'] ? { $embedDefaultHeight: true } : {}) };
      }
      // An inline svg (a replaced box, measured in Chromium): width/height attributes are presentational hints; with a
      // width its height is the height attribute, else width × the viewBox ratio, else 150px; with only a height its
      // width is height ÷ the ratio, else 300px; with neither, a viewBox fills the grid area (ratio height) and no
      // viewBox is 300×150. Stretch-fit in a flex container is not modeled.
      if (box.tag === 'svg' && !box.pseudo) {
        const facts = box.svgSize ?? {}, vb = facts.viewBox;
        if ([facts.width, facts.height].includes('dynamic') || vb === 'dynamic') throw Object.assign(new Error(`${box.label}: an svg with a dynamic width, height or viewBox is not modeled`), { code: 'U_LAYOUT_ELEMENT', box });
        if (style.display === 'inline') style = { ...style, display: 'block' };
        // The color its shapes are drawn in: a shape's own fill/stroke attribute, else author CSS on the svg, else the
        // svg's attribute, else the inherited value (initial fill black, stroke none). Fill wins if both paint.
        {
          const paint = facts.paint ?? {}, value = key => {
            const shape = paint[key === 'fill' ? 'shapeFill' : 'shapeStroke'];
            if (shape === 'mixed' || shape === 'dynamic') return 'dynamic';
            const v = shape ?? (style.$sources[key] ? style[key] : paint[key] ?? style[key]);
            return String(v).toLowerCase() === 'currentcolor' ? style.color : v;
          };
          const fill = value('fill'), stroke = value('stroke');
          style = { ...style, $iconPaint: [fill, stroke].includes('dynamic') ? 'dynamic' : fill !== 'none' && stroke !== 'none' && String(fill) !== String(stroke) ? 'dynamic' : fill !== 'none' ? fill : stroke };
        }
        const authored = key => style.$sources[key] && style[key] !== 'auto';
        if (!authored('inline-size') && facts.width) style = { ...style, 'inline-size': facts.width };
        if (!authored('block-size') && facts.height) style = { ...style, 'block-size': facts.height };
        const w = style['inline-size'], h = style['block-size'], ratio = vb ? `${vb.width}/${vb.height}` : null;
        const parentDisplay = ancestors.at(-1)?.style?.display;
        if (w !== 'auto' && h === 'auto') style = ratio && !authored('aspect-ratio') ? { ...style, 'aspect-ratio': ratio } : authored('aspect-ratio') ? style : { ...style, 'block-size': '150px' };
        else if (w === 'auto' && h !== 'auto') {
          if (!/^\d+(?:\.\d+)?px$/.test(h)) throw Object.assign(new Error(`${box.label}: an svg sized by a non-px height alone is not modeled`), { code: 'U_LAYOUT_ELEMENT', box });
          style = { ...style, 'inline-size': vb ? `${+(parseFloat(h) * vb.width / vb.height).toFixed(6)}px` : '300px' };
        } else if (w === 'auto' && h === 'auto') {
          if (vb && !['grid', 'inline-grid'].includes(parentDisplay)) throw Object.assign(new Error(`${box.label}: an unsized svg with a viewBox fills its container; outside a grid area that is not modeled`), { code: 'U_LAYOUT_ELEMENT', box });
          style = { ...(vb ? { ...style, 'inline-size': '100%', 'aspect-ratio': ratio } : { ...style, 'inline-size': '300px', 'block-size': '150px' }), $svgUnsized: vb ? 'fills' : 'default' };
        }
      }
      if (['img', 'video'].includes(box.tag) && imageFacts && !box.pseudo) {
        const { width: w, height: hgt } = imageFacts;
        if (Number.isFinite(w) && style['inline-size'] === 'auto' && !style.$sources['inline-size']) style = { ...style, 'inline-size': `${w}px`, ...(!style.$sources['max-inline-size'] ? { $widthFromAttribute: w } : {}) };
        if (Number.isFinite(hgt) && style['block-size'] === 'auto' && !style.$sources['block-size']) style = { ...style, 'block-size': `${hgt}px` };
        if (Number.isFinite(w) && Number.isFinite(hgt) && w > 0 && hgt > 0 && style['aspect-ratio'] === 'auto' && !style.$sources['aspect-ratio']) style = { ...style, 'aspect-ratio': `auto ${w}/${hgt}` };
        // The loaded image's natural size (a static file read at build time) against what was reserved before it loads.
        // Several density candidates without a device pixel ratio: decided only when every candidate file has one ratio.
        if (imageFacts.src?.candidates) {
          const sizes = imageFacts.src.candidates.map(url => options.images?.[url]);
          if (sizes.every(Boolean) && sizes.some(size => size.width * sizes[0].height !== size.height * sizes[0].width)) throw Object.assign(new Error(`${box.label}: its srcset candidates have different ratios, so its loaded height depends on the device pixel ratio; give the devicePixelRatios option`), { code: 'U_LAYOUT_IMAGE' });
          imageFacts.src = sizes.every(Boolean) ? imageFacts.src.candidates[0] : 'dynamic';
        }
        const natural = typeof imageFacts.src === 'string' ? options.images?.[imageFacts.src] : undefined;
        if (style['block-size'] === 'auto' && natural) {
          const reserved = /^auto (\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(style['aspect-ratio']);
          if (style['aspect-ratio'] === 'auto') style = { ...style, 'aspect-ratio': `auto ${natural.width}/${natural.height}`, $imageUnreserved: { ...natural, src: imageFacts.src } };
          else if (reserved && Number(reserved[1]) * natural.height !== Number(reserved[2]) * natural.width) style = { ...style, $imageRatioMismatch: { src: imageFacts.src, natural, reserved: `${reserved[1]}/${reserved[2]}` } };
        }
        // The ratio an img's picture is drawn at (its file's size, else its width/height attributes), for object-fit: fill.
        // A box with aspect-ratio auto … and an auto size follows the loaded file, so it cannot stretch it.
        const drawn = natural ?? (Number.isFinite(w) && Number.isFinite(hgt) && w > 0 && hgt > 0 ? { width: w, height: hgt } : null);
        if (box.tag === 'img' && drawn) style = { ...style, $imageRatio: { width: drawn.width, height: drawn.height, basis: natural ? 'file' : 'attributes', follows: /^auto\b/.test(style['aspect-ratio']) && (style['inline-size'] === 'auto' || style['block-size'] === 'auto') } };
      }
      // A user-agent checkbox or radio (appearance auto, size, padding, border and minimum untouched): Chromium draws it
      // 13×13 border-box (measured). Laid out at that size for the accessibility checks; SC 2.5.8/2.5.5 exempt it.
      if (options.accessibility && !box.pseudo && box.tag === 'input' && ['checkbox', 'radio'].includes(box.inputType) && style.appearance === 'auto' && ['ua', 'inline-block', 'block'].includes(style.display)
        && ['inline-size', 'block-size'].every(key => style[key] === 'auto') && ['left', 'right', 'top', 'bottom'].every(side => ['ua', '0', '0px'].includes(style[`padding-${side}`]) && ['ua', '0', '0px'].includes(style[`border-${side}`])) && ['min-inline-size', 'min-block-size'].every(key => ['ua', 'auto'].includes(style[key])))
        style = { ...style, appearance: 'none', display: 'block', 'box-sizing': 'border-box', 'inline-size': '13px', 'block-size': '13px', 'min-inline-size': 'auto', 'min-block-size': 'auto', ...Object.fromEntries(['left', 'right', 'top', 'bottom'].flatMap(side => [[`padding-${side}`, '0'], [`border-${side}`, '0']])), $uaControl: true };
      if (emit) for (const entry of style.$invalid) invalidSubstitutions.push({ box: box.label, path: box.path, property: entry.property, longhands: entry.longhands, css: { file: entry.file, line: entry.line }, reason: entry.code === 'U_LAYOUT_VARIABLE_CYCLE' ? 'cycle' : 'guaranteed-invalid', message: entry.message, resolution: 'unset', ...ranges(r) });
      if (emit) for (const [condition, compiled] of contexts) if (condition.kind === 'container') {
        queries.push({ box: box.label, path: box.path, name: condition.name, target: compiled.target, targetPath: compiled.path, matched: activeContext(compiled), ...ranges(r) });
        queryFacts.push({ condition, target: compiled.target, box: box.label, matched: activeContext(compiled), region: r });
      }
      if (style.transform !== 'none' && !box.pseudo) { if (untransformed) style = { ...style, transform: 'none' }; else sawTransform = true; }
      return { region: r, style };
    });
  }
  const maximum = (region, a, b) => {
    const p = partition(region, diff(a, b), '>=');
    return [...p.yes.map(region => ({ region, value: a })), ...p.no.map(region => ({ region, value: b }))];
  };
  const clamp = (region, value) => maximum(region, value, scalar(0));
  // The block-per-inline factor of an aspect-ratio (h / w), or null for auto.
  const ratioOf = style => { const m = /(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(String(style['aspect-ratio'] ?? 'auto')); return m ? div(q(m[2]), q(m[1])) : null; };
  const minimumOf = (region, a, b) => {
    const p = partition(region, diff(b, a), '>=');
    return [...p.yes.map(region => ({ region, value: a })), ...p.no.map(region => ({ region, value: b }))];
  };
  // A box paints when it has a border or a background (vlmkit's painted-parent filter).
  const paints = style => ['left','right','top','bottom'].some(side => cmp(px(style[`border-${side}`]), zero) > 0) || style['background-image'] !== 'none' ||
    !/^(?:transparent|initial|unset|revert|rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*0\s*\)|#(?:[\da-f]{3}0|[\da-f]{6}00)|hsla\([^)]*,\s*0\s*\))$/.test(style['background-color']);
  // Flex sizes: constants compared without splitting a region.
  const constantLess = (a, b) => cmp(evaluate(a, { x: zero, y: zero }), evaluate(b, { x: zero, y: zero })) < 0 && cmp(a.x, zero) === 0 && cmp(a.y, zero) === 0 && cmp(b.x, zero) === 0 && cmp(b.y, zero) === 0;
  const maximumConstant = (a, b) => { if ([a, b].some(v => cmp(v.x, zero) || cmp(v.y, zero))) throw flexUnknown('A content-dependent minimum with a different base is outside the subset'); return constantLess(a, b) ? b : a; };
  function intrinsic(box, content, region) {
    const value = box.contract?.intrinsicBlockSize;
    if (typeof value === 'number') return [{ region, value: scalar(value) }];
    if (Array.isArray(value)) {
      let states = [{ region, value: null }];
      for (const entry of value) states = states.flatMap(state => {
        const p = partition(state.region, diff(content, scalar(entry.atLeastInlineSize)), '>=');
        return [...p.yes.map(region => ({ region, value: entry.blockSize === null ? 'undetermined' : scalar(entry.blockSize) })), ...p.no.map(region => ({ ...state, region }))];
      });
      for (const state of states) {
        if (!state.value) unknown('U_LAYOUT_INTRINSIC', 'Intrinsic block profile does not cover the available inline size', undefined, box);
        else if (state.value === 'undetermined') { const r = ranges(state.region).range; unknown('U_LAYOUT_INTRINSIC', `The line count depends on text-spacing-trim (a closing bracket at a line end may be set half-width)${r ? ` for viewport width ${r.minExact}..${r.maxExact}` : ''}`, undefined, box); }
      }
      return states.filter(state => state.value && state.value !== 'undetermined');
    }
    if (box.text) throw new Error('Automatic text height needs an intrinsicBlockSize contract');
    return [{ region, value: scalar(0) }];
  }
  function validate(style, box, region, emit, available = {}, parentStyle = null) {
    if (style.display === 'none') return false;
    if(box.whitespace && !['normal','nowrap'].includes(style['white-space'])) throw new Error('Preserved whitespace needs explicit text geometry from the input adapter');
    // A px height on text whose font-size follows the user's default font size: a larger default makes the text
    // taller than the box, which then overflows it or clips it (min-height grows, so it is fine).
    // Visually hidden text (clipped to nothing, or a 1px box that hides its overflow) is meant not to be seen.
    const visuallyHidden = visuallyHiddenStyle(style);
    if ((box.text || box.inline?.length) && !box.pseudo && emit && !visuallyHidden && /^\d+(?:\.\d+)?px$/.test(String(style['block-size'])) && style.$sources?.['block-size'] && !layoutWarnings.some(w => w.code === 'W_LAYOUT_HEIGHT_FIXED_TEXT' && w.path === box.path)) {
      const size = String(style['font-size']);
      const keyword = /^(?:medium|small|large|x-small|x-large|xx-small|xx-large|xxx-large|smaller|larger|ua)$/.test(size);
      if (!/^\d+(?:\.\d+)?px$/.test(size) && (keyword || !unitContext.rootFontSize)) layoutWarnings.push({ code: 'W_LAYOUT_HEIGHT_FIXED_TEXT', severity: 'warning', box: box.label, path: box.path, blockSize: style['block-size'], fontSize: size,
        message: `${box.label} has height: ${style['block-size']} but its text follows the user's default font size (font-size: ${size === 'ua' ? 'the UA default' : size}): with a larger default the text outgrows the box and ${['hidden', 'clip'].includes(style['overflow-y']) ? 'is cut off' : 'overflows it'}. Use min-height (or padding) instead`, ...ranges(region) });
    }
    // A px line-height on text whose font-size follows the user's default font size (no px root size and a
    // relative size, or a keyword such as medium): a larger default grows the glyphs, not the line, so wrapped lines
    // overlap. Unitless or em line-heights grow with the text.
    if ((box.text || box.inline?.length) && !box.pseudo && emit && /^\d+(?:\.\d+)?px$/.test(String(style['line-height'])) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_LINE_HEIGHT_FIXED' && w.path === box.path)) {
      const size = String(style['font-size']);
      const keyword = /^(?:medium|small|large|x-small|x-large|xx-small|xx-large|xxx-large|smaller|larger|ua)$/.test(size);
      const scales = !/^\d+(?:\.\d+)?px$/.test(size) && (keyword || !unitContext.rootFontSize);
      if (scales) layoutWarnings.push({ code: 'W_LAYOUT_LINE_HEIGHT_FIXED', severity: 'warning', box: box.label, path: box.path, lineHeight: style['line-height'], fontSize: size,
        message: `${box.label} has line-height: ${style['line-height']} but font-size: ${size === 'ua' ? 'the UA default' : size}, which follows the user's default font size: with a larger default the text grows and the lines do not, so wrapped lines overlap. Use a unitless line-height (e.g. 1.5)`, ...ranges(region) });
    }
    // A font-size in viewport units alone (or mostly): page zoom shrinks the viewport in CSS px, so the text does not
    // grow with zoom; where 200% zoom shows it below twice its size it fails SC 1.4.4 unless it is resized otherwise.
    // Judged on the declaring element (descendants inherit the computed px). Evaluated at every whole px of width.
    if (!box.pseudo && emit && style.$sources?.['font-size'] && !layoutWarnings.some(w => w.code === 'W_LAYOUT_FONT_ZOOM' && w.path === box.path)) {
      const specified = String(style.$sources['font-size'].specified ?? '');
      const root = unitContext.rootFontSize ?? (/rem\b/.test(specified) ? undefined : 16);
      const f = root === undefined ? null : viewportFont(specified, typeof root === 'object' ? Number(number(root)) : Number(root));
      const heights = /vh|vmin|vmax/.test(specified) ? [options.viewport.height?.min, options.viewport.height?.max].filter(h => typeof h === 'number') : [600];
      if (f && heights.length) {
        const short = heights.flatMap(h => zoomShortfall(f, options.viewport, h));
        if (short.length) {
          const lo = Math.min(...short.map(r => r[0])), hi = Math.max(...short.map(r => r[1])), mid = Math.round((lo + hi) / 2), h = heights[0];
          layoutWarnings.push({ code: 'W_LAYOUT_FONT_ZOOM', severity: 'warning', box: box.label, path: box.path, fontSize: specified, intervals: short, range: { min: lo, max: hi, minInclusive: true, maxInclusive: true },
            message: `${box.label} has font-size: ${specified}: viewport units do not grow with page zoom, so at 200% zoom it shows at ${(2 * f(mid / 2, h / 2) / f(mid, h)).toFixed(2)}× (viewport ${mid}px), short of 2× (SC 1.4.4). Add a rem or px part that grows, e.g. max(…, 1rem) only where the vw part is below it, or clamp with rem bounds` });
        }
      }
    }
    // An absolute font-size on html or body replaces the user's default font size (the browser's font size setting):
    // the page's text no longer follows it (relative sizes, %, em, rem and the medium keyword do).
    if (['html', 'body'].includes(box.tag) && !box.pseudo && style.$sources?.['font-size'] && /^\d+(?:\.\d+)?(?:px|pt|pc|cm|mm|in|q)$/i.test(String(style['font-size']))
      && emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_ROOT_FONT_FIXED' && w.path === box.path))
      layoutWarnings.push({ code: 'W_LAYOUT_ROOT_FONT_FIXED', severity: 'warning', box: box.label, path: box.path, fontSize: style['font-size'],
        message: `${box.label} sets font-size: ${style['font-size']}, an absolute length: it replaces the user's default font size, so text no longer grows with the browser's font size setting. Use a percentage or rem (for example 100%)`, ...ranges(region) });
    // hyphens: auto hyphenates by the content language's dictionary (not modeled); with no language (no lang on the
    // element, an ancestor or the html element) browsers do not hyphenate, so it breaks like manual (measured).
    if ((box.text || box.inline?.length) && !box.pseudo && style.hyphens === 'auto') {
      if (style.$lang === '<dynamic>') throw Object.assign(new Error(`${box.label}: hyphens: auto with a dynamic lang`), { code: 'U_LAYOUT_CSS' });
      if (style.$lang) throw Object.assign(new Error(`${box.label}: hyphens: auto with lang ${style.$lang} breaks words by that language's hyphenation dictionary, which is not modeled`), { code: 'U_LAYOUT_CSS' });
      if (root.tag !== 'html') throw Object.assign(new Error(`${box.label}: hyphens: auto in a fragment: whether it hyphenates depends on the document's lang, which is not known here`), { code: 'U_LAYOUT_CSS' });
      if (emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_HYPHENS_NO_LANG' && w.path === box.path)) layoutWarnings.push({ code: 'W_LAYOUT_HYPHENS_NO_LANG', severity: 'warning', box: box.label, path: box.path,
        message: `${box.label} has hyphens: auto but no language (no lang attribute on it, an ancestor or html): browsers do not hyphenate it, and long words overflow or break as with hyphens: manual. Set lang on the html element`, ...ranges(region) });
    }
    // Derived text metrics apply only to the exact font they were measured with.
    if (box.contract?.font) { const reason = textFontMismatch(style, box.contract.font, options.defaultFontSize) ?? textLangMismatch(style.$lang, box.contract.textMetrics?.lang) ?? (box.contract.textMetrics?.kind === 'lines' ? textLinesMismatch(style, box.contract) : null); if (reason) throw Object.assign(new Error(reason), {code: 'U_LAYOUT_TEXT_FONT'});
      const browser = textBrowserMismatch(uaEngine, style, box.contract); if (browser) throw Object.assign(new Error(`${box.label}: ${browser}`), {code: 'U_LAYOUT_BROWSER'}); }
    // A button with the reset may also be a grid or flex container (an icon and a label): measured in Chromium, it lays
    // its children out exactly as a div with the same CSS.
    // A text field (text-like input or textarea) keeps the same box with its default appearance once the author sets
    // its padding and border on every side (measured): only its UA paint differs.
    const textField = box.tag === 'textarea' || (box.tag === 'input' && ['text', 'email', 'search', 'password', 'tel', 'url', 'number', 'date', 'time', 'datetime-local', 'month', 'week', undefined].includes(box.inputType));
    // (Or known from the UA profile: the ua option makes a field's default padding and border known.)
    const authoredEdges = ['left', 'right', 'top', 'bottom'].every(side => (style.$sources?.[`padding-${side}`] || (options.ua && style[`padding-${side}`] !== 'ua')) && (style.$sources?.[`border-${side}`] || (options.ua && style[`border-${side}`] !== 'ua')));
    // A button's box is the same with its default appearance (measured: sizes, padding, border, grid content); its
    // UA padding, border, colors and display are modeled.
    const buttonLike = box.tag === 'button' || (box.tag === 'input' && ['button', 'submit', 'reset'].includes(box.inputType));
    // A range slider keeps the same box with its default appearance (no padding or border; measured).
    const rangeLike = box.tag === 'input' && box.inputType === 'range';
    if(!box.pseudo && ['button', 'input', 'select', 'textarea'].includes(box.tag) && ((style.appearance!=='none' && !(textField && authoredEdges) && !buttonLike && !rangeLike) || (style.display!=='block' && !(box.tag === 'button' && ['grid', 'flex'].includes(style.display) && (box.children ?? []).length)))) throw new Error(`Checked ${box.tag === 'button' ? 'buttons' : 'form controls'} require appearance:none, display:block and explicit box-sizing/min-size/padding/border resets`);
    // A fieldset's rendered legend sits in its border: modeled only when the fieldset generates no box.
    // Replaced elements and text fields have intrinsic sizes the model does not compute.
    // Layout shifts from images (Layout Instability, measured): an img without a reserved height gets one when it
    // loads; one whose reserved ratio differs from the file's changes height when it loads.
    if (['img', 'video'].includes(box.tag) && style.$imageUnreserved && emit) issue('E_LAYOUT_IMAGE_UNRESERVED', `${box.label} has no reserved height: it shifts the layout when ${style.$imageUnreserved.src} loads; add width="${style.$imageUnreserved.width}" height="${style.$imageUnreserved.height}" (the file's size) or an aspect-ratio`, box, region);
    if (['img', 'video'].includes(box.tag) && style.$imageRatioMismatch && emit) issue('E_LAYOUT_IMAGE_RATIO', `${box.label} reserves the ratio ${style.$imageRatioMismatch.reserved} but ${style.$imageRatioMismatch.src} is ${style.$imageRatioMismatch.natural.width}×${style.$imageRatioMismatch.natural.height}: its height changes when it loads`, box, region);
    if (box.tag === 'img' && !box.pseudo && style['block-size'] === 'auto' && !ratioOf(style) && block) throw Object.assign(new Error(`${box.label} has no reserved height (no height, aspect-ratio or width/height attributes) and its file's size is not known; it shifts the layout when it loads`), { code: 'U_LAYOUT_IMAGE' });
    // An img may leave its block-size auto when an aspect-ratio (CSS or its width/height attributes) gives it.
    // A text field that is a grid item (not block flow) with an auto width and justify-self normal/stretch is
    // stretched to its area like a block (measured in Chromium: 368px in a 368px column; in block flow it keeps its
    // intrinsic width instead, which is not modeled). Its intrinsic minimum stays Unknown where a track probes it.
    // (A grid's justify-items other than normal/stretch is Unknown for its items, checked with the item's alignment.)
    const stretchedField = (textField || rangeLike) && available.gridItem && !available.blockFlowChild && style['inline-size'] === 'auto'
      && ['auto', 'normal', 'stretch'].includes(String(style['justify-self'] ?? 'auto'));
    // A replaced element or field in a flex row with a px flex-basis and a non-auto min-width: the flex algorithm
    // sizes its main axis from those alone (its intrinsic width is neither its base size nor its automatic minimum).
    const flexSized = (textField || rangeLike) && available.flexItem?.main === 'inline' && available.inline && /^\d+(?:\.\d+)?px$/.test(String(style['flex-basis']))
      && /^\d+(?:\.\d+)?px$|^0$/.test(String(style['min-inline-size']));
    if(!box.pseudo && ['img', 'input', 'select', 'textarea', 'iframe', 'svg', 'video', 'audio', 'marquee'].includes(box.tag) && (style.display!=='block' || (style['inline-size']==='auto' && !stretchedField && !flexSized) || (block && style['block-size']==='auto' && !(['img', 'video', 'iframe', 'svg'].includes(box.tag) && ratioOf(style))))) throw new Error(`Checked ${box.tag} elements require display:block and an explicit inline-size${block ? ' and block-size' : ''}; intrinsic sizes are not modeled`);
    // A translate moves painted and hit-tested coordinates, which the accessibility and integrity checks use; layout
    // proofs (transitions, no-shift, coordinate contracts) keep it Unknown.
    // A closed popover that author CSS displays keeps the UA [popover] { position: fixed; inset: 0; margin: auto }:
    // it renders as a fixed, centred box over the page, which is not modeled.
    // A closed dialog that author CSS displays: it renders as the UA's position: absolute box over the page.
    if (box.tag === 'dialog' && box.dialogOpen === false && style.display !== 'none') {
      if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_DIALOG_CLOSED_SHOWN' && w.path === box.path))
        layoutWarnings.push({ code: 'W_LAYOUT_DIALOG_CLOSED_SHOWN', severity: 'warning', box: box.label, path: box.path,
          ...(style.$sources?.display ? { css: [{ property: 'display', file: style.$sources.display.file, line: style.$sources.display.line, selector: style.$sources.display.selector }] } : {}),
          message: `${box.label} is a closed dialog, but display: ${style.display} overrides the UA dialog:not([open]) { display: none }, so it shows over the page while closed. Put the display on dialog[open] (or .x[open])`, ...ranges(region) });
      throw Object.assign(new Error(`${box.label} is a closed dialog that renders (author display overrides dialog:not([open]) { display: none }); its UA position: absolute is not modeled`), { code: 'U_LAYOUT_DIALOG', box });
    }
    if (box.popover === true && style.display !== 'none') throw Object.assign(new Error(`${box.label} is a closed popover that renders (author display overrides [popover]:not(:popover-open) { display: none }); its UA position: fixed is not modeled`), { code: 'U_LAYOUT_POPOVER' });
    if (style.$sticky && (!options.accessibility && !options.integrity || !['0', '0px'].includes(style.top) || ['bottom', 'left', 'right'].some(key => style[key] !== 'auto') || !block || !options.viewport.height || (options.hostBlockInset ?? 0) !== 0))
      throw Object.assign(new Error(`${box.label} is position: sticky; only top: 0 under the page scroll (no scrolling or clipping ancestor) is modeled, for the accessibility and integrity checks`), { code: 'U_LAYOUT_CSS' });
    if (style.$fixed && !options.accessibility && !options.integrity) throw Object.assign(new Error(`${box.label} is position: fixed; it is modeled (against the viewport at scroll position 0) for the accessibility and integrity checks only`), { code: 'U_LAYOUT_CSS' });
    if (style.$fixed && (!options.viewport.height || (options.hostInset ?? 0) !== 0 || (options.hostBlockInset ?? 0) !== 0)) throw Object.assign(new Error(`${box.label} is position: fixed; the viewport needs a height range and the component must start at the viewport origin`), { code: 'U_LAYOUT_CSS' });
    if (String(style.transform).startsWith('rotate-any(') && (!options.accessibility || options.integrity)) throw Object.assign(new Error(`transform ${style.transform}: an arbitrary rotation is modeled for the accessibility checks only (not integrity, whose overflow it changes)`), { code: 'U_LAYOUT_CSS' });
    if (style.transform !== 'none' && !options.accessibility && !options.integrity) throw Object.assign(new Error(`transform ${style.transform} moves the painted box; it is modeled for the accessibility and integrity checks only`), { code: 'U_LAYOUT_CSS' });
    // float on a grid or flex item does nothing (CSS Flexbox §3, Grid §3: the item is blockified, float ignored;
    // measured: the rectangles are the same without it): it is also reported as inert, which says why. The checked
    // layout forbids float everywhere (E_LAYOUT_FLOAT, a policy), so that stays.
    if (['left', 'right', 'inline-start', 'inline-end'].includes(style.float) && parentStyle && ['grid', 'inline-grid', 'flex', 'inline-flex'].includes(String(parentStyle.display)) && !parentStyle.$blockFlow) {
      if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('float')))
        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['float'], ...(style.$sources?.float ? { css: [{ property: 'float', file: style.$sources.float.file, line: style.$sources.float.line, selector: style.$sources.float.selector }] } : {}),
          message: `${box.label}: float: ${style.float} has no effect (its parent is display: ${parentStyle.display}, whose items do not float). Use justify-self, margin-left: auto or order to move it`, ...ranges(region) });
    }
    if (['left', 'right', 'inline-start', 'inline-end'].includes(style.float)) { issue('E_LAYOUT_FLOAT', 'float is forbidden in checked layout', box, region); return false; }
    if (style.float !== 'none') throw new Error('Unsupported float value');
    if (style.display === 'contents') throw new Error('display: contents on the analyzed root or with text needs its parent box and anonymous items');
    if (!['block', 'grid', 'flex'].includes(style.display)) throw new Error(`Unsupported display: ${style.display}`);
    // text-wrap: balance / pretty re-break wrapping text; the measured line profile assumes greedy breaking.
    if (['balance', 'pretty'].includes(style['text-wrap-style']) && (box.text || box.inline?.length) && !['nowrap', 'pre'].includes(style['white-space'])) throw Object.assign(new Error(`${box.label} has text-wrap: ${style['text-wrap-style']}, which changes where its text wraps (the line profile assumes greedy breaking); keep it on one line or drop it`), { code: 'U_LAYOUT_CSS' });
    if (['grid', 'flex'].includes(style.display) && box.text) throw new Error('Wrap text in an explicit leaf; anonymous grid/flex text items need a layout adapter');
    // Main-axis auto margins of flex items absorb free space (resolved by the flex line).
    // A grid item may also have px margins: its grid area less the margins is what it is laid out in (margins of grid
    // and flex items never collapse).
    // A negative px margin on a flex row item's main axis (an overlapping avatar stack): its outer size shrinks by it.
    const marginOk = (key, axis) => (available.flexItem?.main === 'inline' && axis === 'inline' && /^-\d+(?:\.\d+)?px$/.test(String(style[key]))) || style[key] === '0' || (style[key] === 'auto' && available.flexItem?.main === axis) || ((available.gridItem || available.flexItem) && /^\d+(?:\.\d+)?px$/.test(String(style[key]))) || (available.gridItem && axis === 'inline' && style[key] === 'auto' && available.autoMargins);
    // px margins on items of a row flex container are modeled (layoutFlex adds them to the outer sizes); a column's not.
    // px margins on flex items are modeled (layoutFlex adds them to the outer sizes on both axes).
    if (['margin-left', 'margin-right'].some(key => !marginOk(key, 'inline'))) throw new Error(available.flexItem && ['margin-left', 'margin-right'].some(key => style[key] === 'auto') ? 'Cross-axis auto margins of a flex item are outside the subset' : 'Only known zero inline margins are supported');
    if (block && ['margin-top', 'margin-bottom'].some(key => !marginOk(key, 'block'))) throw new Error(available.flexItem && ['margin-top', 'margin-bottom'].some(key => style[key] === 'auto') ? 'Cross-axis auto margins of a flex item are outside the subset' : 'Reset native block margins explicitly before block checking');
    if (!['static', 'relative', 'absolute'].includes(style.position) || style['writing-mode'] !== 'horizontal-tb' || !['ltr', 'rtl'].includes(style.direction)) throw new Error('Only static/relative/local-absolute horizontal-tb boxes are supported');
    // rtl scroll containers put the scrollbar on the left; the container's own box and content width do not change,
    // and positions inside a scroll container are withheld anyway, so nothing depends on the side.
    if (style.position === 'relative' && ['left','right','top','bottom'].some(key=>!['auto','0','0px'].includes(style[key]))) throw new Error('Relative positioning spaces require zero offsets');
    if (style.position === 'absolute' && (!block || ['inline-size','block-size'].some(key=>style[key]==='auto') || style['grid-column']!=='auto' || style['grid-row']!=='auto')) throw new Error('Absolute boxes require both explicit sizes, both-axis analysis and auto Grid placement');
    if (!['border-box', 'content-box'].includes(style['box-sizing'])) throw new Error('Unsupported box-sizing');
    if (!['normal', 'inline-size', 'size'].includes(style['container-type'])) throw new Error('Unsupported container-type');
    if (style['container-name'] !== 'none' && !style['container-name'].split(/\s+/).every(name => /^[a-zA-Z_][\w-]*$/.test(name) && !['and', 'or', 'not', 'none', 'default', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(name.toLowerCase()))) throw new Error('Unsupported container-name');
    for (const axis of ['inline', 'block']) {
      const key = axis === 'inline' ? 'x' : 'y', policy = box.contract?.[axis === 'inline' ? 'overflow' : 'overflowBlock'] ?? 'fit';
      if (!['visible', 'hidden', 'clip', 'auto', 'scroll'].includes(style[`overflow-${key}`])) throw new Error('Unsupported overflow value');
      if (axis === 'block' && !block) continue;
      if (emit) {
        const value = style[`overflow-${key}`];
        if ((policy === 'scroll' && !['auto', 'scroll'].includes(value)) || (policy === 'clip' && !['clip', 'hidden'].includes(value)) || (policy === 'visible' && value !== 'visible')) issue('E_LAYOUT_OVERFLOW_POLICY', `Requested ${policy} policy disagrees with computed overflow-${key}: ${value}`, box, region, axis);
        policies.push({ box: box.label, path: box.path, axis, overflow: policy, ...ranges(region) });
      }
    }
    if (!['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'].includes(style['white-space']) || !['normal', 'anywhere', 'break-word'].includes(style['overflow-wrap'])) throw new Error('Unsupported text wrapping value');
    const nowrap = ['nowrap', 'pre'].includes(style['white-space']), wrap = box.contract?.wrap;
    if (emit && ((wrap === 'anywhere' && (nowrap || style['overflow-wrap'] !== 'anywhere')) || (wrap === 'normal' && nowrap) || (wrap === 'nowrap' && !nowrap))) issue('E_LAYOUT_WRAP', `Requested ${wrap} wrapping disagrees with CSS`, box, region);
    for (const axis of ['inline', 'block']) {
      if (axis === 'block' && !block) {
        if (style['block-size'] !== 'auto' || style['grid-template-rows'] !== 'none') throw new Error('Enable block checking for explicit block sizes or row tracks');
        continue;
      }
      // max-inline-size in px clamps the preferred width (CSS 2 §10.4: max(min, min(preferred, max))); flex items and
      // other max sizes are not modeled.
      // max-block-size in px: it caps an explicit or stretched height, and a leaf's content height; an auto-height
      // container with children is not modeled.
      if (axis === 'block' && style['max-block-size'] !== 'none' && !(/^\d+(?:\.\d+)?px$/.test(style['max-block-size']) && !available.flexItem && style.display !== 'table' && (style['block-size'] !== 'auto' || !(box.children ?? []).length || (available.block && available.alignBlock === undefined && !available.root)))) throw new Error('CSS max size clamping is not modeled');
      if (style[`max-${axis}-size`] !== 'none' && axis === 'inline' && !( ((/^\d+(?:\.\d+)?px$/.test(style['max-inline-size'])) || (!/px$/.test(style['max-inline-size']) && available.inline && !available.flexItem)) && (!available.flexItem || available.flexItem.main === 'inline') && style.display !== 'table')) throw new Error('CSS max size clamping is not modeled');
      if (axis === 'inline') {
        if (style['min-inline-size'] !== 'auto') px(style['min-inline-size']);
      // A column flex item's minimum is resolved by the flex line (its track is never smaller).
      // min-block-size raises a leaf's content height, an explicit or stretched height, and a block-flow container
      // whose content stays at the top, also as an item of a flex row (its line's cross size takes the raised height).
      // Grid and flex containers (it stretches their rows or line) and other flex items are not modeled.
      } else if (!['auto', '0', '0px'].includes(style['min-block-size']) && !available.flexBlockMinimum) {
        const leaf = !(box.children ?? []).length && !['grid', 'inline-grid', 'flex', 'inline-flex', 'table'].includes(style.display);
        const blockFlow = ['block', 'list-item'].includes(style.display) && ['normal', 'start', 'flex-start'].includes(String(style['align-content']));
        const stretched = available.block && available.alignBlock === undefined && !available.root;
        // A stretched item of a single-line flex row whose height is a px length: the line's cross size is that height
        // (whatever the items' minimums), and the item's height is the larger of it and its minimum, as for a grid item.
        const parentFlex = parentStyle;
        const fixedLine = available.flexItem?.main === 'inline' && !!parentFlex && String(parentFlex['flex-wrap']) === 'nowrap' && /^\d+(?:\.\d+)?px$/.test(String(parentFlex['block-size']))
          && ['auto', '0', '0px'].includes(String(parentFlex['min-block-size'])) && String(parentFlex['max-block-size']) === 'none';
        // (A flex row of indefinite height: the line is the tallest item's hypothetical size, each raised to its px
        // minimum, so a stretched item is never below its minimum; and its content is measured before the raise.)
        const measuredLine = available.flexItem?.main === 'inline' && /^\d+(?:\.\d+)?px$/.test(String(style['min-block-size'])) && (available.$crossMeasure || stretched || available.$minNatural || available.$minRaised) && !!parentFlex && String(parentFlex['block-size']) === 'auto' && ['auto', '0', '0px'].includes(String(parentFlex['min-block-size'])) && String(parentFlex['max-block-size']) === 'none';
        if (!measuredLine && !available.$minNatural && !available.$minRaised && !(stretched && (!available.flexItem || fixedLine) && !['table'].includes(style.display)) && ((available.flexItem && !(available.flexItem.main === 'inline' && (leaf || blockFlow))) || !(leaf || blockFlow || (style['block-size'] !== 'auto' && !['flex', 'inline-flex', 'table'].includes(style.display))))) throw new Error('CSS min-block-size clamping is not modeled here (a grid or flex container, or a flex item)');
      }
    }
    // Flex containers and items validate their alignment in the flex model.
    // (align-items does nothing on a block container: reported as inert, not Unknown.)
    // Grid items align in their area's block axis by align-self (align-items of the grid): start, center and end are
    // modeled (gridAlign); baseline is not.
    const gridSelf = ['normal', 'stretch', 'start', 'end', 'center', 'flex-start', 'flex-end', 'self-start', 'self-end'];
    if (block && ((style.display !== 'flex' && !['block', 'list-item'].includes(style.display) && !(style.display === 'grid' ? gridSelf : ['normal', 'stretch']).includes(style['align-items'])) || (!available.flexItem && !available.blockFlowChild && !(available.gridItem ? ['auto', ...gridSelf] : ['auto', 'normal', 'stretch']).includes(style['align-self'])) || (style.display !== 'flex' && !['normal', 'stretch', 'start', ...(style.display === 'grid' ? ['center', 'end'] : []), ...(style.display === 'block' && !box.text && !box.inline?.length ? ['center', 'end', 'flex-end', 'flex-start', 'space-between', 'space-around', 'space-evenly'] : [])].includes(style['align-content'])))) throw new Error('Only stretch items and normal/stretch/start (grid: center/end) content alignment are supported');
    return true;
  }

  function flex(region, available, definitions, gap, bases, stretchAuto) {
    // Content-sized columns (Grid §12.5–12.7): each starts at its base; the free space (with fr tracks at their
    // minimum) is shared equally among them up to their growth limits (freezing each at its limit); fr tracks then
    // take what is left, or, without fr tracks, auto tracks stretch into it equally.
    if (definitions.some(t => t.content)) {
      if (definitions.some(t => t.autoTable || t.auto)) throw new Error('Content-sized columns with automatic table or auto row tracks are not modeled');
      const content = definitions.map((t, i) => t.content ? i : -1).filter(i => i >= 0);
      const frBase = (t, i) => t.min !== undefined ? scalar(t.min) : t.autoMin ? bases[i] : scalar(0);
      const fixedTotal = definitions.reduce((acc, t, i) => t.content ? sum(acc, scalar(t.content.base)) : t.weight ? sum(acc, frBase(t, i)) : sum(acc, bases[i]), scalar(gap));
      const free0 = diff(available, fixedTotal);
      const out = [];
      const finish = (r, growth) => {
        const values = definitions.map((t, i) => t.content ? sum(scalar(t.content.base), growth[i] ?? scalar(0)) : bases[i]);
        if (definitions.some(t => t.weight)) {
          // fr tracks share what is left (the content tracks now fixed at their sizes).
          for (const piece of flex(r, available, definitions.map(t => t.content ? { fixed: true } : t), gap, values, false)) out.push({ ...piece, required: fixedTotal });
          return;
        }
        const stretching = content.filter(i => definitions[i].content.stretch);
        if (!stretching.length) { out.push({ region: r, values, required: fixedTotal }); return; }
        const used = sum(scalar(gap), values.reduce((acc, v) => sum(acc, v), scalar(0)));
        for (const piece of clamp(r, diff(available, used))) out.push({ region: piece.region, values: values.map((v, i) => stretching.includes(i) ? sum(v, times(piece.value, div(one, q(String(stretching.length))))) : v), required: fixedTotal });
      };
      const grow = (r, frozen, depth) => {
        if (depth > content.length + 1) throw new Error('Content-sized column resolution did not converge');
        const active = content.filter(i => !frozen.has(i));
        const room = i => sub(definitions[i].content.limit, definitions[i].content.base);
        if (!active.length) { finish(r, Object.fromEntries(content.map(i => [i, scalar(room(i))]))); return; }
        const rest = [...frozen].reduce((acc, i) => diff(acc, scalar(room(i))), free0);
        const share = times(rest, div(one, q(String(active.length))));
        const smallest = active.reduce((m, i) => cmp(room(i), m) < 0 ? room(i) : m, room(active[0]));
        const split = partition(r, diff(share, scalar(smallest)), '>=');
        for (const x of split.yes) grow(x, new Set([...frozen, ...active.filter(i => cmp(room(i), smallest) === 0)]), depth + 1);
        for (const x of split.no) finish(x, Object.fromEntries([...content.map(i => [i, frozen.has(i) ? scalar(room(i)) : share])]));
      };
      // No free space: every track at its base (the tracks overflow, or fit exactly).
      const p = partition(region, free0, '>=');
      for (const r of p.no) finish(r, {});
      for (const r of p.yes) grow(r, new Set(), 0);
      return out;
    }
    // Automatic table columns (CSS 2 / Chromium auto table layout): below the summed minima every column keeps its
    // minimum (the table overflows); between minima and maxima each grows from its minimum by its share of
    // (max − min); above the maxima the width is shared in proportion to the maxima.
    // With px columns (measured): (1) below every minimum all stay at their minimum; (2) the px columns grow from
    // their content minimum toward px in proportion to (px − min); (3) then the auto columns from min toward max in
    // proportion to (max − min); (4) beyond, the auto columns share the rest in proportion to their max.
    if (definitions.some(t => t.autoTable)) {
      if (!definitions.every(t => t.autoTable)) throw new Error('Automatic table columns do not mix with other tracks');
      const mins = definitions.map(t => t.autoTable.min), tops = definitions.map(t => t.autoTable.max), fixed = definitions.map(t => Boolean(t.autoTable.fixed));
      const S = diff(available, scalar(gap)), total = list => list.reduce(add, zero);
      const A = total(mins), B = total(definitions.map((t, i) => fixed[i] ? tops[i] : mins[i])), C = total(tops);
      const autoMax = total(tops.filter((_, i) => !fixed[i])), autoCount = fixed.filter(f => !f).length;
      const out = [], within = (lo, hi) => region && clip(clip(region, diff(S, scalar(lo))), diff(scalar(hi), S), true);
      const under = clip(region, diff(scalar(A), S), true);
      if (under) out.push({ region: under, values: mins.map(scalar), required: scalar(add(A, gap)) });
      const phase = (lo, hi, grows) => { const spread = sub(hi, lo); if (cmp(spread, zero) <= 0) return; const r = within(lo, hi); if (!r) return;
        out.push({ region: r, values: definitions.map((t, i) => grows(i) ? sum(scalar(mins[i]), times(diff(S, scalar(lo)), div(sub(tops[i], mins[i]), spread))) : scalar(fixed[i] && lo === B ? tops[i] : mins[i])), required: scalar(gap) }); };
      phase(A, B, i => fixed[i]);
      // Phase 3: px columns at px, auto columns grow.
      { const spread = sub(C, B), r = cmp(spread, zero) > 0 ? within(B, C) : null; if (r) out.push({ region: r, values: definitions.map((t, i) => fixed[i] ? scalar(tops[i]) : sum(scalar(mins[i]), times(diff(S, scalar(B)), div(sub(tops[i], mins[i]), spread)))), required: scalar(gap) }); }
      const over = clip(region, diff(S, scalar(C)));
      if (over) out.push({ region: over, values: definitions.map((t, i) => fixed[i] ? scalar(tops[i]) : sum(scalar(tops[i]), times(diff(S, scalar(C)), cmp(autoMax, zero) > 0 ? div(tops[i], autoMax) : div(one, q(autoCount))))), required: scalar(gap) });
      return out;
    }
    // minmax(L, fr) tracks (css-grid-1 §12.7.1, find the size of an fr): each flexible track takes its share of the
    // free space unless that is below its minimum L; such tracks are frozen at L and the rest is shared again. Each
    // round is a region split by "share ≥ L". A capped minimum (min(L, 100%)) is the container width below L.
    if (definitions.some(t => t.min !== undefined || t.autoMin)) {
      // (Auto tracks keep their measured base: the fr tracks take all the free space, none is left to stretch them.)
      if (definitions.some(t => t.autoTable) || (definitions.some(t => t.auto) && definitions.some(t => t.min !== undefined))) throw new Error('minmax(px, fr) tracks with auto tracks are not modeled');
      const fixedTotal = sum(definitions.reduce((acc, t, i) => t.weight ? acc : sum(acc, bases[i]), scalar(0)), scalar(gap));
      const out = [];
      let pieces = [{ region, mins: definitions.map((t, i) => t.min !== undefined ? scalar(t.min) : t.autoMin ? bases[i] : t.weight ? scalar(0) : null) }];
      for (const L of [...new Set(definitions.filter(t => t.minCap).map(t => exact(t.min)))]) pieces = pieces.flatMap(piece => {
        const split = partition(piece.region, diff(available, scalar(q(L))), '>=');
        return [...split.yes.map(r => ({ region: r, mins: piece.mins })), ...split.no.map(r => ({ region: r, mins: piece.mins.map((m, i) => definitions[i].minCap && exact(definitions[i].min) === L ? available : m) }))];
      });
      const resolve = (r, mins, frozen, depth) => {
        if (depth > definitions.length + 1) throw new Error('Grid fr resolution did not converge');
        const active = definitions.map((t, i) => t.weight && !frozen.has(i) ? i : -1).filter(i => i >= 0);
        const weights = active.map(i => definitions[i].weight).reduce(add, zero), denominator = cmp(weights, one) < 0 ? one : weights;
        const free = diff(diff(available, fixedTotal), [...frozen].reduce((acc, i) => sum(acc, mins[i]), scalar(0)));
        const share = i => times(free, div(definitions[i].weight, denominator));
        let cells = [{ region: r, violators: [] }];
        for (const i of active) cells = cells.flatMap(cell => { const p = partition(cell.region, diff(share(i), mins[i]), '>='); return [...p.yes.map(x => ({ region: x, violators: cell.violators })), ...p.no.map(x => ({ region: x, violators: [...cell.violators, i] }))]; });
        for (const cell of cells) {
          if (cell.violators.length) { resolve(cell.region, mins, new Set([...frozen, ...cell.violators]), depth + 1); continue; }
          const values = definitions.map((t, i) => !t.weight ? bases[i] : frozen.has(i) ? mins[i] : share(i));
          out.push({ region: cell.region, values, required: sum(fixedTotal, definitions.reduce((acc, t, i) => t.weight ? sum(acc, mins[i]) : acc, scalar(0))) });
        }
      };
      for (const piece of pieces) resolve(piece.region, piece.mins, new Set(), 0);
      return out;
    }
    const overhead = sum(total(bases), scalar(gap));
    return clamp(region, diff(available, overhead)).map(({ region, value: free }) => {
      const weights = definitions.filter(t => t.weight).map(t => t.weight).reduce(add, zero);
      const denominator = cmp(weights, one) < 0 ? one : weights;
      const automatic = definitions.filter(t => t.auto).length;
      const allocatedFraction = div(weights, denominator);
      const remaining = times(free, sub(one, allocatedFraction));
      const values = definitions.map((track, index) => track.weight ? times(free, div(track.weight, denominator)) :
        track.auto && stretchAuto ? sum(bases[index], times(remaining, div(one, q(automatic)))) : bases[index]);
      return { region, values, required: overhead };
    });
  }
  // One flex line (css-flexbox-1 §9.7) as a finite case split. Items carry
  // affine outer `base`/`minimum` sizes. The region is split by the sign of
  // the free space (grow or shrink mode) and, every round, by "target ≥
  // minimum" for each unfrozen item; violators freeze at their minimum and the
  // rest is redistributed. Frozen items never thaw, so it ends within
  // items+1 rounds. Returns outer sizes and the remaining free space.
  function resolveFlexLine(region, available, items, gap) {
    // The hypothetical main size: the base clamped by the maximum, then the minimum (min wins over max).
    const capped = item => item.maximum && constantLess(item.maximum, item.base) ? item.maximum : item.base;
    // (baseAtLeastMinimum: an affine base already checked to be at least the minimum, a percentage flex-basis.)
    const hypothetical = items.map(item => item.baseBelowMinimum ? item.minimum : (item.minimum === item.base || item.baseAtLeastMinimum) && !item.maximum ? item.base : maximumConstant(capped(item), item.minimum));
    const sumHypothetical = sum(total(hypothetical), scalar(gap));
    const modes = partition(region, diff(available, sumHypothetical), '>');
    const results = [];
    for (const [mode, regions] of [['grow', modes.yes], ['shrink', modes.no]]) for (const start of regions) {
      // Initially frozen (§9.7 step 2): zero factor; in shrink mode also an item whose base is below its minimum.
      const frozen = new Map();
      items.forEach((item, index) => {
        const factor = mode === 'grow' ? item.grow : item.shrink;
        // Content-sized items cannot shrink below their base (= their minimum). With
        // only minimum violations the result does not depend on the freezing order.
        if (cmp(factor, zero) === 0 || (mode === 'shrink' && (item.content || item.baseBelowMinimum || (item.minimum !== item.base && !item.baseAtLeastMinimum && !item.baseBelowMinimum && constantLess(item.base, item.minimum)))) || (mode === 'grow' && item.maximum && constantLess(item.maximum, item.base))) frozen.set(index, hypothetical[index]);
      });
      let states = [{ region: start, frozen }];
      for (let round = 0; states.length && round <= items.length; round++) {
        const next = [];
        for (const state of states) {
          const unfrozen = items.map((_, index) => index).filter(index => !state.frozen.has(index));
          const used = items.map((item, index) => state.frozen.get(index) ?? item.base);
          const free = diff(available, sum(total(used), scalar(gap)));
          const factors = unfrozen.map(index => mode === 'grow' ? items[index].grow : items[index].shrink);
          const factorSum = factors.reduce(add, zero);
          // §9.7 step 4b scales by the initial free space when factors sum below 1; only the first round without freezing is modeled.
          const mayFreeze = unfrozen.some(index => !items[index].content && (items[index].baseBelowMinimum || (!items[index].baseAtLeastMinimum && constantLess(items[index].base, items[index].minimum))));
          const shrinks = mode === 'shrink' && unfrozen.some(index => cmp(items[index].shrink, zero) > 0 && (items[index].percentItem || cmp(items[index].innerBase, zero) > 0));
          if (unfrozen.length && cmp(factorSum, one) < 0 && (round > 0 || (mode === 'grow' && mayFreeze) || shrinks)) throw flexUnknown('Flex factors summing below 1 with freezing or shrinking are outside the subset');
          let targets;
          if (mode === 'grow') targets = items.map((item, index) => state.frozen.has(index) ? used[index] : sum(item.base, times(free, div(item.grow, cmp(factorSum, one) < 0 ? one : factorSum))));
          else {
            // Shrinking is proportional to the scaled factor shrink × inner base size.
            if (unfrozen.some(index => items[index].automaticBelowBase)) throw flexUnknown('An item whose automatic minimum depends on its content would shrink; set an explicit minimum or flex-shrink: 0');
            // Percentage bases: their inner sizes are affine, so the weights are constant only when every shrinking
            // item's inner size is a share of the same content width (shrink × share); any other mix is Unknown.
            const percent = unfrozen.filter(index => items[index].percentItem && cmp(items[index].shrink, zero) > 0);
            if (percent.length && unfrozen.some(index => cmp(items[index].shrink, zero) > 0 && (!items[index].percentItem || items[index].innerShare === null))) throw flexUnknown('Shrinking items with percentage bases weigh by inner sizes that are not shares of one width (edges, margins or fixed-size items shrinking with them); not modeled');
            const scaled = unfrozen.map(index => mul(items[index].shrink, items[index].percentItem ? items[index].innerShare ?? zero : items[index].innerBase));
            const scaledSum = scaled.reduce(add, zero);
            targets = items.map((item, index) => {
              if (state.frozen.has(index)) return used[index];
              const k = unfrozen.indexOf(index);
              return cmp(scaledSum, zero) === 0 ? item.base : sum(item.base, times(free, div(scaled[k], scaledSum)));
            });
          }
          // §9.7 step 4d–e: clamp each target into [min, max]; by the sign of the total violation freeze the min
          // violators (positive), the max violators (negative) or all of them (zero).
          let parts = [{ region: state.region, under: [], over: [] }];
          for (const index of unfrozen) {
            if (items[index].minimum !== items[index].base) parts = bounded(parts.flatMap(part => {
              const split = partition(part.region, diff(targets[index], items[index].minimum), '>=');
              return [...split.yes.map(r => ({ ...part, region: r })), ...split.no.map(r => ({ ...part, region: r, under: [...part.under, index] }))];
            }));
            if (items[index].maximum) parts = bounded(parts.flatMap(part => {
              if (part.under.includes(index)) return [part];
              const split = partition(part.region, diff(items[index].maximum, targets[index]), '>=');
              return [...split.yes.map(r => ({ ...part, region: r })), ...split.no.map(r => ({ ...part, region: r, over: [...part.over, index] }))];
            }));
          }
          for (const part of parts) {
            if (!part.under.length && !part.over.length) { results.push({ region: part.region, values: targets, free: diff(available, sum(total(targets), scalar(gap))), mode }); continue; }
            const clampOf = index => part.under.includes(index) ? items[index].minimum : items[index].maximum;
            if (!part.over.length || !part.under.length) { next.push({ region: part.region, frozen: new Map([...state.frozen, ...[...part.under, ...part.over].map(index => [index, clampOf(index)])]) }); continue; }
            const violation = [...part.under, ...part.over].map(index => diff(clampOf(index), targets[index])).reduce((a, b) => sum(a, b));
            const positive = partition(part.region, violation, '>');
            for (const r of positive.yes) next.push({ region: r, frozen: new Map([...state.frozen, ...part.under.map(index => [index, items[index].minimum])]) });
            for (const rest of positive.no) {
              const negative = partition(rest, diff(scalar(zero), violation), '>');
              for (const r of negative.yes) next.push({ region: r, frozen: new Map([...state.frozen, ...part.over.map(index => [index, items[index].maximum])]) });
              for (const r of negative.no) next.push({ region: r, frozen: new Map([...state.frozen, ...[...part.under, ...part.over].map(index => [index, clampOf(index)])]) });
            }
          }
        }
        states = bounded(next);
      }
      if (states.length) throw new Error('Flex freezing did not converge');
    }
    return results;
  }
  // ---- flex layout (ADR-0011) ----------------------------------------------
  const constantItem = item => ({ ...item, base: scalar(item.base), minimum: scalar(item.minimum), maximum: item.maximum !== undefined ? scalar(item.maximum) : null, innerBase: sub(sub(item.base, item.edges), item.marginMain ?? zero) });
  // Greedy line breaking by outer hypothetical sizes (constants), split by width thresholds.
  function breakLines(region, available, hypothetical, gap) {
    const n = hypothetical.length, done = [];
    let states = [{ region, start: 0, lines: [] }];
    while (states.length) {
      const next = [];
      for (const state of states) {
        if (state.start >= n) { done.push(state); continue; }
        const pending = [{ region: state.region, end: state.start + 1 }];
        while (pending.length) {
          const p = pending.pop();
          const line = [...Array(p.end - state.start).keys()].map(k => state.start + k);
          if (p.end >= n) { next.push({ region: p.region, start: n, lines: [...state.lines, line] }); continue; }
          // Sizes may be affine in the viewport (a percentage flex-basis): the break is then a width threshold too.
          const need = sum(hypothetical.slice(state.start, p.end + 1).map(h => h && typeof h === 'object' && 'b' in h ? h : scalar(h)).reduce(sum, scalar(zero)), scalar(mul(gap, q(p.end - state.start))));
          const split = partition(p.region, diff(available, need), '>=');
          for (const r of split.yes) pending.push({ region: r, end: p.end + 1 });
          for (const r of split.no) next.push({ region: r, start: p.end, lines: [...state.lines, line] });
        }
      }
      states = bounded(next);
    }
    return bounded(done);
  }
  // Main-axis start offsets of a line's items: auto margins absorb positive free
  // space, otherwise justify-content distributes it. null = not modeled there.
  function mainStarts(region, values, free, flags, gap, main, justify) {
    const count = values.length, autos = flags.reduce((n, f) => n + Number(f.autoStart) + Number(f.autoEnd), 0);
    const place = (lead, extra, margin) => {
      let position = lead; const starts = [];
      values.forEach((value, i) => {
        if (flags[i].autoStart) position = sum(position, margin);
        starts.push(position);
        position = sum(sum(position, value), sum(scalar(gap), extra));
        if (flags[i].autoEnd) position = sum(position, margin);
      });
      return starts;
    };
    const none = scalar(0), d = distribution(justify, main, count);
    if (!autos && cmp(d.lead, zero) === 0 && cmp(d.extra, zero) === 0) return [{ region, starts: place(none, none, none) }];
    const split = partition(region, free, '>='), out = [];
    for (const r of split.yes) out.push({ region: r, starts: autos ? place(none, none, times(free, div(one, q(autos)))) : place(times(free, d.lead), times(free, d.extra), none) });
    // Negative free space: auto margins are zero and justify falls back or is not modeled.
    for (const r of split.no) out.push({ region: r, starts: d.negative === 'start' || (autos && d.negative === 'same') ? place(none, none, none) : d.negative === 'same' ? place(times(free, d.lead), none, none) : null });
    return out;
  }
  function layoutFlex({ box, style, region, inline, contentInline, knownBlock, blockEdges, available, parents, ancestors, contentOrigin, collect, emit }) {
    const out = [], { main, wrap } = validateFlexContainer(style);
    const fitInline = (box.contract?.overflow ?? 'fit') === 'fit', fitBlock = (box.contract?.overflowBlock ?? 'fit') === 'fit';
    const mainGap = gapSize(style[main === 'inline' ? 'column-gap' : 'row-gap']), crossGap = gapSize(style[main === 'inline' ? 'row-gap' : 'column-gap']);
    const explainTracks = axis => () => explanation(sizeChain([...parents, { box, style }], axis, { hostInset: options.hostInset }), trackProperties(axis).map(property => fact(box, style, property)));
    const gaps = (gap, count) => mul(gap, q(Math.max(0, count - 1)));
    for (const state of collect(region)) {
      if (state.children.some(child => child.style.position === 'absolute')) throw flexUnknown('Absolute children of a flex container use flex static positions');
      const model = state.children.map(child => {
        try {
          const align = crossAlignment(style['align-items'], child.style['align-self']);
          // A column item that is not stretched is as wide as its own px width.
          if (main === 'block' && align !== 'stretch' && !/^\d+(?:\.\d+)?px$/.test(child.style['inline-size'])) throw flexUnknown('A column item that is not stretched (align) shrink-wraps its content; give it a px width');
          // px margins of a row item: its outer main size (base, minimum, maximum) includes them; layoutFlex lays the
          // item out inside them on both axes.
          const m = side => /^\d+(?:\.\d+)?px$/.test(String(child.style[`margin-${side}`])) ? px(child.style[`margin-${side}`]) : main === 'inline' && ['left', 'right'].includes(side) && /^-\d+(?:\.\d+)?px$/.test(String(child.style[`margin-${side}`])) ? q(String(child.style[`margin-${side}`]).slice(0, -2)) : zero;
          const margins = { left: m('left'), right: m('right'), top: m('top'), bottom: m('bottom') };
          // A row item sized by its content (flex-basis auto or content, auto width): its max- and min-content widths
          // are its flex base size and automatic minimum.
          // (A px basis with min-width auto too: its automatic minimum is the min-content width, §4.5.)
          const pxBasis = /^\d+(?:\.\d+)?px$/.test(String(child.style['flex-basis'])) && child.style['min-inline-size'] === 'auto';
          const contentSized = main === 'inline' && (['auto', 'content'].includes(String(child.style['flex-basis'])) || /%$/.test(String(child.style['flex-basis'])) || pxBasis) && child.style['inline-size'] === 'auto'
            && ['auto', '0', '0px'].includes(String(child.style['min-inline-size'])) && ['visible', 'clip'].includes(child.style['overflow-x']) && !['inline-size', 'size'].includes(child.style['container-type']);
          const contentSizes = contentSized ? frAutoMinimums(child.box, child.style, state.region, [...parents, { box, style }], /%$/.test(String(child.style['flex-basis'])) || pxBasis ? 'min' : true) : null;
          let item = flexItem(child.style, { empty: !child.box.text && !child.box.children.length, axis: main, ...(contentSizes ? { contentSizes } : {}) });
          const marginMain = main === 'inline' ? add(margins.left, margins.right) : add(margins.top, margins.bottom);
          if (cmp(add(add(margins.left, margins.right), add(margins.top, margins.bottom)), zero) !== 0) {
            if ((item.autoStart || item.autoEnd) && cmp(marginMain, zero) !== 0) throw flexUnknown('A flex item with both auto and px main-axis margins is outside the subset');
            if (style.direction === 'rtl' && cmp(margins.left, margins.right) !== 0) throw flexUnknown('Unequal inline margins of a flex item in rtl are outside the subset');
            // A content-sized column item gets its margins when it is measured.
            item = item.base === 'content' ? { ...item, marginMain } : { ...item, base: add(item.base, marginMain), minimum: add(item.minimum, marginMain), ...(item.maximum !== undefined ? { maximum: add(item.maximum, marginMain) } : {}), marginMain };
          }
          return { child, item, align, margins };
        } catch (error) { error.box ??= child.box; throw error; }
      });
      const inheritedOf = entry => entry.child.inherited ?? style;
      const itemAvailable = (entry, extra) => ({ ...extra,
        ...(entry.margins ? { ...(extra.inline ? { inline: diff(extra.inline, scalar(add(entry.margins.left, entry.margins.right))) } : {}), ...(extra.block ? { block: diff(extra.block, scalar(add(entry.margins.top, entry.margins.bottom))) } : {}),
          ...(extra.origin ? { origin: { inline: sum(extra.origin.inline, scalar(entry.margins.left)), block: sum(extra.origin.block, scalar(entry.margins.top)) } } : {}), marginEnd: { inline: entry.margins.right, block: entry.margins.bottom } } : {}),
        // A percentage height resolves against the container's definite height, not the area left after the item's
        // margins (measured: height: 50% with margin-top: 10px in a 100px row is 50px).
        ...(knownBlock ? { percentBlock: knownBlock } : {}),
        flexItem: { main }, ...(main === 'block' ? { flexBlockMinimum: true } : {}),
        ...(entry.align !== 'stretch' ? (main === 'inline' ? { alignBlock: entry.align } : { alignInline: entry.align }) : {}) });
      if (main === 'inline') {
        // A percentage basis (a frozen item): its size is that share of the content width (plus its edges in
        // content-box), affine in the viewport. Where its minimum would exceed that, the browser would use the
        // minimum instead: Unknown there. In a wrapping container its size breaks lines at width thresholds.
        // Where an item's minimum exceeds its share (P% of a narrow container), its hypothetical size is the minimum
        // (§9.7): the region is split there. Below, the item starts at the minimum (shrink mode freezes it there; grow
        // mode grows it from its base and clamps it to the minimum).
        let parts = [{ region: state.region, below: new Set() }];
        const percentBase = entry => sum(sum(times(contentInline, entry.item.percentBasis), scalar(entry.item.contentBox ? entry.item.edges : zero)), scalar(entry.item.marginMain ?? zero));
        model.forEach((entry, index) => {
          if (entry.item.percentBasis === undefined || cmp(entry.item.shrink, zero) === 0) return;
          const minimum = scalar(constantItem(entry.item).minimum.b ?? entry.item.minimum);
          parts = bounded(parts.flatMap(part => { const split = partition(part.region, diff(percentBase(entry), minimum), '>='); return [...split.yes.map(r => ({ region: r, below: part.below })), ...split.no.map(r => ({ region: r, below: new Set([...part.below, index]) }))]; }));
        });
        for (const part of parts) {
        const items = model.map((entry, index) => {
          const item = constantItem(entry.item);
          if (entry.item.percentBasis === undefined) return item;
          // Its outer size: the share, its edges in content-box, and its main-axis margins.
          const base = percentBase(entry);
          if (cmp(entry.item.shrink, zero) === 0 && clip(part.region, diff(item.minimum, base), true)) throw flexUnknown(`${entry.child.box.label}: its minimum width can exceed its flex-basis ${entry.child.style['flex-basis']} here, which is not modeled`);
          // A non-shrinking item never goes below its base; a shrinking one down to its (explicit) minimum.
          // Its inner base size is P% of the content width when it has no constant part (no edges, margins or
          // content-box padding): shrinking is then weighted by the constant shrink × P (innerShare).
          const constantPart = add(entry.item.contentBox ? zero : mul(entry.item.edges, q(-1)), zero);
          const innerShare = cmp(constantPart, zero) === 0 && cmp(entry.item.marginMain ?? zero, zero) === 0 && (!entry.item.contentBox || cmp(entry.item.edges, zero) === 0) ? entry.item.percentBasis : null;
          const below = part.below.has(index);
          return { ...item, base, minimum: cmp(entry.item.shrink, zero) === 0 ? base : item.minimum, maximum: null, baseAtLeastMinimum: !below, baseBelowMinimum: below, innerShare, percentItem: true };
        });
        // Lines break by the hypothetical main sizes: the base clamped by the maximum, then the minimum (§9.3, §9.7;
        // measured: a 180px item with max-width: 20px takes 20px of its line).
        const hypothetical = wrap ? items.map((item, i) => item.baseBelowMinimum ? item.minimum : model[i].item.percentBasis !== undefined ? item.base : maximumConstant(item.maximum && constantLess(item.maximum, item.base) ? item.maximum : item.base, item.minimum).b) : items.map(item => item.base);
        const sets = wrap ? breakLines(part.region, contentInline, hypothetical, mainGap) : [{ region: part.region, lines: model.length ? [model.map((_, i) => i)] : [] }];
        for (const set of sets) {
          let combos = [{ region: set.region, lines: [] }];
          for (const indices of set.lines) combos = bounded(combos.flatMap(c => resolveFlexLine(c.region, contentInline, indices.map(i => items[i]), gaps(mainGap, indices.length))
            .flatMap(r => mainStarts(r.region, r.values, r.free, indices.map(i => items[i]), mainGap, main, style['justify-content'])
              .map(m => ({ region: m.region, lines: [...c.lines, { indices, values: r.values, starts: m.starts }] })))));
          for (const combo of combos) {
            // The last item's end margin may stick out (it hides nothing; measured for grid and flex items).
            for (const line of combo.lines) if (emit) obligation(contentInline, diff(sum(total(line.values), scalar(gaps(mainGap, line.indices.length))), scalar(line.indices.length ? model[line.indices.at(-1)].margins.right : zero)), box, combo.region, 'E_LAYOUT_TRACKS', 'inline', fitInline && !scrolls(style, 'x'), explainTracks('inline'), () => ({ layout: 'flex' }));
            if (!block) {
              let endings = [combo.region];
              for (const line of combo.lines) line.indices.forEach((i, k) => { endings = bounded(endings.flatMap(r => solve(model[i].child.box, itemAvailable(model[i], { inline: line.values[k], fitInline }), r, ancestors, inheritedOf(model[i]), emit).map(result => result.region))); });
              for (const r of endings) out.push(finish(box, style, r, inline, contentInline, null, null, available, parents, emit));
              continue;
            }
            // Cross sizes of the lines: a definite single line is the container; otherwise the tallest item.
            let measured = [{ region: combo.region, sizes: combo.lines.map(() => scalar(0)) }];
            if (wrap || !knownBlock) combo.lines.forEach((line, l) => line.indices.forEach((i, k) => {
              // An item's hypothetical cross size is its content height raised to its px min-height (§9.4): the line is the
              // tallest of them, and the item is then stretched to the line (never below that minimum).
              const ms = model[i].child.style, minCross = /^\d+(?:\.\d+)?px$/.test(String(ms['min-block-size'])) ? add(px(ms['min-block-size']), ms['box-sizing'] === 'content-box' ? ['top', 'bottom'].map(side => add(px(ms[`padding-${side}`]), px(ms[`border-${side}`]))).reduce(add, zero) : zero) : null;
              measured = bounded(measured.flatMap(m => solve(model[i].child.box, itemAvailable(model[i], { inline: line.values[k], ...(minCross ? { $crossMeasure: true } : {}) }), m.region, ancestors, inheritedOf(model[i]), false)
                .flatMap(result => (minCross ? maximum(result.region, result.block, scalar(minCross)) : [{ region: result.region, value: result.block }]).flatMap(h => maximum(h.region, m.sizes[l], sum(h.value, scalar(add(model[i].margins.top, model[i].margins.bottom)))).map(mx => ({ region: mx.region, sizes: m.sizes.map((v, j) => j === l ? mx.value : v) }))))));
            }));
            else measured = [{ region: combo.region, sizes: [knownBlock] }];
            for (const m of measured) {
              const crossGaps = scalar(gaps(crossGap, combo.lines.length)), used = sum(total(m.sizes), crossGaps);
              let stretched = [{ region: m.region, sizes: m.sizes }];
              if (wrap && knownBlock && ['normal', 'stretch'].includes(style['align-content'])) stretched = clamp(m.region, diff(knownBlock, used)).map(({ region: r, value: extra }) => ({ region: r, sizes: m.sizes.map(v => sum(v, times(extra, div(one, q(combo.lines.length))))) }));
              for (const st of stretched) {
                const contentBlock = knownBlock ?? used, blockSize = sum(contentBlock, blockEdges);
                if (emit && knownBlock) obligation(knownBlock, used, box, st.region, 'E_LAYOUT_TRACKS', 'block', fitBlock && !scrolls(style, 'y'), explainTracks('block'), () => ({ layout: 'flex' }));
                let endings = [st.region], lineStart = scalar(0);
                combo.lines.forEach((line, l) => {
                  const top = lineStart;
                  line.indices.forEach((i, k) => {
                    const origin = line.starts ? offset(contentOrigin, line.starts[k], top) : null;
                    endings = bounded(endings.flatMap(r => solve(model[i].child.box, itemAvailable(model[i], { inline: line.values[k], block: st.sizes[l], origin, fitInline, fitBlock }), r, ancestors, inheritedOf(model[i]), emit).map(result => result.region)));
                  });
                  lineStart = sum(sum(lineStart, st.sizes[l]), scalar(crossGap));
                });
                for (const r of endings) out.push(finish(box, style, r, inline, contentInline, blockSize, contentBlock, available, parents, emit));
              }
            }
          }
        }
        }
        continue;
      }
      // Column: the main axis is the block axis; items are as wide as the content box unless aligned.
      if (!block) {
        let endings = [state.region];
        for (const entry of model) endings = bounded(endings.flatMap(r => solve(entry.child.box, itemAvailable(entry, { inline: contentInline, fitInline }), r, ancestors, inheritedOf(entry), emit).map(result => result.region)));
        for (const r of endings) out.push(finish(box, style, r, inline, contentInline, null, null, available, parents, emit));
        continue;
      }
      // Measure content-sized items (their block size is both base and minimum).
      let measured = [{ region: state.region, items: model.map(entry => entry.item.base === 'content' ? null : constantItem(entry.item)) }];
      model.forEach((entry, i) => {
        if (entry.item.base !== 'content') return;
        measured = bounded(measured.flatMap(m => solve(entry.child.box, itemAvailable(entry, { inline: contentInline }), m.region, ancestors, inheritedOf(entry), false)
          .map(result => { const outer = sum(result.block, scalar(entry.item.marginMain ?? zero));
            // With an explicit minimum the item is an ordinary one from its measured base (it may shrink below its
            // content down to that minimum, and its hypothetical size is at least it).
            const item = entry.item.contentMinimum !== undefined ? { ...entry.item, base: outer, minimum: scalar(add(entry.item.contentMinimum, entry.item.marginMain ?? zero)), contentMinimum: undefined } : { ...entry.item, base: outer, minimum: outer, content: true };
            return { region: result.region, items: m.items.map((v, j) => j === i ? item : v) }; })));
      });
      for (const m of measured) {
        let lines;
        if (knownBlock) lines = resolveFlexLine(m.region, knownBlock, m.items, gaps(mainGap, m.items.length));
        else {
          // (Measuring the natural height for min-height only: the container is then sized to its content, which
          // is the sum of the items' content heights whatever they grow by; the layout itself is done at the minimum.)
          if (m.items.some(item => cmp(item.grow, zero) > 0) && !(available.$minNatural && !emit)) throw flexUnknown('Flexible items in a column with an indefinite height grow from their content; give the container a definite height');
          const values = m.items.map(item => item.content ? item.base : maximumConstant(item.base, item.minimum));
          lines = [{ region: m.region, values, free: scalar(0) }];
        }
        for (const line of lines) for (const placed of mainStarts(line.region, line.values, line.free, m.items, mainGap, main, style['justify-content'])) {
          const used = sum(total(line.values), scalar(gaps(mainGap, line.values.length)));
          const contentBlock = knownBlock ?? used, blockSize = sum(contentBlock, blockEdges);
          // The last item's bottom margin may stick out (it hides nothing).
          if (emit && knownBlock) obligation(knownBlock, diff(used, scalar(model.length ? model.at(-1).margins.bottom : zero)), box, placed.region, 'E_LAYOUT_TRACKS', 'block', fitBlock && !scrolls(style, 'y'), explainTracks('block'), () => ({ layout: 'flex' }));
          let endings = [placed.region];
          model.forEach((entry, i) => {
            const origin = placed.starts ? offset(contentOrigin, scalar(0), placed.starts[i]) : null;
            endings = bounded(endings.flatMap(r => solve(entry.child.box, itemAvailable(entry, { inline: contentInline, block: line.values[i], origin, fitInline, fitBlock }), r, ancestors, inheritedOf(entry), emit).map(result => result.region)));
          });
          for (const r of endings) out.push(finish(box, style, r, inline, contentInline, blockSize, contentBlock, available, parents, emit));
        }
      }
    }
    return out;
  }
  // Inline content of a text leaf: phrasing elements that stay display: inline add no geometry when
  // they have no horizontal padding, border or margin (and keep a font-derived contract's font).
  // Each gets its own computed style and DOM facts as a row without a rectangle.
  const fontKeys = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'text-transform'];
  // Generated content outside a grid/flex container (a leaf, inline content, or a container whose children are
  // not collected here) has no modeled box: Unknown unless it generates nothing.
  // Generated text is allowed where it cannot change the geometry: in a leaf with px width and height, or in a
  // text leaf whose measured content already holds it (at its start for ::before, its end for ::after), set in the
  // leaf's font. It is recorded as the box's generated text (accessible names include it).
  function generatedElsewhere(box, region, parents, inheritedStyle) {
    if (box.pseudo) return null;
    const generated = {};
    let deferred = null; // the first error, raised once both kinds are recorded
    for (const kind of ['before', 'after']) {
      const pbox = { ...box, path: `${box.path}/${kind === 'before' ? -1 : (box.children ?? []).length}`, label: `${box.label}::${kind}`, children: [], pseudo: kind };
      for (const c of styles(pbox, region, parents, inheritedStyle, false, false, new Set([`::${kind}`]))) {
        const content = c.style.content ?? 'none';
        if (content === 'none' || c.style.display === 'none') continue;
        const text = content.startsWith('text:') ? content.slice(5) : null;
        const fixed = !(box.children ?? []).length && !box.inline?.length && ['inline-size', 'block-size'].every(key => /^\d+(?:\.\d+)?px$/.test(inheritedStyle[key])) && c.style.position === 'static';
        const measured = box.contract?.textMetrics?.text, collapsedText = text?.replace(/\s+/g, ' ').trim();
        const inMeasure = text !== null && typeof measured === 'string' && collapsedText && (kind === 'before' ? measured.startsWith(collapsedText) : measured.endsWith(collapsedText)) && c.style.position === 'static'
          && ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'text-transform'].every(key => c.style[key] === inheritedStyle[key]) && c.style.display === 'inline';
        // An absolutely positioned generated box of a leaf (a hit-area expansion, a check mark) is out of flow: it is laid
        // out after the leaf, against its containing block (leafPseudo).
        if (text === null && c.style.position === 'absolute' && !(box.children ?? []).length && !box.inline?.length) { box.absolutePseudo = [...new Set([...(box.absolutePseudo ?? []), kind])]; continue; }
        // Generated text is recorded (path, contract selector, kind, text) so a text resolver can measure it with the
        // leaf's content and analyse again (withGeneratedText in /text).
        if (text !== null && !generatedTexts.some(g => g.path === box.path && g.kind === kind && g.text === text)) generatedTexts.push({ path: box.path, box: box.label, ...(box.contractSelector ? { selector: box.contractSelector } : {}), kind, text });
        if (text === null || !(fixed || inMeasure)) { deferred ??=  Object.assign(new Error(`${pbox.label} generates ${text === null ? 'a box' : 'text'} that may change the layout (only text in a px-sized leaf, or included in the leaf's measured text, is modeled)`), { code: 'U_LAYOUT_PSEUDO' }); continue; }
        generated[kind] = text;
      }
    }
    if (deferred) throw deferred;
    return generated.before !== undefined || generated.after !== undefined ? generated : null;
  }
  // Measured bounds of an inline element in one line of fixed text (textMetrics.inline): an outer
  // rectangle it stays inside and an inner one it always covers, from the leaf's content box.
  const sixtyfourths = (value, round) => div(q(String(round(value * 64))), q(64));
  // A list of {region, outer, inner}: one piece for one line of text, one per width interval of the
  // line layout for wrapping text (none where the element is split across lines).
  function inlineBounds(child, leaf, leafStyle, leafRow, region) {
    const metrics = leaf.contract?.textMetrics;
    if (!leafRow?.origin || !metrics?.inline || !['start', 'left'].includes(leafStyle['text-align']) || leafStyle.direction !== 'ltr') return null;
    if (!(metrics.kind === 'content' && ['nowrap', 'one-line'].includes(leaf.contract.wrap)) && metrics.kind !== 'lines') return null;
    const entry = Object.entries(metrics.inline).find(([selector]) => matches(compileSelector(selector), child));
    if (!entry) return null;
    const x = sum(leafRow.origin.inline, scalar(leafRow.content.left));
    // A table cell aligns its lines by vertical-align within its (stretched) content box (measured: middle by default).
    const L = leaf.contract.font?.lineHeight, align = leaf.tableCell ? leafStyle['vertical-align'] : 'top';
    if (!['top', 'middle', 'bottom'].includes(align) || (align !== 'top' && (!leafRow.block || !L))) return null;
    const contentBlock = leafRow.block && diff(leafRow.block, scalar(['top', 'bottom'].map(side => add(px(leafStyle[`padding-${side}`]), px(leafStyle[`border-${side}`]))).reduce(add, zero)));
    const shift = lines => align === 'top' ? scalar(zero) : times(diff(contentBlock, scalar(mul(q(String(L)), q(lines)))), align === 'middle' ? div(q(1), q(2)) : q(1));
    let y = sum(leafRow.origin.block, scalar(leafRow.content.top));
    const rect = (x0, x1, y0, y1) => cmp(x1, x0) > 0 && cmp(y1, y0) > 0 ? { origin: { inline: sum(x, scalar(x0)), block: sum(y, scalar(y0)) }, inline: scalar(sub(x1, x0)), block: scalar(sub(y1, y0)) } : null;
    const piece = (b, r) => ({ region: r, outer: rect(sixtyfourths(b.start[0], Math.floor), sixtyfourths(b.end[1], Math.ceil), sixtyfourths(b.top[0], Math.floor), sixtyfourths(b.bottom[1], Math.ceil)),
      inner: rect(sixtyfourths(b.start[1], Math.ceil), sixtyfourths(b.end[0], Math.floor), sixtyfourths(b.top[1], Math.ceil), sixtyfourths(b.bottom[0], Math.floor)) });
    const base = y;
    if (metrics.kind === 'content') { y = sum(base, shift(1)); return [piece(entry[1], region)]; }
    const content = leafRow.content.inline, out = [];
    for (const step of entry[1]) {
      if (step.split) continue;
      let r = clip(region, diff(content, scalar(sixtyfourths(step.atLeastInlineSize, Math.round))));
      if (r && step.below !== null) r = clip(r, diff(scalar(sixtyfourths(step.below, Math.round)), content), true);
      if (r && align !== 'top' && step.lines === undefined) return null;
      if (r) { y = sum(base, shift(step.lines ?? 1)); out.push(piece(step, r)); }
    }
    return out;
  }
  function inlineContent(leaf, leafStyle, region, parents, chain, leafRow) {
    for (const child of leaf.inline) for (const state of styles(child, region, parents.map(p => ({ ...p, names: [] })), parents.at(-1).style, false, false)) {
      const style = state.style;
      if (style.display === 'none') continue;
      const generatedText = generatedElsewhere(child, state.region, parents, style);
      if (generatedText) child.generated = generatedText;
      if (style.display !== 'inline' || style.position !== 'static' || style.float !== 'none') throw Object.assign(new Error(`${child.label} inside text must stay display: inline and static to keep the text's measured size`), { code: 'U_LAYOUT_INLINE' });
      // auto margins of inline boxes compute to 0.
      for (const side of ['left', 'right']) for (const key of [`padding-${side}`, `border-${side}`, `margin-${side}`]) if (!['0', '0px', ...(key.startsWith('margin') ? ['auto'] : [])].includes(String(style[key]))) throw Object.assign(new Error(`${child.label} inside text has horizontal ${key}; inline box edges change the measured text`), { code: 'U_LAYOUT_INLINE' });
      if (leaf.contract?.textMetrics && fontKeys.some(key => style[key] !== leafStyle[key])) throw Object.assign(new Error(`${child.label} changes the font inside text measured as one run`), { code: 'U_LAYOUT_INLINE' });
      // Sizes, vertical margins and aspect-ratio do not apply to a non-replaced inline box (CSS 2.2 §10.3.1, §10.6.1;
      // measured: width, height, min/max-width, margin-top and aspect-ratio on a span change no pixel), nor do
      // transforms (CSS Transforms 1 §1: only block-level and atomic inline boxes are transformable; measured too).
      if (!['img', 'video', 'canvas', 'iframe', 'svg', 'input', 'button', 'select', 'textarea'].includes(child.tag) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === child.path)) {
        const initial = { 'inline-size': ['auto'], 'block-size': ['auto'], 'min-inline-size': ['auto', '0', '0px'], 'min-block-size': ['auto', '0', '0px'], 'max-inline-size': ['none'], 'max-block-size': ['none'], 'margin-top': ['0', '0px', 'auto'], 'margin-bottom': ['0', '0px', 'auto'], 'aspect-ratio': ['auto'], transform: ['none'], translate: ['none'], rotate: ['none'], scale: ['none'] };
        const written = Object.keys(initial).filter(key => style.$sources?.[key] && !initial[key].includes(String(style[key])));
        if (written.length) layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: child.label, path: child.path, properties: written,
          css: written.map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
          message: `${child.label}: ${written.join(', ')} ${written.length === 1 ? 'has' : 'have'} no effect (it is display: inline, a box that flows in the line: ${written.every(key => ['transform', 'translate', 'rotate', 'scale'].includes(key)) ? 'transforms do not apply' : written.some(key => ['transform', 'translate', 'rotate', 'scale'].includes(key)) ? 'sizes, vertical margins and transforms do not apply' : 'sizes and vertical margins do not apply'}). Use display: inline-block (or block) to ${written.every(key => ['transform', 'translate', 'rotate', 'scale'].includes(key)) ? 'transform' : 'size'} it`, ...ranges(state.region) });
      }
      const own = [...chain, paintFacts(style)];
      geometry.push({ box: child, path: child.path, region: state.region, origin: null, inline: null, block: null, position: 'static', inlineFlow: true,
        borders: { left: zero, right: zero, top: zero, bottom: zero }, overflow: 'visible', overflowValue: 'visible', painted: paints(style), paint: paintFacts(style), chain: own, parentText: leaf.path,
        ...(leafRow ? { bounds: inlineBounds(child, leaf, leafStyle, leafRow, state.region) ?? undefined } : {}) });
      if (child.children?.length) inlineContent({ ...child, inline: child.children, contract: leaf.contract }, style, state.region, [...parents, { box: child, style }], own);
    }
  }
  const focusState = new Set(['focus', 'focus-visible', 'focus-within']), hoverState = new Set(['hover']);
  const focusableBox = box => box.focusable === true || box.tabIndex >= 0 || (['button', 'select', 'textarea'].includes(box.tag) && box.focusable !== false) || (box.tag === 'input' && box.focusable !== false && box.inputType !== 'hidden');
  // A :focus rule that moves an absolutely positioned box by its insets: where the focused box lands (stateGeometry
  // rules; accessibility checks only). Any other focused inset change is not modeled.
  function focusMove(box, style, focused, available, inline, blockSize, parents) {
    const moved = ['left', 'right', 'top', 'bottom'].some(key => focused[key] !== style[key]), turned = focused.transform !== style.transform;
    if (!moved && !turned) return {};
    if (moved && style.position !== 'absolute') throw Object.assign(new Error(`${box.label}: a :focus rule changes the insets of a box that is not absolutely positioned`), { code: 'U_LAYOUT_SELECTOR' });
    // The focused box: placed by its focused insets, then painted through its focused transform.
    const painted = scaled(focused, resolvedOrigin(focused, available, inline, blockSize, parents), inline, blockSize);
    return painted.origin ? { origin: painted.origin, inline: painted.inline, block: painted.block } : { originUnknown: true };
  }
  function finish(box, style, region, inline, contentInline, blockSize, contentBlock, available, parents, emit) {
    const contract = box.contract ?? {};
    // Justify alignment is modeled as the default (stretch / start) only: where it applies — a grid container's items,
    // a grid item, an absolute box — any other value is Unknown; on a flex item or container it does nothing.
    {
      const parentStyle = parents.at(-1)?.style, aligned = value => !['auto', 'normal', 'stretch', 'legacy'].includes(String(value ?? 'auto'));
      const ownSelf = aligned(style['justify-self']), fromItems = String(style['justify-self'] ?? 'auto') === 'auto' && aligned(parentStyle?.['justify-items']);
      const where = style.position === 'absolute' ? 'an absolute box' : ['grid', 'inline-grid'].includes(parentStyle?.display) ? 'a grid item' : null;
      if (where && (ownSelf || fromItems) && !available.justifyHandled) throw Object.assign(new Error(`${box.label}: justify alignment ${ownSelf ? `justify-self: ${style['justify-self']}` : `justify-items: ${parentStyle['justify-items']} (from its parent)`} of ${where} is not modeled`), { code: 'U_LAYOUT_CSS', box });
    }
    if (emit) {
      const self = [...parents, { box, style }];
      const offered = axis => () => parents.length ? [...trackProperties(axis).map(property => fact(parents.at(-1).box, parents.at(-1).style, property)),
        fact(box, style, axis === 'inline' ? 'grid-column' : 'grid-row'), ...sizeChain(parents, axis, { hostInset: options.hostInset })] : [{ kind: 'viewport', axis }];
      const own = axis => sizeProperties(axis).filter(property => style.$sources[property] || property === (axis === 'inline' ? 'inline-size' : 'block-size')).map(property => fact(box, style, property));
      const item = axis => () => explanation(offered(axis)(), own(axis));
      const content = (axis, property) => () => explanation(sizeChain(self, axis, { hostInset: options.hostInset }), [contractFact(box, property)]);
      // An end margin may stick out of the area: it creates no overflow and hides nothing (measured), so the fit check
      // is start margin + border box against the area.
      // (The end margin may stick out; a negative one does not narrow the box's room.)
      obligation(available.marginEnd && cmp(available.marginEnd.inline, zero) > 0 ? sum(available.inline, scalar(available.marginEnd.inline)) : available.inline, inline, box, region, 'E_LAYOUT_ITEM_SIZE', 'inline', available.fitInline !== false, item('inline'));
      // A text domain reports how many characters still fit at the witness.
      const domain = contract.textMetrics?.kind === 'domain' ? offeredInline => ({ text: { maxLength: contract.textMetrics.maxLength, fitsUpTo: fittingLength(contract.textMetrics, offeredInline), widest: contract.textMetrics.widest } }) : undefined;
      // A one-line text cut with an ellipsis (text-overflow: ellipsis, overflow hidden or clip, nowrap) is intended
      // truncation: where the text needs more than the box, it is a warning, not a content violation.
      const ellipsis = style['text-overflow'] === 'ellipsis' && ['hidden', 'clip'].includes(style['overflow-x']) && ['nowrap', 'pre'].includes(style['white-space']) && box.text;
      if (ellipsis && contract.minInlineSize !== undefined && emit) {
        const cut = clip(region, diff(scalar(contract.minInlineSize), contentInline), true);
        if (cut && !layoutWarnings.some(w => w.code === 'W_LAYOUT_TRUNCATED' && w.path === box.path)) { const p = sample(cut); layoutWarnings.push({ code: 'W_LAYOUT_TRUNCATED', severity: 'warning', box: box.label, path: box.path,
          message: `${box.label} is cut with an ellipsis: its text needs ${number(q(String(contract.minInlineSize)))}px but the box offers ${number(evaluate(contentInline, p))}px at viewport ${number(p.x)}px (keep the full text available, e.g. in its accessible name or the page it links to)`, ...ranges(cut) }); }
      }
      if (contract.minInlineSize !== undefined && !visuallyHiddenStyle(style)) obligation(contentInline, scalar(contract.minInlineSize), box, region, 'E_LAYOUT_CONTENT', 'inline', (contract.overflow ?? 'fit') === 'fit' && !ellipsis, content('inline', 'minInlineSize'), domain);
      if (block) {
        // The document root may be taller than the viewport when the viewport scrolls (html overflow-y not hidden/clip):
        // that is an ordinary long page. With overflow-y visible and a classic scrollbar profile the scrollbar would
        // appear and narrow the page, which is not laid out, so the root is still required to fit there. A hidden or
        // clipped root cannot scroll: content below the viewport is unreachable (the obligation stays).
        const viewportScrolls = box.documentRoot && available.root && !['hidden', 'clip'].includes(style['overflow-y']) && (['auto', 'scroll'].includes(style['overflow-y']) || (scrollbarProfile !== undefined && !(scrollbarProfile.inlineSize > 0)));
        // Without a scrollbar profile, a root taller than the viewport scrolls with a platform scrollbar of unknown width.
        if (box.documentRoot && available.root && available.block && !['hidden', 'clip', 'auto', 'scroll'].includes(style['overflow-y']) && scrollbarProfile === undefined && clip(region, diff(blockSize, available.block), true))
          throw Object.assign(new Error(`${box.label} is taller than the viewport, so the viewport scrolls: declare scrollbar profiles (the scrollbars option) for the platforms the page is checked on`), { code: 'U_LAYOUT_SCROLLBAR' });
        // With a classic scrollbar and overflow-y visible, a long page scrolls too (the root's visible is the viewport's
        // auto), and the scrollbar narrows it; that narrowing is laid out only for an explicit auto or scroll, so a
        // root taller than the viewport here is Unknown, not a violation (the page does scroll in a browser).
        if (box.documentRoot && available.root && available.block && !['hidden', 'clip', 'auto', 'scroll'].includes(style['overflow-y']) && scrollbarProfile?.inlineSize > 0 && clip(region, diff(blockSize, available.block), true))
          throw Object.assign(new Error(`${box.label} is taller than the viewport, so the viewport scrolls and its ${scrollbarProfile.name ?? 'classic'} scrollbar (${scrollbarProfile.inlineSize}px) narrows the page; that is laid out when html sets overflow-y: auto or scroll (the same in a browser)`), { code: 'U_LAYOUT_SCROLLBAR' });
        // An absolute box taller than its containing block (a dropdown under a short field) hangs out of it: that hides
        // nothing by itself (clipping and page overflow are checked on their own), so there is no block-size obligation
        // against a positioned ancestor or the initial containing block. A fixed box taller than the viewport keeps it.
        const hangs = available.containingBlock && available.containingBlock.path !== 'viewport';
        if (available.block && !hangs) obligation(available.marginEnd ? sum(available.block, scalar(available.marginEnd.block)) : available.block, blockSize, box, region, 'E_LAYOUT_ITEM_SIZE', 'block', available.fitBlock !== false && !viewportScrolls, item('block'));
        if (contract.minBlockSize !== undefined && !visuallyHiddenStyle(style)) (box.tableCell && (contract.overflowBlock ?? 'fit') === 'fit' ? cellGrows : obligation)(contentBlock, scalar(contract.minBlockSize), box, region, 'E_LAYOUT_CONTENT', 'block', (contract.overflowBlock ?? 'fit') === 'fit', content('block', 'minBlockSize'));
      }
      let positioned;
      if (style.position === 'absolute') {
        const containing = available.containingBlock;
        if (!containing || !blockSize) throw new Error('Absolute box has no independently resolved local containing block');
        const origin = absoluteOrigin(style, containing, {inline, block:blockSize});
        for (const [axis, dimension] of [['inline',inline],['block',blockSize]]) {
          // Against a containing block that clips on this axis, reaching past it is the box being cut off.
          const cut = containing.clips && containing.clips[axis === 'inline' ? 'x' : 'y'];
          obligation(origin[axis], scalar(0), box, region, cut ? 'E_LAYOUT_ABSOLUTE_CLIPPED' : 'E_LAYOUT_ABSOLUTE_START', axis);
          obligation(containing[axis], sum(origin[axis],dimension), box, region, cut ? 'E_LAYOUT_ABSOLUTE_CLIPPED' : 'E_LAYOUT_ABSOLUTE_END', axis);
        }
        positioned = {origin:{inline:affine(origin.inline),block:affine(origin.block)},containingBlock:{path:containing.path,inline:affine(containing.inline),block:affine(containing.block)}};
      }
      const origin=resolvedOrigin(style,available,inline,blockSize,parents);
      const overflowValue=[style['overflow-x'],style['overflow-y']].find(v=>v!=='visible') ?? 'visible';
      // A box's own overflow clips its content, not its border box.
      const unscaledOrigin = origin ?? resolvedOrigin({...style,'overflow-x':'visible','overflow-y':'visible'},available,inline,blockSize,parents);
      const painted = scaled(style, unscaledOrigin, inline, blockSize), ownOrigin = painted.origin;
      // Inside an overflow: clip box positions are exact but parts may be clipped away: the other rules see no
      // position (as before), focus-clipped reads clipOrigin.
      const underClip = parents.some(p => p.clipScope);
      // Sticky inside an overflow: hidden box (a scroll container nobody scrolls): it sticks to that box, not to the page,
      // so it never sticks; at the initial scroll position it is where the flow puts it (a warning, laid out as relative).
      // overflow-x: clip with overflow-y visible is not a scroll container (CSS Overflow 3): a sticky box inside still
      // sticks to the page, and a horizontal clip does not cut its vertical sticking.
      const xClipOnly = p => p.style && p.style['overflow-x'] === 'clip' && p.style['overflow-y'] === 'visible';
      const scrolling = p => p.style && !xClipOnly(p) && ['overflow-x', 'overflow-y'].some(key => p.style[key] !== 'visible');
      const scroller = [...parents].reverse().find(scrolling);
      // A scroll container nobody scrolls vertically: overflow hidden, or overflow-x auto/scroll (so y computes to auto)
      // with a content-sized block size. A top/bottom sticky box sticks to it, which does not move, so it never sticks
      // to the page; at the initial scroll position it is where the flow puts it (a warning, laid out as relative).
      // A sticky left/right box (a sticky first column) does stick inside a horizontal scroller: not judged here.
      const stillY = p => ['overflow-x', 'overflow-y'].every(key => p.style[key] === 'hidden')
        || (['auto', 'scroll'].includes(p.style['overflow-x']) && ['visible', 'auto', 'hidden'].includes(p.style['overflow-y']) && p.style['block-size'] === 'auto' && ['none', undefined].includes(p.style['max-block-size']) && p.style['overflow-y'] !== 'scroll');
      const horizontalStick = ['left', 'right'].some(side => style[side] !== undefined && style[side] !== 'auto');
      if (style.$sticky && scroller && !horizontalStick && stillY(scroller) && !parents.some(p => p !== scroller && scrolling(p))) {
        const how = ['overflow-x', 'overflow-y'].every(key => scroller.style[key] === 'hidden') ? 'overflow: hidden' : `overflow-x: ${scroller.style['overflow-x']} (so its overflow-y is auto) and no height of its own`;
        if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_STICKY_SCROLLER' && w.path === box.path)) layoutWarnings.push({ code: 'W_LAYOUT_STICKY_SCROLLER', severity: 'warning', box: box.label, path: box.path, scroller: scroller.box.label,
          message: `${box.label} is position: sticky inside ${scroller.box.label}, which has ${how}: it sticks to that box, which does not scroll vertically, so it never sticks to the page. Use overflow-x: clip on the ancestor (not a scroll container), or move the sticky box out of it`, ...ranges(region) });
        style = { ...style, $sticky: false };
      }
      if (style.$sticky && parents.some(p => (p.clipped || p.clipScope || scrolling(p)) && !xClipOnly(p))) throw Object.assign(new Error(`${box.label} is position: sticky inside a scrolling or clipping ancestor, which it would stick to`), { code: 'U_LAYOUT_CSS' });
      if (style['animation-name'] !== 'none' && style['animation-play-state'] !== 'paused' && !/^-?0+(?:\.0+)?m?s$/.test(style['animation-duration']) && keyframeFrames.get(style['animation-name'])?.some(frame => frame.layout)) animated.push({ box, region, name: style['animation-name'], position: style.position, duration: style['animation-duration'], count: style['animation-iteration-count'], direction: style['animation-direction'] });
      // A bar fixed to the bottom edge under viewport-fit=cover: its content must clear the bottom safe area (the home
      // indicator), so its bottom padding has to be at least that inset (env(safe-area-inset-bottom)).
      if (style.$fixed && cover && options.safeArea?.bottom > 0 && ['0', '0px'].includes(style.bottom) && (box.children ?? []).length && cmp(px(style['padding-bottom']), q(String(options.safeArea.bottom))) < 0 && !layoutWarnings.some(w => w.code === 'W_LAYOUT_SAFE_AREA' && w.path === box.path))
        layoutWarnings.push({ code: 'W_LAYOUT_SAFE_AREA', severity: 'warning', box: box.label, path: box.path, inset: options.safeArea.bottom,
          message: `${box.label} is fixed to the bottom edge of a viewport-fit=cover page, but its bottom padding (${style['padding-bottom']}) is less than the ${options.safeArea.bottom}px safe area: its content sits under the home indicator. Use padding-bottom: max(…, env(safe-area-inset-bottom))`, ...ranges(region) });
      // iOS Safari zooms the page in when a field under 16px text takes focus (unless the page forbids zooming, which
      // meta-viewport reports): the layout jumps on every tap into the field.
      if (!box.pseudo && (['select', 'textarea'].includes(box.tag) || (box.tag === 'input' && !['hidden', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'range', 'color', 'file'].includes(box.inputType ?? 'text')))
        && /^\d+(?:\.\d+)?px$/.test(style['font-size']) && Number.parseFloat(style['font-size']) < 16 && !/maximum-scale\s*=\s*1(?:\.0+)?\b|user-scalable\s*=\s*(?:no|0)/i.test(String(root.metaViewport ?? '')) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_INPUT_ZOOM' && w.path === box.path))
        layoutWarnings.push({ code: 'W_LAYOUT_INPUT_ZOOM', severity: 'warning', box: box.label, path: box.path, fontSize: style['font-size'],
          message: `${box.label} has ${style['font-size']} text: iOS Safari zooms the page in when a field under 16px takes focus. Use font-size: 16px (or more) for fields`, ...ranges(region) });
      // A height in vh is the large viewport on mobile browsers (toolbars hidden): while the toolbar shows, the bottom
      // of the box is under it. svh / dvh follow the visible viewport.
      if (!box.pseudo && /(^|[^sld])\bvh\b|\d(?:vh|vmin|vmax)\b/.test(String(style['block-size']).replace(/[sld]v(?:h|min|max)/g, '')) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_VH_TOOLBAR' && w.path === box.path))
        layoutWarnings.push({ code: 'W_LAYOUT_VH_TOOLBAR', severity: 'warning', box: box.label, path: box.path, value: style['block-size'],
          message: `${box.label} is ${style['block-size']} tall: on mobile browsers vh is the viewport with the toolbars hidden, so its bottom is under the toolbar until the page scrolls. Use svh (or dvh) for a box that must fit the visible screen`, ...ranges(region) });
      // Font swap: text in a web font (an @font-face family first in font-family) whose box takes its height from the
      // text is laid out with a fallback font until the file arrives, then again with the web font; unless the font is
      // optional (never swapped in late) the text's lines can change and move what follows (a layout shift).
      // The text changes its box when the box takes its height from it (line-height normal follows the font's metrics;
      // wrapping text can change its line count) or its width (a flex item without a px width).
      const singleLine = ['nowrap', 'pre'].includes(style['white-space']) || ['nowrap', 'one-line'].includes(box.contract?.wrap);
      const heightFromFont = style['block-size'] === 'auto' && (!/^\d+(?:\.\d+)?px$/.test(style['line-height']) || !singleLine);
      const widthFromFont = parents.at(-1)?.style?.display === 'flex' && !/^\d+(?:\.\d+)?px$/.test(style['inline-size']) && !/^\d+(?:\.\d+)?px$/.test(style['flex-basis']) && style['flex-grow'] === '0';
      if ((box.text || box.inline?.length) && (heightFromFont || widthFromFont) && !layoutWarnings.some(w => w.path === box.path)) {
        const families = String(style['font-family'] ?? '').split(',').map(f => f.trim().replace(/^["']|["']$/g, '').toLowerCase());
        const faces = fontFaces.filter(face => face.family.toLowerCase() === families[0]);
        if (faces.length && faces.some(face => face.display !== 'optional')) {
          const face = faces.find(face => face.display !== 'optional');
          const fallback = fontFaces.find(other => families.slice(1).includes(other.family.toLowerCase()) && other.overrides.length);
          layoutWarnings.push({ code: 'W_LAYOUT_FONT_SWAP', severity: 'warning', box: box.label, path: box.path, family: face.family, display: face.display, ...(fallback ? { fallback: fallback.family } : {}),
            message: `${box.label} is set in the web font ${face.family} (font-display: ${face.display}) and takes its ${heightFromFont ? 'height' : 'width'} from its text: when the font file arrives the text is laid out again${fallback ? `; the fallback ${fallback.family} overrides metrics (${fallback.overrides.join(', ')}), which only reduces the change` : ''}. Use font-display: optional, preload the font, match the fallback metrics (size-adjust, ascent-override, descent-override), or reserve the box's height`, ...ranges(region) });
        }
      }
      // A font-family list that ends without a generic family: when none of the named fonts is there (not installed, the
      // web font file failed or is still loading with font-display: block/swap), the browser falls back to its default
      // font (the initial font-family, Times New Roman in Chromium), not to a font of the same kind. One warning per declaration (the box itself
      // or the ancestor the value is inherited from), on boxes with text only.
      if ((box.text || box.inline?.length) && !box.pseudo) {
        const owner = [...parents, { box, style }].toReversed().find(p => p.style?.$sources?.['font-family']);
        const source = owner?.style.$sources['font-family'], value = String(source?.specified ?? style['font-family'] ?? '').replace(/\s*!important\s*$/i, '');
        const generic = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong)$/i;
        const families = value.split(',').map(f => f.trim());
        // Families known to be there: named by the caller (knownFonts, the font files a lint was given), or an @font-face whose sources are all
        // embedded (data: URLs, which cannot fail to load).
        const known = new Set([...(options.knownFonts ?? []), ...fontFaces.filter(face => face.embedded).map(face => face.family)].map(f => f.toLowerCase()));
        if (source && !/var\(|^(?:inherit|initial|unset|revert|revert-layer|ua-default|ua-control)$/i.test(value.trim()) && !families.some(f => generic.test(f) || known.has(f.replace(/^["']|["']$/g, '').toLowerCase()))
          && !layoutWarnings.some(w => w.code === 'W_CSS_FONT_NO_GENERIC' && w.css[0].file === source.file && w.css[0].line === source.line && w.css[0].selector === source.selector))
          layoutWarnings.push({ code: 'W_CSS_FONT_NO_GENERIC', severity: 'warning', box: box.label, path: box.path, value, css: [{ property: 'font-family', file: source.file, line: source.line, selector: source.selector }],
            message: `${source.selector ?? owner.box.label} sets font-family: ${value} with no generic family at the end: where ${families.length > 1 ? 'none of these fonts is' : `${families[0]} is not`} available (not installed, or a web font that failed or has not loaded), ${box.label}'s text falls back to the browser's default font (in Chromium and Firefox usually a serif such as Times New Roman), not to a font of the kind asked for. End the list with a generic family (sans-serif, serif, monospace, system-ui)` });
      }
      // Physical sides in an rtl box: a left/right value written physically (not as an inline-start/end side) that
      // differs from the other side, or text-align: left/right, stays on that side instead of following the reading
      // direction (an ltr style copied into rtl content). A warning: a deliberate physical side is possible.
      if (emit && !box.pseudo && style.direction === 'rtl' && !layoutWarnings.some(w => w.code === 'W_LAYOUT_PHYSICAL_IN_RTL' && w.path === box.path)) {
        const physical = key => style.$sources?.[key] && !style.$sources[key].logical;
        const found = [];
        for (const kind of ['padding', 'border', 'margin']) for (const side of ['left', 'right']) {
          const key = `${kind}-${side}`, other = `${kind}-${side === 'left' ? 'right' : 'left'}`;
          if (physical(key) && String(style[key]) !== String(style[other])) found.push(key);
        }
        for (const key of ['left', 'right']) if (style.position !== 'static' && physical(key) && style[key] !== 'auto') found.push(key);
        if (physical('text-align') && ['left', 'right'].includes(style['text-align'])) found.push('text-align');
        if (found.length) layoutWarnings.push({ code: 'W_LAYOUT_PHYSICAL_IN_RTL', severity: 'warning', box: box.label, path: box.path, properties: found,
          css: found.map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
          message: `${box.label} is rtl, but ${found.map(key => `${key}: ${style[key]}`).join(', ')} ${found.length > 1 ? 'are' : 'is'} physical: it stays on that side instead of following the reading direction. Use ${found.includes('text-align') ? 'text-align: start/end and ' : ''}the inline-start/inline-end sides`, ...ranges(region) });
      }
      // A form control keeps the UA control font (the default size − 2.67px, and Arial / monospace), not the page font an
      // ancestor sets: its text is smaller than the text around it, in another family, and does not follow the type scale.
      if (emit && !box.pseudo && ['button', 'input', 'select', 'textarea'].includes(box.tag) && (style['font-size'] === 'ua' || style['font-family'] === 'ua-control') && !(box.tag === 'input' && ['checkbox', 'radio', 'range', 'color', 'hidden'].includes(box.inputType)) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_CONTROL_FONT' && w.path === box.path)) {
        const sizeFrom = style['font-size'] === 'ua' ? [...parents].reverse().find(p => p.style?.$sources?.['font-size'] && p.box) : null;
        const familyFrom = style['font-family'] === 'ua-control' ? [...parents].reverse().find(p => p.style?.$sources?.['font-family'] && p.box) : null;
        const from = sizeFrom ?? familyFrom;
        const kept = [sizeFrom ? `font-size: ${sizeFrom.box.label} sets ${sizeFrom.style['font-size']}, but the control keeps the UA size (13.33px at a 16px default)` : null, familyFrom ? `font-family: ${familyFrom.box.label} sets ${familyFrom.style['font-family']}, but the control keeps the UA ${box.tag === 'textarea' ? 'monospace' : 'Arial'}` : null].filter(Boolean);
        if (from) layoutWarnings.push({ code: 'W_LAYOUT_CONTROL_FONT', severity: 'warning', box: box.label, path: box.path, inheritedFrom: from.box.label,
          message: `${box.label} is a <${box.tag}>, which does not inherit ${kept.join('; nor ')}. Add button, input, select, textarea { font: inherit }`, ...ranges(region) });
      }
      // Declarations a display makes inert (the layout ignores them; the author meant something): grid placement on a
      // flex item, flex factors on a grid item, and container properties of the other layout model on the box itself.
      if (emit && !box.pseudo && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path)) {
        const initial = { 'grid-column': 'auto', 'grid-row': 'auto', 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', 'grid-template-columns': 'none', 'grid-template-rows': 'none', 'grid-auto-rows': 'auto', 'grid-auto-flow': 'row', 'flex-direction': 'row', 'flex-wrap': 'nowrap' };
        const written = key => style.$sources?.[key] && String(style[key]) !== initial[key];
        // A block container is laid out as a one-column grid ($blockFlow): its children's parent is display: block.
        const parentBlock = !!parents.at(-1)?.style.$blockFlow;
        const parentDisplay = parentBlock ? 'block' : parents.at(-1)?.style.display, inFlow = style.position !== 'absolute';
        const reasons = [];
        if (inFlow && parentDisplay === 'block') for (const key of ['flex-grow', 'flex-shrink', 'flex-basis']) if (written(key)) reasons.push([key, `its parent ${parents.at(-1).box.label} is display: block, not flex`]);
        // top/right/bottom/left move only a positioned box.
        if (style.position === 'static') for (const key of ['top', 'left', 'bottom', 'right']) if (style.$sources?.[key] && String(style[key]) !== 'auto') reasons.push([key, 'it is position: static (add position: relative, or use a margin or transform)']);
        // z-index stacks a positioned box or a grid/flex item; a static block-level box in block flow has no z-order.
        if (style.position === 'static' && parentDisplay === 'block' && style.$sources?.['z-index'] && String(style['z-index']) !== 'auto') reasons.push(['z-index', `it is position: static and its parent ${parents.at(-1).box.label} is display: block (add position: relative)`]);
        // gap spaces grid and flex items; a block container has none.
        if (style.$blockFlow) for (const key of ['row-gap', 'column-gap']) if (style.$sources?.[key] && !['normal', '0', '0px'].includes(String(style.$sources[key].specified ?? '').trim())) reasons.push([key, 'it is display: block, not grid or flex (use margins, or display: grid / flex)']);
        if (inFlow && parentDisplay === 'flex') for (const key of ['grid-column', 'grid-row']) if (written(key)) reasons.push([key, `its parent ${parents.at(-1).box.label} is display: flex, not grid`]);
        if (inFlow && parentDisplay === 'grid') for (const key of ['flex-grow', 'flex-shrink', 'flex-basis']) if (written(key)) reasons.push([key, `its parent ${parents.at(-1).box.label} is display: grid, not flex`]);
        if (style.display === 'flex') for (const key of ['grid-template-columns', 'grid-template-rows', 'grid-auto-rows', 'grid-auto-flow']) if (written(key)) reasons.push([key, 'it is display: flex, not grid']);
        if (style.display === 'grid' && !style.$blockFlow) for (const key of ['flex-direction', 'flex-wrap']) if (written(key)) reasons.push([key, 'it is display: grid, not flex']);
        // Flex and grid container properties on a block container (display: flex forgotten, or overridden): they do
        // nothing (align-content and justify-items do apply to block containers, measured; they are not reported).
        const blockInitial = { 'justify-content': ['normal'], 'align-items': ['normal', 'stretch'], 'flex-direction': ['row'], 'flex-wrap': ['nowrap'], 'grid-template-columns': ['none'], 'grid-template-rows': ['none'], 'grid-auto-flow': ['row'], 'grid-template-areas': ['none'] };
        if ((style.$blockFlow || ['block', 'list-item'].includes(style.display)) && !box.pseudo && !style.$anonymousGridText) for (const [key, initials] of Object.entries(blockInitial)) {
          const specified = String(style.$sources?.[key]?.specified ?? '').trim();
          if (style.$sources?.[key] && specified && !initials.includes(specified)) reasons.push([key, 'it is display: block, not flex or grid']);
        }
        // aspect-ratio sizes an auto dimension; with both sizes set there is none to size.
        if (style.$sources?.['aspect-ratio'] && style['aspect-ratio'] !== 'auto' && ['inline-size', 'block-size'].every(key => style.$sources?.[key] && style[key] !== 'auto')) reasons.push(['aspect-ratio', 'both its width and height are set']);
        // vertical-align applies to inline boxes and table cells; a grid or flex item (blockified) ignores it.
        if (style.$sources?.['vertical-align'] && !['baseline'].includes(String(style['vertical-align'])) && ['grid', 'flex', 'block'].includes(parentDisplay) && !box.tablePart && !style.$inlineLevel) reasons.push(['vertical-align', parentDisplay === 'block' ? 'it is a block-level box, not inline or a table cell' : `it is a ${parentDisplay} item, not inline or a table cell (use align-self)`]);
        // Paint declarations that only work together with another one: text-overflow marks inline overflow that is
        // clipped, -webkit-line-clamp clamps a -webkit-box. (z-index always applies here: every parent is grid or flex.)
        const set = (key, unset) => style.$sources?.[key] && String(style[key]) !== unset;
        // Auto inline margins of a block-level box in block flow with an auto width and no max-width: the box fills its
        // container, so the margins compute to 0 and nothing is centered (CSS 2.2 §10.3.3; measured: the same layout
        // without them). Replaced boxes and form controls keep their own width and are centered: not reported.
        if (inFlow && ['block', 'list-item'].includes(String(parentDisplay)) && String(style['inline-size']) === 'auto' && String(style['max-inline-size']) === 'none' && !['img', 'video', 'canvas', 'iframe', 'svg', 'input', 'button', 'select', 'textarea', 'table'].includes(box.tag) && ['block', 'list-item', 'grid', 'flex'].includes(String(style.display))) {
          const autoSides = ['margin-left', 'margin-right'].filter(key => style.$sources?.[key] && String(style[key]) === 'auto');
          for (const key of autoSides) reasons.push([key, 'its width is auto, so it fills its container and the auto margins are 0 (give it a width or max-width to center it)']);
        }
        // justify-content on a flex row with an item that grows without a cap: the item takes all the free space, so
        // there is none to distribute (measured: the same layout without it). Reported on the container.
        {
          const ps = parents.at(-1)?.style, pbox = parents.at(-1)?.box;
          if (inFlow && ps && ['flex', 'inline-flex'].includes(String(ps.display)) && !String(ps['flex-direction'] ?? 'row').startsWith('column') && String(ps['flex-wrap']) === 'nowrap'
            && ps.$sources?.['justify-content'] && !['normal', 'flex-start', 'start', 'left', 'stretch'].includes(String(ps['justify-content']))
            && cmp(q(String(style['flex-grow'] ?? '0')), zero) > 0 && String(style['max-inline-size']) === 'none'
            && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === pbox.path && w.properties.includes('justify-content')))
            layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: pbox.label, path: pbox.path, properties: ['justify-content'],
              css: [{ property: 'justify-content', file: ps.$sources['justify-content'].file, line: ps.$sources['justify-content'].line, selector: ps.$sources['justify-content'].selector }],
              message: `${pbox.label}: justify-content: ${ps['justify-content']} has no effect (${box.label} grows with flex-grow: ${style['flex-grow']} and takes all the free space, so there is none to distribute)`, ...ranges(region) });
        }
        // justify-content (align-content) on a grid with an fr column (row, in a definite height): the fr track takes all
        // the free space, so there is none to distribute (measured: the same layout without it).
        if (style.display === 'grid' && !style.$blockFlow) {
          const fr = v => /(?:^|[\s(,])\d*\.?\d+fr\b/.test(String(v ?? ''));
          if (set('justify-content', 'normal') && !['start', 'flex-start', 'left', 'stretch'].includes(String(style['justify-content'])) && fr(style['grid-template-columns'])) reasons.push(['justify-content', 'an fr column takes all the free space, so there is none to distribute']);
          if (set('align-content', 'normal') && !['start', 'flex-start', 'stretch'].includes(String(style['align-content'])) && fr(style['grid-template-rows']) && /^\d+(?:\.\d+)?px$/.test(String(style['block-size']))) reasons.push(['align-content', 'an fr row takes all the free space, so there is none to distribute']);
        }
        // overflow-y: auto/scroll on a box of block flow with an auto height and no max-height: the box grows with its
        // content, so it never scrolls vertically (measured: scrollHeight equals clientHeight); the page scrolls
        // instead. (In a column flex or grid with a definite height it is shrunk and does scroll: not reported.)
        if (['block', 'list-item'].includes(String(parentDisplay)) && inFlow && ['auto', 'scroll'].includes(String(style['overflow-y'])) && style.$sources?.['overflow-y'] && String(style['block-size']) === 'auto' && String(style['max-block-size']) === 'none' && box.tag !== 'html' && box.tag !== 'body' && !layoutWarnings.some(w => w.code === 'W_LAYOUT_SCROLL_NEVER' && w.path === box.path))
          layoutWarnings.push({ code: 'W_LAYOUT_SCROLL_NEVER', severity: 'warning', box: box.label, path: box.path, css: [{ property: 'overflow-y', file: style.$sources['overflow-y'].file, line: style.$sources['overflow-y'].line, selector: style.$sources['overflow-y'].selector }],
            message: `${box.label} is overflow-y: ${style['overflow-y']} with an auto height and no max-height in block flow: it grows with its content, so it never scrolls (the page does instead). Give it a max-height (or a height)`, ...ranges(region) });
        // text-overflow marks the overflow of the box's own lines; a flex or grid container has none (its text is in its
        // items, anonymous ones included, whose text-overflow is the initial clip; measured: no ellipsis is drawn).
        if (set('text-overflow', 'clip') && ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(String(style.display)) && !style.$blockFlow) reasons.push(['text-overflow', `it is display: ${style.display}, whose text is laid out in its items: put text-overflow (with overflow: hidden and white-space: nowrap) on the item that holds the text`]);
        else if (set('text-overflow', 'clip') && !['hidden', 'clip', 'auto', 'scroll'].includes(String(style['overflow-x']))) reasons.push(['text-overflow', `its overflow-x is ${style['overflow-x']}, so nothing is clipped to mark`]);
        if (inFlow && ['flex', 'inline-flex'].includes(parentDisplay) && set('justify-self', 'auto')) reasons.push(['justify-self', `its parent ${parents.at(-1).box.label} is display: flex, which ignores justify-self (use margin-inline-start: auto, or justify-content on the parent)`]);
        if (['flex', 'inline-flex'].includes(style.display) && set('justify-items', 'normal')) reasons.push(['justify-items', 'it is display: flex, which ignores justify-items (use justify-content)']);
        if (style['content-visibility'] === 'auto' && String(style['contain-intrinsic-block-size']) === 'none' && style['block-size'] === 'auto' && !layoutWarnings.some(w => w.code === 'W_LAYOUT_CONTENT_VISIBILITY_SIZE' && w.path === box.path))
          layoutWarnings.push({ code: 'W_LAYOUT_CONTENT_VISIBILITY_SIZE', severity: 'warning', box: box.label, path: box.path,
            ...(style.$sources?.['content-visibility'] ? { css: [{ property: 'content-visibility', file: style.$sources['content-visibility'].file, line: style.$sources['content-visibility'].line, selector: style.$sources['content-visibility'].selector }] } : {}),
            message: `${box.label} is content-visibility: auto with no contain-intrinsic-size and an auto height: offscreen it is 0px tall, so the page's scroll height and the scrollbar jump as it comes into view (and an in-page link past it lands in the wrong place). Add contain-intrinsic-size: auto <its usual height>`, ...ranges(region) });
        // A main size under a non-auto flex-basis (flex: 1; width: 200px): flex-basis replaces it (inertMainSize).
        if (style.$inertMain) reasons.push([style.$inertMain.property, `flex-basis: ${style['flex-basis']} sets its main size instead (use flex: 1 1 auto, or flex-basis: ${style.$inertMain.value})`]);
        if (style.$svgUnsized && !layoutWarnings.some(w => w.code === 'W_LAYOUT_SVG_UNSIZED' && w.path === box.path))
          layoutWarnings.push({ code: 'W_LAYOUT_SVG_UNSIZED', severity: 'warning', box: box.label, path: box.path,
            message: style.$svgUnsized === 'fills'
              ? `${box.label} is an svg with a viewBox but no width or height (attribute or CSS): it fills its container's width, so an icon grows with the layout. Give it a width and height (e.g. width="24" height="24")`
              : `${box.label} is an svg with no width, height or viewBox: it is drawn at the default 300×150. Give it a width and height`, ...ranges(region) });
        if (style.$embedDefaultHeight && !layoutWarnings.some(w => w.code === 'W_LAYOUT_EMBED_NO_RATIO' && w.path === box.path))
          layoutWarnings.push({ code: 'W_LAYOUT_EMBED_NO_RATIO', severity: 'warning', box: box.label, path: box.path,
            message: `${box.label} sets its width (${style.$sources['inline-size'].specified ?? style['inline-size']}) but not its height: an iframe has no aspect ratio of its own, so it stays 150px tall at every width and the embedded page (a video, a map) is cut or letterboxed. Add aspect-ratio (e.g. 16 / 9) or a height`, ...ranges(region) });
        if (style.$containerCollapse && !layoutWarnings.some(w => w.code === 'W_LAYOUT_CONTAINER_COLLAPSE' && w.path === box.path))
          layoutWarnings.push({ code: 'W_LAYOUT_CONTAINER_COLLAPSE', severity: 'warning', box: box.label, path: box.path,
            message: `${box.label} is position: absolute and container-type: ${style['container-type']} with no width: an absolute box shrinks to fit its content, which size containment ignores, so it is only as wide as its padding and border and its content overflows. Give it a width (or both left and right)`, ...ranges(region) });
        // container-type: inline-size on a flex item sized by its content (auto width and basis, not growing): the
        // containment drops the content's size, so it collapses to its padding and border.
        if (inFlow && ['flex', 'inline-flex'].includes(parentDisplay) && !String(parents.at(-1).style['flex-direction']).startsWith('column') && ['inline-size', 'size'].includes(style['container-type'])
          && style['inline-size'] === 'auto' && ['auto', 'content'].includes(String(style['flex-basis'])) && String(style['flex-grow']) === '0' && !layoutWarnings.some(w => w.code === 'W_LAYOUT_CONTAINER_COLLAPSE' && w.path === box.path))
          layoutWarnings.push({ code: 'W_LAYOUT_CONTAINER_COLLAPSE', severity: 'warning', box: box.label, path: box.path,
            message: `${box.label} is container-type: ${style['container-type']} with no width in a flex row: size containment ignores its content, so it is only as wide as its padding and border and its content overflows. Give it a width (or flex: 1, or a flex-basis)`, ...ranges(region) });
        // align-content distributes flex lines: a single-line (nowrap) flex container has one line and nothing to distribute.
        if (['flex', 'inline-flex'].includes(style.display) && style['flex-wrap'] === 'nowrap' && set('align-content', 'normal')) reasons.push(['align-content', 'it is a single-line flex container (flex-wrap: nowrap), so there are no lines to distribute (use align-items)']);
        // object-fit sizes the content of a replaced element (img, video, canvas, …); other boxes have none.
        if (set('object-fit', 'fill') && !['img', 'video', 'canvas', 'iframe', 'embed', 'object', 'svg', 'input'].includes(box.tag)) reasons.push(['object-fit', `a <${box.tag}> is not a replaced element (put it on the img or video)`]);
        // An img sized on one axis by its own ratio (aspect-ratio auto, or auto w/h from its attributes: the loaded
        // file's ratio wins) with no min/max size on that axis has the image's shape: object-fit has nothing to fit.
        const ownRatio = /^auto(?:\s|$)/.test(String(style['aspect-ratio'] ?? 'auto'));
        const follows = axis => style[`${axis}-size`] === 'auto' && ['auto', '0', '0px'].includes(String(style[`min-${axis}-size`])) && style[`max-${axis}-size`] === 'none';
        if (set('object-fit', 'fill') && box.tag === 'img' && ownRatio && (follows('block') || follows('inline'))) reasons.push(['object-fit', `its ${follows('block') ? 'height' : 'width'} follows the image's own ratio, so the image already fills its box exactly (object-fit needs a box of another shape: a fixed width and height, or aspect-ratio)`]);
        // order reorders grid and flex items; children in block flow keep the source order.
        if (inFlow && parentDisplay === 'block' && set('order', '0')) reasons.push(['order', `its parent ${parents.at(-1).box.label} is display: block, not grid or flex, so the boxes keep the source order`]);
        // table-layout chooses the column algorithm of a table box.
        if (set('table-layout', 'auto') && box.tag !== 'table' && !['table', 'inline-table'].includes(style.display)) reasons.push(['table-layout', `it is display: ${style.$blockFlow ? 'block' : style.display}, not table`]);
        // list-style-type draws the marker of a list item; it is inherited, so on a list it styles the items. A box that
        // is not a list item and has no descendants has no marker to style.
        const ownSource = key => { const a = style.$sources?.[key], b = parents.at(-1)?.style.$sources?.[key]; return a && !(b && a.file === b.file && a.line === b.line && a.selector === b.selector); };
        if (set('list-style-type', 'disc') && ownSource('list-style-type') && !style.$listItem && style.display !== 'list-item' && !(box.children ?? []).length && !box.inline?.length && !['ul', 'ol', 'menu', 'li', 'summary'].includes(box.tag)) reasons.push(['list-style-type', 'it is not a list item (display: list-item) and has no items in it']);
        // overscroll-behavior and scroll-snap-type act on a scroll container (the root's apply to the viewport).
        const scrolls = ['overflow-x', 'overflow-y'].some(key => !['visible', 'clip'].includes(String(style[key])));
        if (!scrolls && !['html', 'body'].includes(box.tag)) {
          for (const key of ['overscroll-behavior-x', 'overscroll-behavior-y']) if (set(key, 'auto')) reasons.push([key, `it is not a scroll container (overflow ${style['overflow-x']} ${style['overflow-y']})`]);
          if (set('scroll-snap-type', 'none')) reasons.push(['scroll-snap-type', `it is not a scroll container (overflow ${style['overflow-x']} ${style['overflow-y']}); set overflow: auto on it, or put the snap type on the box that scrolls`]);
        }
        // content: a string on an element (not ::before or ::after) generates nothing (measured: Chromium shows the
        // element's own children, and an empty one stays 0px wide); only url() replaces an element, which is not modeled.
        if (!box.pseudo && style.$sources?.content && !['none', undefined].includes(style.content)) reasons.push(['content', 'a string in content is drawn only in ::before and ::after; on the element itself it shows nothing; put it on ::before or ::after']);
        // A table cell has no margins (CSS 2.2 §17.5: they do not apply to table cells; measured).
        if (box.tableCell) for (const side of ['top', 'right', 'bottom', 'left']) if (style.$sources?.[`margin-${side}`] && !['0', '0px', 'auto'].includes(String(style[`margin-${side}`]))) reasons.push([`margin-${side}`, 'it is a table cell, which has no margins; space cells with border-spacing on the table, or pad the cell']);
        // scroll-padding insets the snapport of a scroll container; the viewport takes the root's, not body's (measured:
        // body { scroll-padding-top } does not move where scrollIntoView or a #fragment lands; html's does).
        if (!scrolls && box.tag !== 'html') for (const side of ['top', 'right', 'bottom', 'left']) {
          const key = `scroll-padding-${side}`;
          if (style.$sources?.[key] && !['auto', '0', '0px'].includes(String(style[key]))) reasons.push([key, box.tag === 'body' ? 'the viewport takes its scroll-padding from html, not body; set it on html' : `it is not a scroll container (overflow ${style['overflow-x']} ${style['overflow-y']}); set it on the box that scrolls, or on html for the page`]);
        }
        // scroll-snap-align snaps the box in its snap container, the nearest scrolling ancestor (the viewport, whose
        // snap type is the root's, when none scrolls): with scroll-snap-type none there it never snaps.
        if (set('scroll-snap-align', 'none')) {
          const scroller = [...parents].reverse().find(p => p.box.tag === 'html' || ['overflow-x', 'overflow-y'].some(key => !['visible', 'clip'].includes(String(p.style[key]))));
          if (scroller && String(scroller.style['scroll-snap-type'] ?? 'none') === 'none') reasons.push(['scroll-snap-align', `its scroll container ${scroller.box.tag === 'html' ? '(the viewport)' : scroller.box.label} has no scroll-snap-type, so it never snaps; set scroll-snap-type on ${scroller.box.tag === 'html' ? 'html' : 'it'}`]);
        }
        if (set('resize', 'none')) reasons.push(['resize', `its overflow is ${style['overflow-x']} ${style['overflow-y']}, and only a box whose overflow is not visible can be resized; set overflow: auto on it`]);
        if (set('line-clamp', 'none') && style.$lineClamp === undefined && !['-webkit-box', '-webkit-inline-box'].includes(style.display)) reasons.push(['line-clamp', `it is display: ${style.display}, not -webkit-box`]);
        if (reasons.length) layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: reasons.map(r => r[0]),
          css: reasons.map(([key]) => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
          message: `${box.label}: ${reasons.map(([key, why]) => `${key}: ${style.$inertMain?.property === key ? style.$inertMain.value : (style.$blockFlow && /gap$/.test(key)) || (reasons.find(r => r[0] === key)?.[1] === 'it is display: block, not flex or grid') ? style.$sources[key].specified : key === 'content' ? (String(style.content).startsWith('text:') ? JSON.stringify(String(style.content).slice(5)) : '""') : String(style[key]).replace(/^area:/, '')} has no effect (${why})`).join('; ')}`, ...ranges(region) });
      }
      geometry.push({ box, path: box.path, region, origin: underClip ? null : ownOrigin, ...(style.$listItem && style['list-style-type'] !== 'none' && style['list-style-position'] !== 'inside' && style.direction !== 'rtl' ? { outsideMarker: style['list-style-type'] } : {}), ...(style.display === 'grid' && /^(?:\s*(?:repeat\(\s*\d+\s*,\s*\d+(?:\.\d+)?px\s*\)|\d+(?:\.\d+)?px))+\s*$/.test(String(style['grid-template-columns'])) ? { fixedTracks: style['grid-template-columns'] } : {}), ...((box.text || box.inline?.length) && !box.pseudo && ['normal', 'pre-wrap', 'pre-line'].includes(style['white-space']) && style['overflow-wrap'] === 'normal' ? { wrapsByWords: true } : {}), ...(style.$widthFromAttribute ? { widthFromAttribute: style.$widthFromAttribute } : {}), ...(/\dvw\b|\bvw\)/.test(String(style.$sources?.['inline-size']?.specified ?? '')) ? { vwInline: style.$sources['inline-size'].specified } : {}), ...(/^100%$/.test(String(style.$sources?.['inline-size']?.specified ?? '').trim()) && ['left', 'right'].some(side => /^\d+(?:\.\d+)?px$/.test(String(style[`margin-${side}`])) && cmp(px(style[`margin-${side}`]), zero) > 0) ? { fullWidthMargins: ['left', 'right'].map(side => `margin-${side}`).filter(key => /^\d+(?:\.\d+)?px$/.test(String(style[key])) && cmp(px(style[key]), zero) > 0).map(key => `${key}: ${style[key]}`) } : {}), ...(style['box-sizing'] === 'content-box' && /^100%$/.test(String(style.$sources?.['inline-size']?.specified ?? '').trim()) && ['left', 'right'].some(side => cmp(px(style[`padding-${side}`] === 'ua' ? '0' : style[`padding-${side}`]), zero) > 0 || cmp(px(style[`border-${side}`] === 'ua' ? '0' : style[`border-${side}`]), zero) > 0) ? { contentBoxFull: ['left', 'right'].flatMap(side => [`padding-${side}`, `border-${side}`]).filter(key => style[key] && !['0', '0px', 'ua'].includes(String(style[key]))) } : {}), ...(style.$imageRatio ? { imageRatio: style.$imageRatio } : {}), clipOrigin: ownOrigin, ...(style.position === 'absolute' ? { containingPath: available.containingBlock?.path } : {}), ...(style.$fixed ? { fixed: true } : {}), ...(style.$uaControl ? { uaControl: true } : {}), ...(style.$sticky ? { sticky: { parent: parents.at(-1)?.box.path ?? null } } : {}), inline: painted.inline, block: painted.block, position: style.position,
        borders: Object.fromEntries(['left','right','top','bottom'].map(side => [side, px(style[`border-${side}`])])),
        // Content aligned towards the end (center, end): overflowing content may lie before the start edge.
        ...(['justify-content', 'align-content', 'align-items'].some(key => /^(?:center|end|flex-end|unsafe\b)/.test(String(style[key] ?? ''))) ? { alignsContent: true } : {}),
        ...(/^(?:0|\d+(?:\.\d+)?px)$/.test(String(style['padding-bottom'])) ? { paddingBlockEnd: px(String(style['padding-bottom']) === '0' ? '0px' : style['padding-bottom']) } : {}),
        ...(/^(?:0|\d+(?:\.\d+)?px)$/.test(String(style['padding-right'])) ? { paddingInlineEnd: px(String(style['padding-right']) === '0' ? '0px' : style['padding-right']) } : {}),
        // overflow: clip clips without scrolling (hidden still scrolls a focused descendant into view).
        clipAxes: { inline: style['overflow-x'] === 'clip', block: style['overflow-y'] === 'clip' },
        overflow: ['hidden','clip'].includes(overflowValue) ? 'clip' : ['auto','scroll'].includes(overflowValue) ? 'scroll' : 'visible', overflowValue,
        // Where a single line of text starts inside the box (font-derived text extents).
        content: { left: add(px(style['border-left']), px(style['padding-left'])), top: add(px(style['border-top']), px(style['padding-top'])), inline: contentInline },
        textAlign: style['text-align'], lineHeight: style['line-height'], direction: style.direction, overflowX: style['overflow-x'], painted: paints(style),
        // z-index applies to positioned boxes and to grid/flex items.
        zIndex: style['z-index'] !== 'auto' && (style.position !== 'static' || ['grid', 'flex'].includes(parents.at(-1)?.style.display)) ? Number(style['z-index']) : null,
        paint: paintFacts(style), chain: [...ancestorPaint, ...parents.map((parent, i) => captionBackdrop(parent, parents[i + 1]?.box ?? box, paintFacts(parent.style))), paintFacts(style)],
        contentBlockSize: contentBlock ?? null, fontSize: style['font-size'],
        // The focused paint (paint-only :focus/:focus-visible/:focus-within rules) of focusable boxes.
        ...(focusableBox(box) || box.tag === 'a' ? { hoverStates: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, hoverState).map(s => ({ region: s.region, paint: paintFacts(s.style) })) } : {}),
        ...(style['animation-name'] !== 'none' ? { reducedMotion: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, new Set(['prefers-reduced-motion:reduce'])).map(s => ({ region: s.region, paint: paintFacts(s.style) })) } : {}),
        // Both checked states of a checkbox/radio (paint-only :checked rules), for the checked-indicator rule.
        // A ::before/::after generated in a state is described by its content and paint (`marks`); one that is not
        // absolutely positioned would move the layout (`markUnknown`).
        ...(box.tag === 'input' && ['checkbox', 'radio'].includes(box.inputType) ? { checkedStates: ['checked', 'unchecked'].map(name => styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, new Set([name])).flatMap(s => {
          const owner = [...parents.map(p => ({ ...p, names: p.names ?? [] })), { box, style: s.style, names: [] }];
          let pieces = [{ region: s.region, marks: [], markUnknown: false }];
          for (const kind of ['before', 'after']) pieces = pieces.flatMap(piece => styles({ ...box, pseudo: kind }, piece.region, owner, s.style, false, false, new Set([name])).map(m => {
            const generated = !['none', 'normal'].includes(String(m.style.content ?? 'none')) && m.style.display !== 'none';
            return { region: m.region, marks: generated ? [...piece.marks, JSON.stringify([kind, m.style.content, m.style['background-color'], m.style.color, m.style.visibility, m.style.opacity])] : piece.marks, markUnknown: piece.markUnknown || (generated && m.style.position !== 'absolute') };
          }));
          return pieces.map(piece => ({ region: piece.region, paint: paintFacts(s.style), marks: piece.marks.join('|'), markUnknown: piece.markUnknown }));
        })) } : {}),
        // The placeholder text's paint (::placeholder rules; Chromium's UA color is rgb(117, 117, 117), measured).
        ...(box.placeholder && ['input', 'textarea'].includes(box.tag) ? { placeholderPaint: styles({ ...box, pseudo: 'placeholder' }, region, [...parents, { box, style, names: [] }], style, false, false, new Set(['::placeholder'])).map(s => ({ region: s.region, color: s.style.$sources.color ? s.style.color : '#757575', opacity: s.style.opacity })) } : {}),
        ...(focusableBox(box) ? { focusStates: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, focusState).map(s => ({ region: s.region, paint: paintFacts(s.style), authorOutline: Boolean(s.style.$sources['outline-style']), ...focusMove(box, style, s.style, available, inline, blockSize, parents), ...(s.style['z-index'] !== style['z-index'] ? { zIndex: s.style['z-index'] !== 'auto' && (style.position !== 'static' || ['grid', 'flex'].includes(parents.at(-1)?.style.display)) ? Number(s.style['z-index']) : null } : {}) })) } : {}) });
      if (box.inline?.length) inlineContent(box, style, region, [...parents, { box, style }], geometry.at(-1).chain, geometry.at(-1));
      const shown = scaled(style, parents.some(p => p.clipScope) ? null : origin, inline, blockSize);
      const rect=shown.origin && shown.block ? {inlineStart:affine(shown.origin.inline),blockStart:affine(shown.origin.block),inlineSize:affine(shown.inline),blockSize:affine(shown.block)} : null;
      const sizeRow = { box: box.label, path: box.path, position:style.position, ...positioned,...(rect ? {rect} : {}), boxSizing: style['box-sizing'], boxSizingSource: style.$sources['box-sizing'],
        paddingInlineSize:affine(diff(inline,scalar(add(px(style['border-left']),px(style['border-right']))))),
        ...(blockSize ? {paddingBlockSize:affine(diff(blockSize,scalar(add(px(style['border-top']),px(style['border-bottom'])))))} : {}),
        // Explicit absolute sizing determines its public allocation independently
        // from child requirements. The enclosing padding box stays separate.
        allocatedInlineSize:affine(style.position==='absolute' ? inline : available.inline),
        ...(available.block ? {allocatedBlockSize:affine(style.position==='absolute' ? blockSize : available.block)} : {}),
        inlineSize:affine(inline),contentInlineSize:affine(contentInline),
        ...(blockSize ? {blockSize:affine(blockSize)} : {}),...(contentBlock ? {contentBlockSize:affine(contentBlock)} : {}),...ranges(region) };
      Object.defineProperty(sizeRow, '$shown', { value: { region, ...shown }, writable: true, enumerable: false });
      sizes.push(sizeRow);
      // rtl: the container places its children mirrored in its content box (each child's subtree moves; its own
      // interior follows its own direction). Absolute descendants use physical insets, so they are not modeled here.
      if (style.direction === 'rtl' && box.children.length && origin && box.$starts) {
        const L = sum(origin.inline, scalar(add(px(style['border-left']), px(style['padding-left'])))), R = diff(sum(origin.inline, inline), scalar(add(px(style['border-right']), px(style['padding-right']))));
        const childOf = path => path.slice(0, path.lastIndexOf('/')) === box.path;
        const rows = geometry.slice(box.$starts.geometry), sizeRows = sizes.slice(box.$starts.sizes);
        // An absolute child is placed by physical insets: the container does not mirror it.
        for (const child of rows.filter(row => childOf(row.path) && row.position !== 'absolute' && intersectRegions(row.region, region) && (row.origin || row.clipOrigin))) {
          const at = child.origin ?? child.clipOrigin, dx = diff(diff(sum(L, R), times(at.inline, q(2))), child.inline);
          // An absolute box keeps its physical place unless its containing block moves with this child.
          const within = path => path === child.path || isDescendant(child.path, path);
          const stays = rows.filter(row => row.position === 'absolute' && row !== child && isDescendant(child.path, row.path) && !(row.containingPath && within(row.containingPath))).map(row => row.path);
          const moved = row => (row === child || (isDescendant(child.path, row.path) && intersectRegions(row.region, child.region))) && !stays.some(path => row.path === path || isDescendant(path, row.path));
          const shift = o => o ? { inline: sum(o.inline, dx), block: o.block } : o;
          for (const row of rows.filter(row => moved(row) && !row.$mirrored?.has(box.path))) {
            row.origin = shift(row.origin); row.clipOrigin = shift(row.clipOrigin);
            if (row.bounds) row.bounds = row.bounds.map(piece => ({ ...piece, outer: piece.outer && { ...piece.outer, origin: shift(piece.outer.origin) }, inner: piece.inner && { ...piece.inner, origin: shift(piece.inner.origin) } }));
            (row.$mirrored ??= new Set()).add(box.path);
          }
          for (const row of sizeRows.filter(row => row.$shown && (row.path === child.path || isDescendant(child.path, row.path)) && !stays.some(path => row.path === path || isDescendant(path, row.path)) && intersectRegions(row.$shown.region, child.region))) {
            row.$shown = { ...row.$shown, origin: shift(row.$shown.origin) };
            if (row.rect && row.$shown.origin) row.rect = { ...row.rect, inlineStart: affine(row.$shown.origin.inline) };
          }
        }
      }
      // An arbitrary rotation: the box's circumscribed rectangle (an upper bound: |cos|·w/2 + |sin|·h/2 per half
      // extent, rounded up) is what it may cover; its descendants have no position either.
      const turn = /^rotate-any\((-?[\d.]+)\)$/.exec(String(style.transform));
      if (turn && origin && blockSize) {
        const radians = Number(turn[1]) * Math.PI / 180, up = v => q(String(Math.ceil(Math.abs(v) * 1e6 + 1) / 1e6));
        const [c, sn] = [up(Math.cos(radians)), up(Math.sin(radians))], half = div(one, q(2));
        const extentInline = sum(times(inline, mul(c, half)), times(blockSize, mul(sn, half))), extentBlock = sum(times(inline, mul(sn, half)), times(blockSize, mul(c, half)));
        const centre = { inline: sum(origin.inline, times(inline, half)), block: sum(origin.block, times(blockSize, half)) };
        const own = geometry.findLast(row => row.path === box.path && intersectRegions(row.region, region));
        if (own) own.rotatedBounds = { origin: { inline: diff(centre.inline, extentInline), block: diff(centre.block, extentBlock) }, inline: times(extentInline, q(2)), block: times(extentBlock, q(2)) };
        if (box.$starts) for (const row of geometry.slice(box.$starts.geometry).filter(row => isDescendant(box.path, row.path) && intersectRegions(row.region, region))) { row.origin = null; row.clipOrigin = null; row.rotatedBy = box.path; }
      }
      // A scale maps the painted descendants too: r ↦ C + s·(r − C) about the box's centre C (affine, s constant).
      const matrix = linearOf(style);
      if (matrix && (box.children.length || box.inline?.length) && origin && blockSize && box.$starts) {
        const half = div(one, q(2));
        const map = mapper(matrix, { inline: sum(origin.inline, times(inline, half)), block: sum(origin.block, times(blockSize, half)) });
        const inside = row => isDescendant(box.path, row.path) && intersectRegions(row.region, region);
        for (const row of geometry.slice(box.$starts.geometry).filter(inside)) {
          Object.assign(row, map(row));
          if (row.bounds) row.bounds = row.bounds.map(piece => ({ ...piece, outer: piece.outer && map(piece.outer), inner: piece.inner && map(piece.inner) }));
        }
        for (const row of sizes.slice(box.$starts.sizes).filter(row => row.$shown && isDescendant(box.path, row.path) && intersectRegions(row.$shown.region, region))) {
          const moved = map(row.$shown);
          row.$shown = { ...row.$shown, ...moved };
          if (row.rect && moved.origin && moved.block) row.rect = { inlineStart: affine(moved.origin.inline), blockStart: affine(moved.origin.block), inlineSize: affine(moved.inline), blockSize: affine(moved.block) };
        }
      }
    }
    if (!box.children.length) {
      if (box.text && contract.minInlineSize === undefined && (contract.overflow ?? 'fit') === 'fit') unknown('U_LAYOUT_INTRINSIC', 'Text needs a minInlineSize bound or an explicit overflow policy', undefined, box);
      if (block && box.text && (contract.overflowBlock ?? 'fit') === 'fit' && !style.$lineClamp) {
        if (contract.intrinsicBlockSize !== undefined) for (const required of intrinsic(box, contentInline, region)) {
          // Wrapped text reports the lines it needs at this width and how many the box holds.
          const needed = contract.textMetrics?.kind === 'lines' ? Math.round(number(evaluate(required.value, { x: zero, y: zero })) / contract.font.lineHeight) : 0;
          const annotate = needed ? offered => ({ text: { lines: needed, fitsLines: fittingLines(contract.font.lineHeight, offered, needed) } }) : undefined;
          if (emit && !visuallyHiddenStyle(style)) (box.tableCell ? cellGrows : obligation)(contentBlock, required.value, box, required.region, 'E_LAYOUT_CONTENT', 'block', true, undefined, annotate);
        }
        else if (contract.minBlockSize === undefined) unknown('U_LAYOUT_INTRINSIC', 'Text needs a block-height contract or an explicit overflowBlock policy', undefined, box);
      }
    }
    return { region, inline, block: blockSize };
  }

  // Root-relative border coordinates. Scroll offsets/gutter placement and shared
  // subgrid line offsets are deliberately outside the first transition profile.
  // A px translate moves the box (and, through its origin, its descendants) after layout.
  const isDescendant = (a, b) => b.startsWith(a + '/');
  const intersectRegions = (a, b) => Boolean(intersect(a, b));
  // A linear transform with one nonzero entry per row (scale, quarter-turn rotation) about the box's centre keeps
  // rectangles axis-aligned: each new axis interval is a scaled (and possibly flipped) old one, so it stays affine.
  const rational = v => { const [n, d = '1'] = v.split('/'); return div(q(n), q(d)); };
  const affineOf = style => { const m = /^affine\((.+)\)$/.exec(style.transform ?? 'none'); return m ? m[1].split(' ').map(rational) : null; };
  function linearOf(style) {
    const m = affineOf(style);
    return m && !(cmp(m[0], one) === 0 && cmp(m[1], zero) === 0 && cmp(m[2], zero) === 0 && cmp(m[3], one) === 0) ? m.slice(0, 4) : null;
  }
  function mapper(matrix, centre) {
    const [a, b, c, d] = matrix;
    const axis = (p, r) => cmp(p, zero) !== 0 ? { coef: p, from: 'inline' } : { coef: r, from: 'block' };
    const rows = [axis(a, b), axis(c, d)];
    return rect => {
      if (!rect?.origin || !rect.block) return rect;
      const rel = { inline: [diff(rect.origin.inline, centre.inline), diff(sum(rect.origin.inline, rect.inline), centre.inline)], block: [diff(rect.origin.block, centre.block), diff(sum(rect.origin.block, rect.block), centre.block)] };
      const size = { inline: rect.inline, block: rect.block };
      const out = rows.map(({ coef, from }) => cmp(coef, zero) > 0 ? { lo: times(rel[from][0], coef), size: times(size[from], coef) } : { lo: times(rel[from][1], coef), size: times(size[from], mul(coef, minusOne)) });
      return { origin: { inline: sum(centre.inline, out[0].lo), block: sum(centre.block, out[1].lo) }, inline: out[0].size, block: out[1].size };
    };
  }
  function scaled(style, origin, inline, blockSize) {
    // An arbitrary rotation leaves no axis-aligned painted box: no position (its circumscribed rectangle is recorded).
    if (String(style.transform).startsWith('rotate-any(')) return { origin: null, inline, block: blockSize };
    const matrix = linearOf(style);
    if (!matrix || !origin || !blockSize) return { origin: matrix ? null : origin, inline, block: blockSize };
    const half = div(one, q(2)), centre = { inline: sum(origin.inline, times(inline, half)), block: sum(origin.block, times(blockSize, half)) };
    return mapper(matrix, centre)({ origin, inline, block: blockSize });
  }
  function translated(style, origin, size) {
    const m = affineOf(style);
    if (!origin || !m) return origin;
    // Percentages scale with the box's own size: t0 + W·u + H·v.
    const needsH = cmp(m[8], zero) !== 0 || cmp(m[9], zero) !== 0;
    if (needsH && !size?.block) return null;
    // em: the element's font-size, which must be a px value.
    const needsEm = cmp(m[10], zero) !== 0 || cmp(m[11], zero) !== 0;
    if (needsEm && !/^\d+(?:\.\d{1,6})?px$/.test(style['font-size'])) throw Object.assign(new Error(`An em translation needs a px font-size (got ${style['font-size']})`), { code: 'U_LAYOUT_CSS' });
    const em = needsEm ? px(style['font-size']) : zero;
    // rem: the root element's font-size, known only when the analysed root is html with a px font-size.
    const needsRem = cmp(m[12], zero) !== 0 || cmp(m[13], zero) !== 0;
    if (needsRem && !rootFontSize) throw Object.assign(new Error('A rem translation needs the html root with a px font-size in the analysed tree'), { code: 'U_LAYOUT_CSS' });
    const rem = needsRem ? rootFontSize : zero;
    const along = k => sum(sum(sum(scalar(m[4 + k]), times(size.inline, m[6 + k])), needsH ? times(size.block, m[8 + k]) : scalar(zero)), scalar(add(mul(em, m[10 + k]), mul(rem, m[12 + k]))));
    return offset(origin, along(0), along(1));
  }
  function resolvedOrigin(style,available,inline,blockSize,parents) {
    return translated(style, untranslatedOrigin(style,available,inline,blockSize,parents), { inline, block: blockSize });
  }
  function untranslatedOrigin(style,available,inline,blockSize,parents) {
    // overflow: clip never scrolls, so positions inside it stay exact; hidden/auto/scroll may be scrolled.
    // (The document root's overflow is the viewport's: its scrolling is the page scroll, already modeled; at scroll 0
    // positions inside it are exact.)
    // scroll-zero (an internal re-analysis): positions inside scroll containers at their initial scroll offset 0, exact
    // there; only the cover findings at that offset are taken from it.
    const scrollZero = preferences.includes('scroll-zero');
    if(!block || parents.some(p=>(p.clipped && !scrollZero) || p.subgrid) || (!scrollZero && !available.root && ['overflow-x','overflow-y'].some(key=>!['visible','clip'].includes(style[key]))) ||
      ['grid-template-columns','grid-template-rows'].some(key=>style[key]==='subgrid')) return null;
    if(style.position!=='absolute') {
      // Cross-axis alignment of a flex item that is not stretched.
      let origin = available.origin ?? null;
      if (origin && available.alignBlock !== undefined) origin = blockSize ? { inline: origin.inline, block: sum(origin.block, times(diff(available.block, blockSize), available.alignBlock)) } : null;
      if (origin && available.alignInline !== undefined) origin = { inline: sum(origin.inline, times(diff(available.inline, inline), available.alignInline)), block: origin.block };
      return origin;
    }
    const containing=available.containingBlock;
    if(!containing?.origin || !blockSize) return null;
    const local=absoluteOrigin(style,containing,{inline,block:blockSize});
    return offset(containing.origin,local.inline,local.block);
  }

  function subgridGeometry(style, box, available, region, emit) {
    const axes = {};
    let geometryRegions = [region];
    for (const [axis, property, sides, gapProperty] of [
      ['inline', 'grid-template-columns', ['left', 'right'], 'column-gap'],
      ['block', 'grid-template-rows', ['top', 'bottom'], 'row-gap'],
    ]) {
      if (style.display !== 'grid' || !/^subgrid\b/.test(style[property])) continue;
      if (style[property] !== 'subgrid') throw subgridError('Subgrid line names and repeat syntax are not modeled', box, region, axis);
      if (style['container-type'] !== 'normal') throw subgridError('Subgrid size-query containment differs across target browsers; put the size query container on a parent', box, region, axis);
      const parent = available.tracks?.[axis];
      if (!parent) throw subgridError('Subgrid requires resolved parent tracks; external parents and intrinsic row contributions are not modeled', box, region, axis);
      if (style[`${axis}-size`] !== 'auto') throw subgridError('Checked subgrids require auto size in their shared axis', box, region, axis);
      if (style[`min-${axis}-size`] !== 'auto' && cmp(px(style[`min-${axis}-size`]), zero) !== 0) throw subgridError('Minimum size on a shared subgrid axis is outside the checked subset', box, region, axis);
      const insets = sides.map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`])));
      const gap = gapSize(style[gapProperty], parent), values = inheritTracks(parent, gap, ...insets);
      axes[axis] = { ...parent, gap, values, insets };
      for (const value of values) geometryRegions = bounded(geometryRegions.flatMap(region => {
        const parts = partition(region, value, '>=');
        for (const failed of parts.no) diagnostics.push({ code: 'U_LAYOUT_SUBGRID', severity: 'unknown', message: 'Subgrid gap/insets produce a negative effective track; CSS collapse is not modeled', box: box.label, path: box.path, source: box.source, axis, ...ranges(failed) });
        return parts.yes;
      }));
    }
    if (emit) for (const geometryRegion of geometryRegions) for (const [axis, inheritedAxis] of Object.entries(axes)) subgrids.push({ box: box.label, path: box.path, axis,
      parent: inheritedAxis.box.label, parentPath: inheritedAxis.box.path, startLine: inheritedAxis.startLine, span: inheritedAxis.values.length,
      gap: exact(inheritedAxis.gap), insets: inheritedAxis.insets.map(exact), tracks: inheritedAxis.values.map(affine), ...ranges(geometryRegion) });
    return { axes, regions: geometryRegions };
  }

  // Fixed table layout (CSS 2.2 §17.5.2.1) as a grid, measured equal in Chromium: column widths
  // from the first row (px widths share the width in proportion, auto columns take the rest),
  // border-spacing as gaps and as an inset inside the padding, rows as tall as their tallest cell.
  function tableAsGrid(table, style, region, parents, emit, available, probe) {
    const fail = message => { throw Object.assign(new Error(message), { code: 'U_LAYOUT_TABLE' }); };
    // Table layout is modeled as Chromium lays tables out (measured); Firefox and WebKit share rowspan heights and
    // automatic column widths differently, and WebKit sizes fixed tables differently (docs/css-baseline.md).
    if (uaEngine && uaEngine !== 'chromium') throw Object.assign(new Error(`${table.label}: table layout is modeled as Chromium lays tables out; ${uaEngine} shares rowspan heights and column widths differently`), { code: 'U_LAYOUT_BROWSER' });
    // Automatic layout equals the fixed one (measured) when content cannot widen a column: every cell
    // is empty or its content's min-content bound fits its px column, no spans or caption, and
    // at most one (empty) auto column, which needs an explicit table width; an auto width is the sum.
    const automatic = style['table-layout'] !== 'fixed';
    // The collapsing border model (CSS 2.2 §17.6.2) without any border is the separated model with no spacing: borders
    // of 0 collapse to 0, border-spacing does not apply, and the table has no padding (measured equal in Chromium).
    // With a border on the table, a row group, a row or a cell, the shared borders are not modeled.
    if (style['border-collapse'] === 'collapse') {
      const zero = v => ['0', '0px', 'none'].includes(String(v));
      const sides = ['top', 'right', 'bottom', 'left'];
      if (!sides.every(side => zero(style[`border-${side}`]))) fail('border-collapse: collapse with a border on the table is not modeled (shared borders)');
      if (!sides.every(side => zero(style[`padding-${side}`]))) fail('border-collapse: collapse with padding on the table is not modeled (the browser ignores it)');
      const parts = (table.children ?? []).flatMap(section => [section, ...(section.children ?? []).flatMap(row => [row, ...(row.children ?? [])])]).filter(part => part.tag !== 'caption');
      for (const part of parts) for (const st of styles(part, region, parents, style, false, false)) if (!sides.every(side => zero(st.style[`border-${side}`]))) fail(`border-collapse: collapse with a border on ${part.label} is not modeled (shared borders)`);
      style = { ...style, 'border-spacing': '0' };
    }
    else if (style['border-collapse'] !== 'separate') fail(`border-collapse: ${style['border-collapse']} is not modeled`);
    if (style['inline-size'] === 'auto' && !automatic) fail('A fixed table needs an explicit inline-size');
    const caption = table.children?.[0]?.tag === 'caption' ? table.children[0] : null;
    const sections = (table.children ?? []).slice(caption ? 1 : 0);
    if (sections.some(section => !['thead', 'tbody', 'tfoot'].includes(section.tag))) fail('A modeled table holds an optional first caption, then thead, tbody and tfoot (no colgroup)');
    if (sections.findIndex(s => s.tag === 'tfoot') >= 0 && sections.findIndex(s => s.tag === 'tfoot') !== sections.length - 1) fail('tfoot must come last (it renders after the bodies)');
    const rows = sections.flatMap(section => section.children ?? []);
    if (!rows.length || rows.some(row => row.tag !== 'tr' || !(row.children ?? []).length || row.children.some(cell => !['td', 'th'].includes(cell.tag)))) fail('Every row is a tr of td/th cells');
    const spanOf = cell => { if (cell.colSpan === 'dynamic' || cell.rowSpan === 'dynamic') fail('A dynamic colspan/rowspan decides the cells'); return cell.colSpan ?? 1; };
    const columns = rows[0].children.map(spanOf).reduce((a, b) => a + b, 0);
    // Occupancy: a rowspan cell takes its columns in the following rows of its row group.
    const taken = new Map();
    for (const section of sections) {
      const groupRows = section.children ?? [];
      groupRows.forEach((row, r) => {
        let column = 0;
        const busy = c => taken.get(`${row.path}:${c}`);
        for (const cell of row.children) {
          while (busy(column)) column++;
          const n = spanOf(cell), down = cell.rowSpan ?? 1;
          if (r + down > groupRows.length) fail('A rowspan past the end of its row group is not modeled');
          for (let k = 0; k < down; k++) for (let c = column; c < column + n; c++) taken.set(`${groupRows[r + k].path}:${c}`, true);
          if (down > 1) cell.tableRowSpan = down;
          cell.tableAt = { column, row: rows.indexOf(row), span: n, down };
          column += n;
        }
      });
    }
    if (rows.some(row => Array.from({ length: columns + 1 }, (_, c) => taken.get(`${row.path}:${c}`)).filter(Boolean).length !== columns)) fail('Every row needs the same number of columns (cells, colspan and rowspan)');
    // A td/th restyled away from table-cell is wrapped in an anonymous cell (its spans no longer apply), and a
    // display: none cell removes its column: neither is the modeled grid.
    for (const row of rows) for (const cell of row.children) for (const cs of styles(cell, region, parents, style, false, false))
      if (cs.style.display !== 'table-cell') fail(`${cell.label} has display: ${cs.style.display}; a modeled table needs its cells as table-cell`);
    // A cell with block-level children lays them out in block flow: with zero margins that is one start-aligned
    // column (a 1-column grid with align-content: start). The cell's vertical-align must not move it: top, or the
    // cell decides its row's height (the row's other cells are empty with an auto height, no rowspan in the table).
    const spanning = rows.some(row => row.children.some(cell => (cell.rowSpan ?? 1) > 1));
    for (const [r, row] of rows.entries()) for (const cell of row.children.filter(cell => (cell.children ?? []).length)) {
      const rowStyle = one(styles(row, region, parents, one(styles(sections.find(sec => sec.children.includes(row)), region, parents, style, false, false)), false, false));
      const cs = one(styles(cell, region, parents, rowStyle, false, false));
      if (cell.text) fail(`${cell.label} mixes text and child elements (inline formatting is not modeled)`);
      const alone = !spanning && row.children.every(other => other === cell || (!other.text && !other.contract && !(other.children ?? []).length && one(styles(other, region, parents, rowStyle, false, false))['block-size'] === 'auto'));
      // baseline: a cell without line boxes takes its content bottom as baseline, and the row's baseline cells are
      // bottom-aligned at the row's top (measured; empty cells take no part): the only non-empty one sits at the top.
      const soleBaseline = cs['vertical-align'] === 'baseline' && !spanning && row.children.every(other => other === cell || (!other.text && !other.contract && !(other.children ?? []).length) || one(styles(other, region, parents, rowStyle, false, false))['vertical-align'] !== 'baseline');
      if (soleBaseline) cell.tableBaselineTop = true;
      else if (cs['vertical-align'] === 'baseline' && !spanning) cell.tableBaselineGroup = { row: r, style: cs };
      else if (!['top', 'middle', 'bottom'].includes(cs['vertical-align']) && !(alone && cs['block-size'] === 'auto')) fail(`${cell.label} has vertical-align: ${cs['vertical-align']} with other baseline cells in its row; baseline alignment across cells is not modeled`);
      for (const child of cell.children) for (const c of styles(child, region, parents, cs, false, false)) {
        if (c.style.display === 'none') continue;
        if (!['block', 'grid', 'flex'].includes(c.style.display) || c.style.position !== 'static' || c.style.float !== 'none') fail(`${child.label} in a table cell must be a static block-level box (block flow of inline content is not modeled)`);
      }
      cell.tableFlow = true;
    }
    // Several baseline cells with content: each baseline is padding-top + content height (no line boxes); with px
    // children the heights are constants, and each cell moves down by (largest baseline − its own).
    const contentHeight = cell => (cell.children ?? []).map(child => {
      const cs = one(styles(child, region, parents, cell.tableBaselineGroup.style, false, false));
      if (cs.display === 'none') return zero;
      if (!/^\d+(?:\.\d+)?px$/.test(cs['block-size'])) fail(`${child.label}: baseline-aligned cells are modeled when their children have px heights`);
      const edges = ['top', 'bottom'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
      return cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size']);
    }).reduce(add, zero);
    // Text cells: the first line's baseline is floor((L − (A + D)) / 2) + A with Chromium's rounded ascent A and
    // descent D (measured); an odd negative leading rounds ambiguously, so it is Unknown.
    for (const row of rows) {
      const rowStyle = one(styles(row, region, parents, one(styles(sections.find(sec => sec.children.includes(row)), region, parents, style, false, false)), false, false));
      for (const cell of row.children.filter(cell => cell.text && !(cell.children ?? []).length && !cell.tableRowSpan)) {
        const cs = one(styles(cell, region, parents, rowStyle, false, false));
        if (cs['vertical-align'] !== 'baseline') continue;
        const metrics = cell.contract?.textMetrics, L = cell.contract?.font?.lineHeight;
        if (spanning || !metrics?.baseline || !L) fail(`${cell.label}: a baseline-aligned text cell needs font-derived text metrics (its first baseline)`);
        const leading = L - metrics.baseline.ascent - metrics.baseline.descent;
        if (leading < 0 && leading % 2) fail(`${cell.label}: an odd negative leading rounds the baseline ambiguously`);
        cell.tableBaselineGroup = { row: rows.indexOf(row), style: cs, text: q(String(Math.floor(leading / 2) + metrics.baseline.ascent)) };
      }
    }
    for (const [r, row] of rows.entries()) {
      const group = row.children.filter(cell => cell.tableBaselineGroup);
      if (!group.length) continue;
      const baselines = group.map(cell => add(px(cell.tableBaselineGroup.style['padding-top']), cell.tableBaselineGroup.text ? cell.tableBaselineGroup.text : contentHeight(cell)));
      const top = baselines.reduce((a, b) => cmp(a, b) >= 0 ? a : b);
      group.forEach((cell, i) => {
        cell.tableBaselineShift = sub(top, baselines[i]);
        // A moved cell with a fixed height could need a taller row (the table grows it, the grid would not): Unknown.
        if (cmp(cell.tableBaselineShift, zero) > 0 && cell.tableBaselineGroup.style['block-size'] !== 'auto') fail(`${cell.label}: a baseline-shifted cell with a fixed block-size is not modeled`);
      });
    }
    for (const box of [...sections, ...rows]) box.tablePart = true;
    // min/max sizes on a table cell have no defined effect (CSS 2.2 §17.5.2; measured: Chromium ignores td
    // { min-height: 50px } and td { max-width: 50px }), and a table's min/max height is spread over its rows (measured:
    // .t { min-height: 100px } makes 20px cells 100px). Neither is modeled.
    const sizeBound = (st, keys) => keys.find(key => st.$sources?.[key] && !['auto', 'none', '0', '0px'].includes(String(st[key])));
    const tableBound = sizeBound(style, ['min-block-size', 'max-block-size']);
    if (tableBound) fail(`${table.label}: ${tableBound} on a table spreads over its rows, which is not modeled; size the cells instead`);
    for (const row of rows) for (const rs of styles(row, region, parents, style, false, false)) for (const cell of row.children) for (const c of styles(cell, rs.region, parents, rs.style, false, false)) {
      const key = sizeBound(c.style, ['min-block-size', 'max-block-size', 'min-inline-size', 'max-inline-size']);
      if (key) fail(`${cell.label}: ${key} on a table cell has no defined effect (Chromium ignores it), which is not modeled; give the cell a block-size or inline-size`);
    }
    // A row's or row group's height sets the rows' height (CSS 2.2 §17.5.3; measured: tr { height: 50px } makes 20px cells
    // a 50px row; its width does not change the columns, reported as inert below),
    // and its background paints under the cells; neither is modeled (rows lay out as display: contents).
    for (const part of [...sections, ...rows]) for (const ps of styles(part, region, parents, style, false, false)) {
      const sized = ['block-size', 'min-block-size', 'max-block-size'].find(key => ps.style.$sources?.[key] && !['auto', 'none', '0', '0px'].includes(String(ps.style[key])));
      if (sized) fail(`${part.label}: ${sized} on a table ${rows.includes(part) ? 'row' : 'row group'} sets the rows' height, which is not modeled; size the cells instead`);
      if (ps.style.$sources?.['background-color'] && !['transparent', 'rgba(0, 0, 0, 0)'].includes(String(ps.style['background-color'])) || (ps.style.$sources?.['background-image'] && ps.style['background-image'] !== 'none')) fail(`${part.label}: a table ${rows.includes(part) ? 'row' : 'row group'} background paints under its cells, which is not modeled; set the background on the cells`);
    }
    for (const row of rows) for (const cell of row.children) cell.tableCell = true;
    // Cells stretch to their row: a fixed block-size must be shared by the row's cells (a grid item would not stretch).
    for (const row of rows) {
      const rs = styles(row, region, parents, style, false, false);
      const heights = new Set(row.children.filter(cell => !cell.tableRowSpan).map(cell => rs.flatMap(r => styles(cell, r.region, parents, r.style, false, false)).map(c => c.style['block-size']).join('|')));
      // With rowspan the rows become explicit tracks (the tallest cell) and cells stretch; otherwise a grid item would not.
      if (heights.size > 1 && !rows.some(row => row.children.some(cell => cell.tableRowSpan))) fail('Cells of one row with different block-size values are not modeled (table cells stretch to the row)');
    }
    const [h, v = h] = String(style['border-spacing']).split(/\s+/).map(part => px(part));
    // A rowspan cell is stretched over its rows; it must not size them (Chromium and grid distribute differently).
    for (const row of rows) for (const cell of row.children.filter(cell => cell.tableRowSpan)) {
      const block = new Set(styles(cell, region, parents, style, false, false).map(c => c.style['block-size']));
      const empty = !cell.text && !cell.contract && !(cell.children ?? []).length;
      // An auto-height text cell whose height profile is known at its (constant) width counts as that height.
      const measured = cell.text && !(cell.children ?? []).length && cell.contract?.intrinsicBlockSize !== undefined;
      // Children that are blocks of a px block-size stack: the cell's content height is their sum. A child's own
      // content (text or children) does not change its px height; its overflow is that child's layout to check.
      const stackedHeight = () => {
        // tableAsGrid runs more than once (a probe pass, then the layout): the profiles are recollected each time.
        cell.stackedProfiles = [];
        if (cell.text || cell.contract || !(cell.children ?? []).length) return null;
        // A stack: blocks of a px block-size, measured auto-height text leaves, and auto-height one-column grids
        // (no gaps, implicit rows) that are stacks themselves. `side` is the horizontal edges from the cell inward.
        const stack = (node, nodeStyle, ancestors, side) => {
          let total = zero;
          for (const child of node.children) {
            if (child.tag === 'table' || child.tableCell) return null;
            const cs = one(styles(child, region, ancestors, nodeStyle, false, false));
            if (cs.display === 'none') continue;
            if (cs.position !== 'static' || ['margin-top', 'margin-bottom'].some(key => !['0', '0px'].includes(cs[key]))) return null;
            const edges = ['top', 'bottom'].map(key => add(px(cs[`padding-${key}`]), px(cs[`border-${key}`]))).reduce(add, zero);
            const sideEdges = add(side, ['left', 'right'].map(key => add(px(cs[`padding-${key}`]), px(cs[`border-${key}`]))).reduce(add, zero));
            if (/^\d+(?:\.\d+)?px$/.test(cs['block-size'])) { total = add(total, cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size'])); continue; }
            if (cs['block-size'] !== 'auto') return null;
            if (child.text && !(child.children ?? []).length && child.contract?.intrinsicBlockSize !== undefined) {
              // A line-count profile depends on the cell's width: measured later, with the column widths.
              if (typeof child.contract.intrinsicBlockSize === 'number') total = add(total, add(q(String(child.contract.intrinsicBlockSize)), edges));
              else cell.stackedProfiles.push({ profile: child.contract.intrinsicBlockSize, edges, sideEdges });
              continue;
            }
            // A row flex (nowrap, items stretched): as tall as its tallest item, each a px height or a constant
            // measured text leaf.
            const itemHeight = (item, itemStyle) => {
              const e = ['top', 'bottom'].map(key => add(px(itemStyle[`padding-${key}`]), px(itemStyle[`border-${key}`]))).reduce(add, zero);
              if (/^\d+(?:\.\d+)?px$/.test(itemStyle['block-size']) && !(item.children ?? []).length) return itemStyle['box-sizing'] === 'content-box' ? add(px(itemStyle['block-size']), e) : px(itemStyle['block-size']);
              if (itemStyle['block-size'] === 'auto' && item.text && !(item.children ?? []).length && typeof item.contract?.intrinsicBlockSize === 'number') return add(q(String(item.contract.intrinsicBlockSize)), e);
              return null;
            };
            const items = (child.children ?? []).map(item => ({ item, style: one(styles(item, region, [...ancestors, { box: child, style: cs }], cs, false, false)) })).filter(entry => entry.style.display !== 'none');
            if (cs.display === 'flex' && ['row', 'row-reverse'].includes(cs['flex-direction']) && cs['flex-wrap'] === 'nowrap' && !child.text && !child.contract && items.length) {
              const heights = items.map(({ item, style: itemStyle }) => ['margin-top', 'margin-bottom'].every(key => ['0', '0px'].includes(itemStyle[key])) ? itemHeight(item, itemStyle) : null);
              if (heights.some(h => h === null)) return null;
              total = add(total, add(heights.reduce((a, b) => cmp(a, b) >= 0 ? a : b), edges));
              continue;
            }
            // A grid with px rows only and every item in its declared cells: the rows and gaps are its height.
            if (cs.display === 'grid' && cs['grid-template-rows'] !== 'none' && !child.text && !child.contract) {
              let rowList, columnCount;
              try { rowList = gridTracks(cs['grid-template-rows']); columnCount = cs['grid-template-columns'] === 'none' ? 1 : gridTracks(cs['grid-template-columns']).length; } catch { return null; }
              if (rowList.some(t => t.fixed === undefined) || items.length > rowList.length * columnCount || items.some(({ style: itemStyle }) => itemStyle['grid-row'] !== 'auto' || itemStyle['grid-column'] !== 'auto')) return null;
              const gap = ['0', 'normal'].includes(cs['row-gap']) ? zero : px(cs['row-gap']);
              total = add(total, add(add(rowList.map(t => t.fixed).reduce(add, zero), mul(gap, q(rowList.length - 1))), edges));
              continue;
            }
            // One-column grids (implicit auto rows) and column flexes (nowrap, stretched items) of auto height stack their
            // items too, with a px row gap between them: an auto-height column flex has no free space to grow or shrink.
            const pxGap = ['0', '0px', 'normal'].includes(cs['row-gap']) ? zero : /^\d+(?:\.\d+)?px$/.test(cs['row-gap']) ? px(cs['row-gap']) : null;
            const oneColumn = cs.display === 'grid' && ['none', 'minmax(0,1fr)', '1fr', 'auto'].includes(String(cs['grid-template-columns']).replace(/\s+/g, '')) && cs['grid-template-rows'] === 'none' && ['auto', undefined].includes(cs['grid-auto-rows']) && pxGap !== null;
            const columnFlex = cs.display === 'flex' && cs['flex-direction'] === 'column' && cs['flex-wrap'] === 'nowrap' && ['normal', 'stretch'].includes(cs['align-items']) && pxGap !== null;
            if (child.text || child.contract || !(child.children ?? []).length || !(oneColumn || columnFlex)) return null;
            if (columnFlex && (child.children ?? []).some(item => { const st = one(styles(item, region, [...ancestors, { box: child, style: cs }], cs, false, false)); return !['auto', 'normal', 'stretch'].includes(st['align-self']) || st.order !== '0' || st['flex-basis'] !== 'auto'; })) return null;
            const inner = stack(child, cs, [...ancestors, { box: child, style: cs }], sideEdges);
            if (inner === null) return null;
            const shown = (child.children ?? []).filter(item => one(styles(item, region, [...ancestors, { box: child, style: cs }], cs, false, false)).display !== 'none').length;
            total = add(total, add(add(inner, mul(pxGap, q(Math.max(0, shown - 1)))), edges));
          }
          return total;
        };
        return stack(cell, style, [...parents, { box: cell, style }], zero);
      };
      const stacked = [...block][0] === 'auto' && !empty && !measured ? stackedHeight() : null;
      if (block.size !== 1 || !(([...block][0] === 'auto' && (empty || measured || stacked !== null)) || /^\d+(?:\.\d+)?px$/.test([...block][0]))) fail('A rowspan cell is modeled when it is empty, measured text or a stack of px-height blocks with block-size: auto, or has a px block-size');
      if ([...block][0] === 'auto' && measured) cell.tableMeasuredSpan = true;
      if (stacked !== null) cell.tableStackedSpan = stacked; else delete cell.stackedProfiles;
    }
    // The first row's cell widths decide the columns.
    function one(list) { if (list.length !== 1) fail('Table styles that vary across viewport regions are not modeled'); return list[0].style; }
    const sectionStyle = one(styles(sections[0], region, parents, style, false, false)), rowStyle = one(styles(rows[0], region, parents, sectionStyle, false, false));
    // A first-row cell spanning n columns gives each (w − (n − 1)·spacing) / n (measured).
    const widths = rows[0].children.flatMap(cell => {
      const cs = one(styles(cell, region, parents, rowStyle, false, false)), n = spanOf(cell);
      if (cs['inline-size'] === 'auto') return Array(n).fill(null);
      if (!/^\d+(?:\.\d+)?px$/.test(cs['inline-size'])) fail('Fixed table column widths must be px or auto');
      const edges = ['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
      const w = cs['box-sizing'] === 'content-box' ? add(px(cs['inline-size']), edges) : px(cs['inline-size']);
      const each = div(sub(w, mul(h, q(n - 1))), q(n));
      if (cmp(each, zero) <= 0) fail('A spanning cell narrower than its inner spacing is not modeled');
      return Array(n).fill(each);
    });
    // Column widths of a px-wide fixed table are constants (as the grid resolves them): px columns share the content
    // width in proportion, or keep their px and auto columns split the rest equally.
    // Column widths as affine functions of the viewport: constants for a px width, or from the containing width for an
    // auto (stretched in a grid area) or 100% border-box table.
    const columnWidths = () => {
      const frame = ['left', 'right'].map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]))).reduce(add, zero);
      let outer;
      if (!automatic && /^\d+(?:\.\d+)?px$/.test(style['inline-size'])) outer = scalar(style['box-sizing'] === 'content-box' ? add(px(style['inline-size']), frame) : px(style['inline-size']));
      else if (!automatic && style['box-sizing'] === 'border-box' && available?.inline && (style['inline-size'] === '100%' || (style['inline-size'] === 'auto' && parents.at(-1)?.style.display === 'grid'))) outer = available.inline;
      else fail('A measured rowspan cell needs a fixed table with a px, 100% or grid-stretched width (its width decides its height)');
      const content = diff(outer, scalar(add(frame, mul(h, q(columns + 1)))));
      const fixed = widths.filter(Boolean).reduce(add, zero), autos = widths.filter(w => !w).length;
      if (clip(region, diff(scalar(fixed), content), true)) fail('A measured rowspan cell in a table narrower than its px columns is not modeled');
      return widths.every(Boolean) ? widths.map(w => times(content, div(w, fixed))) : widths.map(w => w ? scalar(w) : times(diff(content, scalar(fixed)), div(q(1), q(autos))));
    };
    function cellInner(cell, cs) {
      const at = cell.tableAt, cols = columnWidths().slice(at.column, at.column + at.span).reduce((a, b) => sum(a, b));
      return diff(sum(cols, scalar(mul(h, q(at.span - 1)))), scalar(['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero)));
    }
    // The height of a line-count profile at an inner width (the caller splits the region at the profile's widths).
    function profileHeight(profile, inner) {
      if (typeof profile === 'number') return q(String(profile));
      probe?.push({ inner, thresholds: profile.map(e => q(String(e.atLeastInlineSize))) });
      const width = evaluate(inner, sample(region));
      const entry = profile.filter(e => cmp(q(String(e.atLeastInlineSize)), width) <= 0).at(-1);
      if (!entry || entry.blockSize === null) fail('The measured rowspan cell has no known height at its width');
      return q(String(entry.blockSize));
    }
    const stackedMin = (cell, cs) => (cell.stackedProfiles ?? []).reduce((total, child) => add(total, add(profileHeight(child.profile, diff(cellInner(cell, cs), scalar(child.sideEdges))), child.edges)), cell.tableStackedSpan);
    function measuredHeight(cell, cs, r) {
      const at = cell.tableAt, cols = columnWidths().slice(at.column, at.column + at.span).reduce((a, b) => sum(a, b));
      const inner = diff(sum(cols, scalar(mul(h, q(at.span - 1)))), scalar(['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero)));
      const profile = cell.contract.intrinsicBlockSize;
      if (typeof profile === 'number') return q(String(profile));
      // The caller splits the region at the profile's widths, so the entry is the same everywhere in it.
      probe?.push({ inner, thresholds: profile.map(e => q(String(e.atLeastInlineSize))) });
      const width = evaluate(inner, sample(region));
      const entry = profile.filter(e => cmp(q(String(e.atLeastInlineSize)), width) <= 0).at(-1);
      if (!entry || entry.blockSize === null) fail('The measured rowspan cell has no known height at its width');
      return q(String(entry.blockSize));
    }
    // With a rowspan the rows become explicit tracks: each row's other cells give its px height (border box).
    let rowTracks = null;
    if (rows.some(row => row.children.some(cell => cell.tableRowSpan))) rowTracks = rows.map(row => {
      const own = row.children.filter(cell => !cell.tableRowSpan);
      if (!own.length) return zero;
      const rowStyle = one(styles(row, region, parents, style, false, false));
      return own.map(cell => {
        const cs = one(styles(cell, region, parents, rowStyle, false, false));
        if (!/^\d+(?:\.\d+)?px$/.test(cs['block-size'])) fail('With rowspan, every row needs cells with a px block-size');
        const edges = ['top', 'bottom'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
        return cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size']);
      }).reduce((a, b) => cmp(a, b) >= 0 ? a : b);
    });
    // A taller rowspan cell grows its rows in proportion to their heights (all to the last row when they are 0),
    // each share floored to 1/64px and the rest to the last row (measured in Chromium). Spans may not overlap.
    if (rowTracks) {
      // Chromium's RowspanCell order (table_layout_algorithm_types.h, the legacy height-distribution order):
      // same rows → larger min block size first; a span enclosed in another first; else the lower start row.
      // It is not a strict weak order in general, so it is used only where it is consistent on these spans.
      const spans = rows.flatMap((row, r) => row.children.filter(cell => cell.tableRowSpan).map(cell => {
        const cs = one(styles(cell, region, parents, one(styles(row, region, parents, style, false, false)), false, false));
        const edges = ['top', 'bottom'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
        const min = cs['block-size'] !== 'auto' ? (cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size'])) : cell.tableMeasuredSpan ? add(measuredHeight(cell, cs, r), edges) : cell.tableStackedSpan !== undefined ? add(stackedMin(cell, cs), edges) : zero;
        return { cell, row, r, n: cell.tableRowSpan, min };
      }));
      const inside = (a, b) => a.r >= b.r && a.r + a.n <= b.r + b.n;
      const before = (a, b) => a.r === b.r && a.n === b.n ? cmp(a.min, b.min) > 0 : inside(a, b) ? true : inside(b, a) ? false : a.r < b.r;
      for (const a of spans) for (const b of spans) for (const c of spans) if (before(a, b) && before(b, c) && !before(a, c)) fail('These rowspan cells have no consistent Chromium distribution order');
      for (const a of spans) for (const b of spans) if (a !== b && before(a, b) && before(b, a)) fail('These rowspan cells have no consistent Chromium distribution order');
      const ordered = [...spans].sort((a, b) => before(a, b) ? -1 : before(b, a) ? 1 : 0);
      for (const { cell, row, r, n } of ordered) {
        const cs = one(styles(cell, region, parents, one(styles(row, region, parents, style, false, false)), false, false));
        if (cs['block-size'] === 'auto' && !cell.tableMeasuredSpan && cell.tableStackedSpan === undefined) continue;
        const edges = ['top', 'bottom'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
        const target = sub(spans.find(sp => sp.cell === cell).min, mul(v, q(n - 1)));
        const spanned = rowTracks.slice(r, r + n), total = spanned.reduce(add, zero);
        if (cmp(target, total) <= 0) continue;
        // Chromium's DistributeExcessBlockSizeToRows for a rowspan (rows here all have fixed heights, so none is
        // unconstrained): (1) rows after the first that start a rowspan share the excess equally; else (2) all rows
        // empty: the last takes it; else (3) the non-empty rows grow in proportion to their heights. Shares are
        // LayoutUnits (1/64px, truncated); the last receiving row takes the remainder.
        const floor64 = value => div(q(String(Math.floor(number(mul(value, q(64))) + 1e-9))), q(64));
        const excess = sub(target, total), grown = [...spanned];
        const starting = spanned.map((_, k) => k).filter(k => k > 0 && spans.some(other => other.r === r + k));
        const nonEmpty = spanned.map((h, k) => k).filter(k => cmp(spanned[k], zero) > 0);
        const share = (receivers, weight) => {
          let given = zero;
          receivers.forEach((k, i) => {
            const part = i === receivers.length - 1 ? sub(excess, given) : floor64(weight(k));
            grown[k] = add(grown[k], part); given = add(given, part);
          });
        };
        if (starting.length) share(starting, () => div(excess, q(starting.length)));
        else if (!nonEmpty.length) share([n - 1], () => excess);
        else share(nonEmpty, k => div(mul(spanned[k], excess), total));
        rowTracks.splice(r, n, ...grown);
      }
      rowTracks = rowTracks.map(value => `${number(value)}px`);
      // With explicit row tracks every cell stretches to its rows (its own height is in the track).
      for (const row of rows) for (const cell of row.children) cell.tableStretch = true;
    }
    // A caption sits outside the table box (above or below it, as wide as the table): an extra
    // grid row only when no border, padding or spacing separates the rows from the table edge.
    if (caption) {
      caption.tableCaption = { columns, rows: rows.length, side: one(styles(caption, region, parents, style, false, false))['caption-side'] };
    }
    let autoWidth = null, autoMinimum = null, contentTracks = null, contentShrink = null;
    if (automatic) {
      if (caption || rows.some(row => row.children.some(cell => (cell.colSpan ?? 1) > 1 || cell.tableRowSpan))) fail('Automatic table layout is modeled without captions, colspan or rowspan');
      const rowStyles = rows.map(row => one(styles(row, region, parents, one(styles(sections.find(sec => sec.children.includes(row)), region, parents, style, false, false)), false, false)));
      // Content-sized columns: no px widths at all, and every non-empty cell a leaf with trusted min- and max-content
      // widths (minInlineSize, maxInlineSize). Each column's range is its cells' widest (plus the cell edges).
      // Px columns may join (Chromium's auto table layout, measured): their range is [content minimum, px].
      // A cell holding only one empty static block of a px width (an icon button, a swatch): its min- and max-content
      // width is that width (plus the block's px margins).
      const sizedChild = cell => {
        if (cell.text || cell.contract || (cell.children ?? []).length !== 1) return null;
        const child = cell.children[0];
        if (child.text || child.contract || (child.children ?? []).length || child.inline?.length) return null;
        const sts = styles(child, region, parents, style, false, false);
        const widths = new Set(sts.map(st => st.style.display === 'block' && st.style.position === 'static' && /^\d+(?:\.\d+)?px$/.test(String(st.style['inline-size'])) && ['margin-left', 'margin-right'].every(k => ['0', '0px'].includes(String(st.style[k]))) && (st.style['box-sizing'] === 'border-box' || ['left', 'right'].every(side => ['0', '0px', 'ua'].includes(String(st.style[`padding-${side}`])) && ['0', '0px'].includes(String(st.style[`border-${side}`])))) ? st.style['inline-size'] : null));
        return widths.size === 1 && [...widths][0] ? px([...widths][0]) : null;
      };
      const leafWith = (cell, auto) => sizedChild(cell) !== null || (!(cell.children ?? []).length && cell.contract?.minInlineSize !== undefined && (!auto || cell.contract?.maxInlineSize !== undefined));
      const emptyCell = cell => !cell.text && !cell.contract && !(cell.children ?? []).length;
      const contentColumns = widths.some(w => !w) && rows.every(row => row.children.every((cell, c) => emptyCell(cell) || leafWith(cell, !widths[c]))) && (widths.every(w => !w) || rows.some(row => row.children.some((cell, c) => !widths[c] && !emptyCell(cell))));
      const ranges = contentColumns ? Array.from({ length: columns }, () => ({ min: zero, max: zero })) : null;
      rows.forEach((row, r) => row.children.forEach((cell, c) => {
        const cs = one(styles(cell, region, parents, rowStyles[r], false, false));
        if (contentColumns) {
          const cellEdges = ['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
          if (cs['inline-size'] !== 'auto') {
            if (!/^\d+(?:\.\d+)?px$/.test(cs['inline-size'])) fail('Automatic table column widths must be px or auto');
            const w = cs['box-sizing'] === 'content-box' ? add(px(cs['inline-size']), cellEdges) : px(cs['inline-size']);
            if (!widths[c] || cmp(w, widths[c]) !== 0) fail('In automatic table layout every px width of a column must be the first row\'s');
          }
          if (widths[c]) ranges[c].fixed = widths[c];
          const sized = sizedChild(cell);
          const lo = add(sized ?? q(String(cell.contract?.minInlineSize ?? 0)), cellEdges), hi = add(sized ?? q(String(cell.contract?.maxInlineSize ?? 0)), cellEdges);
          if (cmp(lo, ranges[c].min) > 0) ranges[c].min = lo;
          if (cmp(hi, ranges[c].max) > 0) ranges[c].max = hi;
          return;
        }
        if (cs['inline-size'] !== 'auto') {
          if (!/^\d+(?:\.\d+)?px$/.test(cs['inline-size'])) fail('Automatic table column widths must be px or auto');
          const edges = ['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
          const w = cs['box-sizing'] === 'content-box' ? add(px(cs['inline-size']), edges) : px(cs['inline-size']);
          if (!widths[c] || cmp(w, widths[c]) !== 0) fail('In automatic table layout every px width of a column must be the first row\'s');
        }
        const empty = !cell.text && !cell.contract && !(cell.children ?? []).length;
        if (!empty) {
          if (!widths[c]) fail('An automatic table column without a px width is sized by its content');
          const edges = ['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
          if (cell.contract?.minInlineSize === undefined || (cell.children ?? []).length || cmp(q(String(cell.contract.minInlineSize)), sub(widths[c], edges)) > 0)
            fail('In automatic table layout a cell needs a min-content bound (minInlineSize) that fits its px column');
        }
      }));
      const autos = widths.filter(w => !w).length;
      if (autos > 1 && !contentColumns) fail('Several auto columns share the extra width by content; not modeled');
      const edges = add(add(add(px(style['padding-left']), px(style['padding-right'])), add(px(style['border-left']), px(style['border-right']))), mul(h, q(columns + 1)));
      // An auto width stretches in a grid area (measured) and shrinks to fit at the root (block flow).
      const parentDisplay = parents.at(-1)?.style.display;
      if (style['inline-size'] === 'auto' && parentDisplay === 'flex') fail('An automatic table with an auto width in a flex container is sized by content');
      if (contentColumns) {
        for (const range of ranges) { if (cmp(range.max, range.min) < 0) range.max = range.min; if (range.fixed && cmp(range.fixed, range.min) < 0) range.fixed = range.min; }
        if (style['inline-size'] === 'auto' && parentDisplay === 'flex') fail('An automatic table with an auto width in a flex container is sized by content');
        // An auto width outside a grid area shrinks to fit: as wide as the available width, at most its columns'
        // max-content widths plus its edges (a max-inline-size on the equivalent grid).
        if (style['inline-size'] === 'auto' && parentDisplay !== 'grid') contentShrink = add(ranges.map(range => range.fixed ?? range.max).reduce(add, zero), edges);
        contentTracks = ranges.map(range => range.fixed ? `-isle-auto-table-fixed(${number(range.min)},${number(range.fixed)})` : `-isle-auto-table(${number(range.min)},${number(range.max)})`).join(' ');
      } else if (style['inline-size'] === 'auto' && parentDisplay === 'grid') autoMinimum = widths.filter(Boolean).reduce(add, zero);
      else if (style['inline-size'] === 'auto') {
        if (autos) fail('An automatic table with an auto column needs an explicit inline-size');
        autoWidth = add(widths.reduce(add, zero), edges);
      } else autoMinimum = widths.filter(Boolean).reduce(add, zero);
    }
    const tracks = contentTracks ? contentTracks.split(' ') : widths.every(Boolean) ? widths.map(w => `minmax(0, ${number(w)}fr)`) : widths.map(w => w ? `${number(w)}px` : 'minmax(0, 1fr)');
    const spacingEdges = { 'padding-left': add(px(style['padding-left']), h), 'padding-right': add(px(style['padding-right']), h), 'padding-top': add(px(style['padding-top']), v), 'padding-bottom': add(px(style['padding-bottom']), v) };
    // A content-box table's width includes the edge spacing (measured): the grid's content width is W − 2·spacing.
    let inlineSize = autoWidth ? `${number(autoWidth)}px` : style['inline-size'];
    if (autoWidth || contentShrink) style = { ...style, 'box-sizing': 'border-box', ...(contentShrink ? { 'max-inline-size': `${number(contentShrink)}px` } : {}) };
    else if (style['box-sizing'] === 'content-box') {
      if (!/^\d+(?:\.\d+)?px$/.test(inlineSize)) fail('A content-box fixed table needs a px inline-size');
      inlineSize = `${number(sub(px(inlineSize), add(h, h)))}px`;
    }
    // A caption with border-spacing: the caption spans the table's full width while the rows are inset, so the
    // spacing becomes explicit gap tracks (h c1 h c2 h; v r1 v r2 v) and every cell an explicit grid area.
    // The table's border and padding surround the rows but not the caption (measured): they join the edge tracks.
    const edge = side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]));
    if (caption && (cmp(h, zero) !== 0 || cmp(v, zero) !== 0 || ['left', 'right', 'top', 'bottom'].some(side => cmp(edge(side), zero) !== 0))) {
      const top = caption.tableCaption.side !== 'bottom', gapH = `${number(h)}px`, gapV = `${number(v)}px`, track = value => `${number(value)}px`;
      const rowList = rowTracks ?? rows.map(() => 'auto');
      const rowTemplate = [track(add(edge('top'), v)), ...rowList.flatMap((t, i) => [t, i === rowList.length - 1 ? track(add(edge('bottom'), v)) : gapV])];
      // The caption is as wide as the table's border box; a content-box width excludes the border and padding.
      let width = style['inline-size'];
      if (style['box-sizing'] === 'content-box') {
        if (!/^\d+(?:\.\d+)?px$/.test(width)) fail('A content-box table with a caption needs a px inline-size');
        width = `${number(add(px(width), add(edge('left'), edge('right'))))}px`;
      }
      const columnTemplate = [track(add(edge('left'), h)), ...tracks.flatMap((t, i) => [t, i === tracks.length - 1 ? track(add(edge('right'), h)) : gapH])];
      const noEdges = Object.fromEntries(['left', 'right', 'top', 'bottom'].flatMap(side => [[`padding-${side}`, '0'], [`border-${side}`, '0']]));
      caption.tableCaption = { ...caption.tableCaption, interleaved: { columns: 2 * columns + 1, row: top ? 1 : rowTemplate.length + 1 } };
      for (const row of rows) for (const cell of row.children) cell.tableArea = { column: 2 * cell.tableAt.column + 2, span: 2 * cell.tableAt.span - 1, row: (top ? 3 : 2) + 2 * cell.tableAt.row, down: 2 * cell.tableAt.down - 1 };
      return { ...style, ...noEdges, 'box-sizing': 'border-box', 'inline-size': width, display: 'grid', 'grid-template-columns': columnTemplate.join(' '), 'grid-template-rows': (top ? ['auto', ...rowTemplate] : [...rowTemplate, 'auto']).join(' '),
        'grid-auto-rows': 'auto', 'column-gap': '0px', 'row-gap': '0px', tableColumns: automatic ? null : widths.every(Boolean) ? widths.reduce(add, zero) : null,
        tableGaps: add(mul(h, q(columns + 1)), add(edge('left'), edge('right'))) };
    }
    const grid = { ...style, 'inline-size': inlineSize, display: 'grid', 'grid-template-columns': tracks.join(' '), 'grid-template-rows': rowTracks ? (caption ? (caption.tableCaption.side === 'bottom' ? [...rowTracks, 'auto'] : ['auto', ...rowTracks]).join(' ') : rowTracks.join(' ')) : 'none', 'grid-auto-rows': 'auto', 'column-gap': `${number(h)}px`, 'row-gap': `${number(v)}px`,
      ...Object.fromEntries(Object.entries(spacingEdges).map(([key, value]) => [key, `${number(value)}px`])), tableColumns: automatic ? null : widths.every(Boolean) ? widths.reduce(add, zero) : null, tableGaps: mul(h, q(columns - 1)),
      ...(autoWidth ? { tableShrink: autoWidth } : {}), ...(autoMinimum ? { tableAutoMinimum: autoMinimum } : {}) };
    return grid;
  }
  // The table's background paints the table box only, not its caption (measured): content of the
  // caption sees through the table's background.
  function captionBackdrop(parent, next, paint) {
    return parent.box.tag === 'table' && next?.tableCaption ? { ...paint, backgroundColor: 'transparent', backgroundImage: 'none' } : paint;
  }
  // Cells fill their column (and span colspan columns); a caption is a full-width first or last row.
  // A bare Nfr column is minmax(auto, Nfr): its minimum is the largest minimum contribution of its single-span items
  // (Grid §6.6). Where every one is a known constant C the column is rewritten to minmax(Cpx, Nfr) (minmax(0, Nfr)
  // for 0), which the fr sizing (with its freezing loop) handles; otherwise Unknown.
  // probe: instead, the min- and max-content widths (border box) of box itself: { min, max } (a flex item's content).
  function frAutoMinimums(box, style, region, parents, probe = false) {
    if (!probe && (!['grid', 'inline-grid'].includes(style.display) || style.$blockFlow)) return style;
    const source = String(style['grid-template-columns']);
    // repeat(auto-fill | auto-fit, …) takes no bare fr (invalid there); subgrid has no own tracks.
    if (!probe && (/auto-fill|auto-fit|subgrid/.test(source) || !/fr\b|\bauto\b|min-content|max-content|fit-content/.test(source))) return style;
    const unknown = why => { throw Object.assign(new Error(probe ? `${box.label}: its content ${why.replace(/^has /, 'has ')}; its content width is not known (give it a px width or flex-basis)` : `${box.label}: a bare fr column (minmax(auto, fr)) ${why}; its minimum is not known`), { code: probe ? 'U_LAYOUT_FLEX' : 'U_LAYOUT_GRID_FR', box, region }); };
    let tokens; try { tokens = probe ? ['auto'] : expandTracks(source); } catch { return style; }
    const frOf = token => { const m = token.match(/^(\d+(?:\.\d+)?)fr$/) ?? token.match(/^minmax\(\s*auto\s*,\s*(\d+(?:\.\d+)?)fr\s*\)$/); return m ? m[1] : null; };
    const bare = tokens.map(frOf);
    const kindOf = token => token === 'auto' ? 'auto' : token === 'min-content' ? 'min' : token === 'max-content' ? 'max' : /^fit-content\(\s*\d+(?:\.\d+)?px\s*\)$/.test(token) ? 'fit' : null;
    const kinds = tokens.map(kindOf);
    if (!bare.some(Boolean) && !kinds.some(Boolean)) return style;
    const ancestors = [...parents, { box, style }];
    const single = (target, at, inherited) => { const list = styles(target, region, at, inherited, false, true); const keys = new Set(list.map(x => JSON.stringify(x.style))); if (keys.size !== 1) unknown(`has an item whose styles change across the viewport range (${target.label})`); return list[0].style; };
    const length = (value, what) => { if (value === 'ua') unknown(`has an item with UA ${what}`); if (['0', '0px'].includes(String(value))) return zero; if (!/^\d+(?:\.\d+)?px$/.test(String(value))) unknown(`has an item whose ${what} is ${value}`); return px(value); };
    const edges = st => ['left', 'right'].map(side => add(length(st[`padding-${side}`], 'padding'), length(st[`border-${side}`], 'border'))).reduce(add, zero);
    const margins = st => ['left', 'right'].map(side => st[`margin-${side}`] === 'auto' ? zero : length(st[`margin-${side}`], 'margin')).reduce(add, zero);
    const borderBox = (st, value) => st['box-sizing'] === 'content-box' ? add(value, edges(st)) : value;
    const clampMax = (st, value) => { const m = st['max-inline-size']; if (m === 'none') return value; const v = borderBox(st, length(m, 'max-width')); return cmp(value, v) > 0 ? v : value; };
    // (A button is not replaced: its content is laid out like a block's.)
    const replaced = new Set(['img', 'svg', 'iframe', 'video', 'audio', 'canvas', 'input', 'select', 'textarea', 'embed', 'object']);
    // The min-content (or max-content) width (border box) of a box, or Unknown.
    const minContent = (target, st, at, max = false) => {
      if (replaced.has(target.tag)) unknown(`has a replaced or form element (${target.label}) without a px width`);
      if (target.text || target.inline?.length) {
        const key = max ? 'maxInlineSize' : 'minInlineSize';
        // A measured text contract carries its max-content width as textMetrics.width (or, unwrapped, its one width).
        // (The measured width is rounded up to six decimals, the precision of layout numbers.)
        const up = v => v === undefined ? undefined : Math.ceil(Number(v) * 1e6 - 1e-9) / 1e6;
        const value = up(!max ? target.contract?.minInlineSize : target.contract?.maxInlineSize ?? target.contract?.textMetrics?.width ?? (['nowrap', 'one-line'].includes(target.contract?.wrap) && target.contract?.font ? target.contract.minInlineSize : undefined));
        if (value === undefined) unknown(`has text without a ${max ? 'max' : 'min'}-content width (${target.label}; give it a ${key} contract)`);
        return add(q(String(value)), edges(st));
      }
      const kids = (target.children ?? []).filter(k => !k.pseudo);
      const inner = [...at, { box: target, style: st }];
      if (!kids.length && st.display !== 'grid') return edges(st);
      if (['block', 'list-item'].includes(st.display)) {
        let widest = zero;
        for (const kid of kids) { const ks = single(kid, inner, st); if (ks.display === 'none' || ['absolute', 'fixed'].includes(ks.position)) continue; const c = intrinsic(kid, ks, inner, max); if (cmp(c, widest) > 0) widest = c; }
        return add(widest, edges(st));
      }
      // A flex row: single-line, the sum of its items' contributions; wrapping, the widest (min-content) or the sum
      // (max-content). Items sized by flex-basis are not modeled.
      if (st.display === 'flex' && ['row', 'row-reverse'].includes(String(st['flex-direction']))) {
        const gap = ['normal', '0', '0px'].includes(String(st['column-gap'])) ? zero : length(st['column-gap'], 'column-gap');
        const items = kids.map(kid => [kid, single(kid, inner, st)]).filter(([, ks]) => ks.display !== 'none' && !['absolute', 'fixed'].includes(ks.position));
        if (items.some(([, ks]) => !['auto', 'content'].includes(String(ks['flex-basis'])))) unknown(`has a flex item sized by flex-basis in ${target.label}`);
        const contributions = items.map(([kid, ks]) => intrinsic(kid, ks, inner, max));
        const wraps = st['flex-wrap'] !== 'nowrap';
        const total = contributions.reduce(add, mul(gap, q(String(Math.max(0, contributions.length - 1)))));
        const widest = contributions.reduce((m, c) => cmp(c, m) > 0 ? c : m, zero);
        return add(wraps && !max ? widest : total, edges(st));
      }
      if (st.display === 'grid' && !st.$blockFlow) {
        const own = frAutoMinimums(target, st, region, at);
        const gap = ['normal', '0', '0px'].includes(String(own['column-gap'])) ? zero : length(own['column-gap'], 'column-gap');
        const list = expandTracks(String(own['grid-template-columns']));
        let total = mul(gap, q(String(Math.max(0, list.length - 1))));
        for (const token of list) {
          if (/^\d+(?:\.\d+)?px$/.test(token)) total = add(total, px(token));
          else if (!max && (kids.length === 0 || true)) { const m = token.match(/^minmax\(\s*(?:(\d+(?:\.\d+)?)px|0)\s*,\s*\d+(?:\.\d+)?fr\s*\)$/); if (!m) unknown(`has a nested grid column ${token} whose min-content width is not modeled`); if (m[1]) total = add(total, px(`${m[1]}px`)); }
          else if (max && !kids.length && /^minmax\(\s*0(?:px)?\s*,/.test(token)) continue;
          else unknown(`has a nested grid column ${token} whose max-content width is not modeled`);
        }
        return add(total, edges(st));
      }
      unknown(`has an item (${target.label}, display: ${st.display}) whose min-content width is not modeled`);
    };
    // The min-content contribution of a block-level child: its px width or min-content width, clamped, plus margins.
    const intrinsic = (target, st, at, max = false) => {
      let size;
      if (st['inline-size'] !== 'auto') size = borderBox(st, length(st['inline-size'], 'width')); else size = minContent(target, st, at, max);
      size = clampMax(st, size);
      if (st['min-inline-size'] !== 'auto') { const m = borderBox(st, length(st['min-inline-size'], 'min-width')); if (cmp(m, size) > 0) size = m; }
      return add(size, margins(st));
    };
    // A grid item's minimum contribution (Grid §6.6).
    const minimum = (item, st) => {
      let size;
      if (st['min-inline-size'] !== 'auto') size = borderBox(st, length(st['min-inline-size'], 'min-width'));
      else if (['hidden', 'auto', 'scroll'].includes(String(st['overflow-x']))) size = zero;
      else if (st['inline-size'] !== 'auto') size = clampMax(st, borderBox(st, length(st['inline-size'], 'width')));
      else size = clampMax(st, minContent(item, st, ancestors));
      if (cmp(size, edges(st)) < 0) size = edges(st);
      return add(size, margins(st));
    };
    // probe 'min': only the min-content width is needed (a percentage flex-basis sets the base; the minimum caps it).
    if (probe === 'min') return { min: clampMax(style, minContent(box, style, parents)) };
    if (probe) return { min: clampMax(style, minContent(box, style, parents)), max: clampMax(style, minContent(box, style, parents, true)) };
    const n = tokens.length, mins = tokens.map(() => zero), minContents = tokens.map(() => zero), maxContents = tokens.map(() => zero);
    let next = 0;
    for (const item of (box.children ?? []).filter(k => !k.pseudo && !k.anonymous)) {
      const st = single(item, ancestors, style);
      if (st.display === 'none' || ['absolute', 'fixed'].includes(st.position)) continue;
      if (st['grid-row'] !== 'auto' || (st['grid-auto-flow'] ?? 'row') !== 'row' && style['grid-auto-flow'] !== 'row') unknown('has an item placed by grid-row');
      let column;
      if (st['grid-column'] === 'auto') { if (style['grid-auto-flow'] !== 'row') unknown('is not auto-placed by rows'); column = next % n; next++; }
      else { const m = String(st['grid-column']).match(/^(\d+)(?:\s*\/\s*span\s+1)?$/); if (!m || Number(m[1]) < 1 || Number(m[1]) > n || next) unknown(`has an item placed by grid-column: ${st['grid-column']}`); column = Number(m[1]) - 1; }
      if (!bare[column] && !kinds[column]) continue;
      if (bare[column] || ['auto', 'fit'].includes(kinds[column])) { const c = minimum(item, st); if (cmp(c, mins[column]) > 0) mins[column] = c; }
      if (kinds[column] === 'min') { const c = intrinsic(item, st, ancestors); if (cmp(c, minContents[column]) > 0) minContents[column] = c; }
      if (['max', 'auto', 'fit'].includes(kinds[column])) { const c = intrinsic(item, st, ancestors, true); if (cmp(c, maxContents[column]) > 0) maxContents[column] = c; }
    }
    const stretch = ['normal', 'stretch'].includes(String(style['justify-content'] ?? 'normal'));
    const rewritten = tokens.map((token, i) => {
      if (bare[i]) return cmp(mins[i], zero) > 0 ? `minmax(${number(mins[i])}px, ${bare[i]}fr)` : `minmax(0, ${bare[i]}fr)`;
      if (kinds[i] === 'min') return `${number(minContents[i])}px`;
      if (kinds[i] === 'max') return `${number(maxContents[i])}px`;
      if (kinds[i] === 'auto' || kinds[i] === 'fit') {
        let limit = cmp(maxContents[i], mins[i]) > 0 ? maxContents[i] : mins[i];
        if (kinds[i] === 'fit') { const cap = px(token.match(/\(\s*([^)]+?)\s*\)/)[1]); if (cmp(limit, cap) > 0) limit = cmp(cap, mins[i]) > 0 ? cap : mins[i]; }
        return `-isle-content(${number(mins[i])},${number(limit)},${kinds[i] === 'auto' && stretch ? 1 : 0})`;
      }
      return token;
    }).join(' ');
    return { ...style, 'grid-template-columns': rewritten };
  }
  function tablePlacement(box, style) {
    if (box.tableCell && !box.tableFlow && style.display === 'table-cell' && box.tableBaselineShift) style = { ...style, 'padding-top': `${number(add(px(style['padding-top']), box.tableBaselineShift))}px`, 'vertical-align': 'top' };
    if (box.tableFlow && style.display === 'table-cell') style = { ...style, display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)', 'grid-template-rows': 'none', 'grid-auto-rows': 'auto', ...(box.tableBaselineShift ? { 'padding-top': `${number(add(px(style['padding-top']), box.tableBaselineShift))}px` } : {}), 'align-content': box.tableBaselineTop || box.tableBaselineShift ? 'start' : { middle: 'center', bottom: 'end' }[style['vertical-align']] ?? 'start', 'row-gap': '0', 'column-gap': '0', 'grid-auto-flow': 'row', $fromCell: true };
    if (box.tableCell && (style.display === 'table-cell' || style.$fromCell) && box.tableArea) return { ...style, display: style.$fromCell ? style.display : 'block', 'inline-size': 'auto', ...(box.tableStretch ? { 'block-size': 'auto' } : {}), 'grid-column': `${box.tableArea.column} / span ${box.tableArea.span}`, 'grid-row': `${box.tableArea.row} / span ${box.tableArea.down}` };
    if (box.tableCaption?.interleaved && style.display === 'table-caption') return { ...style, display: 'block', 'grid-column': `1 / span ${box.tableCaption.interleaved.columns}`, 'grid-row': String(box.tableCaption.interleaved.row) };
    if (box.tableCell && style.$fromCell) return { ...style, 'inline-size': 'auto', ...(box.tableStretch ? { 'block-size': 'auto' } : {}), ...(box.colSpan > 1 ? { 'grid-column': `span ${box.colSpan}` } : {}), ...(box.tableRowSpan ? { 'grid-row': `span ${box.tableRowSpan}` } : {}) };
    if (box.tableCell && style.display === 'table-cell') return { ...style, display: 'block', 'inline-size': 'auto', ...(box.tableStretch ? { 'block-size': 'auto' } : {}), ...(box.colSpan > 1 ? { 'grid-column': `span ${box.colSpan}` } : {}), ...(box.tableRowSpan ? { 'grid-row': `span ${box.tableRowSpan}` } : {}) };
    if (box.tableCaption && style.display === 'table-caption') return { ...style, display: 'block', 'grid-column': `1 / span ${box.tableCaption.columns}`, 'grid-row': String(box.tableCaption.side === 'bottom' ? box.tableCaption.rows + 1 : 1) };
    return style;
  }
  // Rendered legend: display block, static, explicit px inline-size and block-size, no block margins.
  function renderedLegend(box, style, region, parents) {
    if (box.tag !== 'fieldset' || style.display === 'contents') return null;
    const legendBox = (box.children ?? []).find(child => child.tag === 'legend');
    if (!legendBox) return null;
    const states = styles(legendBox, region, parents, style, false, false);
    if (states.length !== 1) throw Object.assign(new Error('The legend style varies across viewport regions; the rendered legend needs one size'), { code: 'U_LAYOUT_LEGEND' });
    const ls = states[0].style;
    if (ls.display === 'none') return { box: legendBox, hidden: true, effectiveTop: px(style['border-top']) };
    if (ls.display !== 'block' || ls.position !== 'static' || ls.float !== 'none' || ['inline-size', 'block-size'].some(key => !/^\d+(?:\.\d+)?px$/.test(ls[key])) || !['0', '0px'].includes(ls['margin-top']) || !['0', '0px'].includes(ls['margin-bottom']) || ls['margin-left'] === 'auto' || ls['margin-right'] === 'auto')
      throw Object.assign(new Error('A rendered legend needs display: block, an explicit px inline-size and block-size and no block or auto margins (its width is otherwise shrink-to-fit)'), { code: 'U_LAYOUT_LEGEND' });
    const vertical = add(add(px(ls['padding-top']), px(ls['padding-bottom'])), add(px(ls['border-top']), px(ls['border-bottom'])));
    const horizontal = add(add(px(ls['padding-left']), px(ls['padding-right'])), add(px(ls['border-left']), px(ls['border-right'])));
    const blockSize = ls['box-sizing'] === 'content-box' ? add(px(ls['block-size']), vertical) : px(ls['block-size']);
    const inlineSize = ls['box-sizing'] === 'content-box' ? add(px(ls['inline-size']), horizontal) : px(ls['inline-size']);
    const top = px(style['border-top']);
    return { box: legendBox, style: ls, blockSize, inlineSize, vertical, horizontal, effectiveTop: cmp(blockSize, top) > 0 ? blockSize : top,
      // The legend sits at border-left + padding-left + margin-left; a thicker border is centred on it.
      offset: { inline: add(add(px(style['border-left']), px(style['padding-left'])), px(ls['margin-left'])), block: cmp(top, blockSize) > 0 ? div(sub(top, blockSize), q(2)) : zero } };
  }
  function placeLegend(rendered, origin, region, ancestors, emit) {
    if (rendered.hidden) return;
    const inline = scalar(rendered.inlineSize), block = scalar(rendered.blockSize);
    const legendOrigin = origin ? { inline: sum(origin.inline, scalar(rendered.offset.inline)), block: sum(origin.block, scalar(rendered.offset.block)) } : null;
    finish(rendered.box, rendered.style, region, inline, diff(inline, scalar(rendered.horizontal)), block, diff(block, scalar(rendered.vertical)),
      { inline, block, ...(legendOrigin ? { origin: legendOrigin } : {}) }, ancestors, emit);
  }
  let rootFontSize = null;
  // Safe-area insets: the declared ones under viewport-fit=cover (Unknown when not declared), else 0.
  const cover = /viewport-fit\s*=\s*cover/i.test(String(root.metaViewport ?? ''));
  setSafeArea(cover ? (options.safeArea ? { top: 0, right: 0, bottom: 0, left: 0, ...options.safeArea } : 'unknown') : null);
  unitContext.rootFontSize = null; setRootFontSize(null); setUAProfile(resolveUAProfile(options.ua)); uaEngine = resolveUAProfile(options.ua)?.engine; unitContext.heightKnown = Boolean(block && options.viewport.height);
  // A flex item's main size that a non-auto flex-basis replaces, when no automatic minimum reads it (flex.mjs keeps
  // that case Unknown): the property, or null. The layout treats it as auto; finish() reports it as inert.
  function inertMainSize(style, box, main) {
    const size = main === 'block' ? 'block-size' : 'inline-size';
    if (!style.$sources?.[size] || style[size] === 'auto' || ['auto', 'content'].includes(String(style['flex-basis']))) return null;
    const scroller = !['visible', 'clip'].includes(String(style['overflow-x'])) || !['visible', 'clip'].includes(String(style['overflow-y']));
    const empty = !(box.children ?? []).length && !box.text && !box.inline?.length;
    return style[`min-${size}`] !== 'auto' || scroller || empty ? size : null;
  }
  // display: contents generates no box of its own (CSS Display §2.5): its sizes, padding, border, margin, background and
  // overflow do nothing (measured in Chromium); its children are laid out in its place and inherit from it.
  const contentsBoxKeys = ['inline-size', 'block-size', 'min-inline-size', 'min-block-size', 'max-inline-size', 'max-block-size',
    ...['top', 'right', 'bottom', 'left'].flatMap(side => [`padding-${side}`, `margin-${side}`, `border-${side}`]), 'background-color', 'background-image', 'overflow-x', 'overflow-y', 'aspect-ratio'];
  function contentsInert(box, style, region) {
    if (box.pseudo || ['button', 'input', 'select', 'textarea', 'img', 'video', 'iframe', 'svg', 'canvas', 'legend'].includes(box.tag) || layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path)) return;
    const written = contentsBoxKeys.filter(key => style.$sources?.[key] && !['0', '0px', 'auto', 'none', 'visible', 'transparent'].includes(String(style[key])));
    if (!written.length) return;
    layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: written,
      css: written.map(key => ({ property: key, file: style.$sources[key].file, line: style.$sources[key].line, selector: style.$sources[key].selector })),
      message: box.tablePart
        ? `${box.label}: ${written.join(', ')} ${written.length === 1 ? 'has' : 'have'} no effect (a table row or row group has no padding or margins, and its width does not size the columns). Put them on its cells`
        : `${box.label}: ${written.join(', ')} ${written.length === 1 ? 'has' : 'have'} no effect (it is display: contents, which generates no box of its own; its children are laid out in its place). Put them on a child, or use another display`, ...ranges(region) });
  }
  function solve(box, available, region, parents = [], inherited, emit = true) {
    let results = [];
    if (emit) box.$starts = { geometry: geometry.length, sizes: sizes.length };
    try {
      // A table with measured rowspan cells whose width varies: split the region where a cell's line count changes.
      const tableStates = state => {
        if (box.tag !== 'table' || state.style.display !== 'table') return [state];
        const probe = [];
        try { tableAsGrid(box, state.style, state.region, parents, false, available, probe); } catch { return [state]; }
        let pieces = [state.region];
        for (const { inner, thresholds } of probe) for (const t of thresholds) pieces = pieces.flatMap(r => { const p = partition(r, diff(inner, scalar(t)), '>='); return [...p.yes, ...p.no]; });
        if (pieces.length > 256) throw new Error('Table region limit exceeded');
        return pieces.map(r => ({ ...state, region: r }));
      };
      for (const state of styles(box, region, parents, inherited, emit, !available.root).flatMap(tableStates)) {
        let { style } = state;
        // A grid container whose only content is text (a chat bubble: display: grid on the p) has one anonymous grid
        // item holding it. With one minmax(0, 1fr) column, no row tracks and no item or content alignment, that item
        // fills the content box and its row is the text's height: the same as a block text leaf, which it is laid out as.
        const norm = v => String(v ?? '').replace(/\s+/g, '');
        if (style.display === 'grid' && !style.$blockFlow && box.text && !box.children.length && !box.pseudo && norm(style['grid-template-columns']) === 'minmax(0,1fr)'
          && style['grid-template-rows'] === 'none' && ['auto'].includes(String(style['grid-auto-rows'])) && style['grid-template-areas'] === 'none'
          && ['normal', 'stretch'].includes(String(style['align-items'])) && ['normal', 'stretch', 'legacy'].includes(String(style['justify-items'] ?? 'normal'))
          && ['normal', 'start', 'stretch'].includes(String(style['align-content'])) && ['normal', 'start', 'stretch'].includes(String(style['justify-content'])))
          style = { ...style, display: 'block', 'grid-template-columns': 'none', 'align-content': 'normal', 'justify-content': 'normal', $anonymousGridText: true };
        // A block container whose only child is one inline phrasing element with text (<p><a>Read more</a></p>,
        // <li><a>Item</a></li>) is a text leaf with that element as its inline content: it takes the element's
        // text contract. In a grid or flex container the element would be an item instead (not folded).
        if (style.display === 'block' && !box.text && !box.inline?.length && box.children.length && !box.pseudo) {
          const kids = box.children, textual = k => k.text || k.inline?.length;
          // Only elements that stay display: inline and in flow are folded (nav > a { display: block } is a block-level
          // child; an absolutely positioned badge in a button is out of flow).
          const staysInline = k => { try { return styles(k, state.region, [...parents.map(p => ({ ...p, names: [] })), { box, style, names: [] }], style, false, false).every(s => s.style.display === 'inline' && s.style.position === 'static' && s.style.float === 'none'); } catch { return true; } };
          const allInline = kids.every(k => phrasingTags.has(k.tag) && k.tag !== 'img' && !(k.children ?? []).length) && kids.every(staysInline);
          // One element: it brings its text contract. Several: the container's own contract sizes the line(s).
          if (allInline && kids.length === 1 && textual(kids[0]) && kids[0].contract && !box.contract)
            box = { ...box, text: true, inline: kids, children: [], contract: kids[0].contract, $foldedInline: true };
          else if (allInline && kids.length > 1 && kids.some(textual) && box.contract)
            box = { ...box, text: true, inline: kids, children: [], $foldedInline: true };
        }
        // A percentage height against a parent whose height depends on its content (block flow in block flow, auto
        // height) computes to auto (CSS 2.2 §10.5; measured: height: 100% changes nothing there).
        {
          const parent = parents.at(-1), grand = parents.at(-2);
          const blockish = st => st && ['block', 'list-item'].includes(String(st.display)) && !st.$blockFlowGrid;
          if (/^\d+(?:\.\d+)?%$/.test(String(style['block-size'])) && style.position === 'static' && parent && grand && blockish(parent.style) && blockish(grand.style) && String(parent.style['block-size']) === 'auto' && !['html', 'body'].includes(parent.box.tag) && !available.percentBlock && !box.pseudo) {
            if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties.includes('block-size')))
              layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['block-size'], ...(style.$sources?.['block-size'] ? { css: [{ property: 'block-size', file: style.$sources['block-size'].file, line: style.$sources['block-size'].line, selector: style.$sources['block-size'].selector }] } : {}),
                message: `${box.label}: block-size: ${style['block-size']} has no effect (its parent ${parent.box.label} has an auto height, which depends on its content, so a percentage height computes to auto). Give ${parent.box.label} a height, or make it a grid or flex container that stretches ${box.label}`, ...ranges(state.region) });
            style = { ...style, 'block-size': 'auto' };
          }
        }
        const inertMain = available.flexItem && style.position !== 'absolute' ? inertMainSize(style, box, available.flexItem.main) : null;
        if (inertMain) style = { ...style, [inertMain]: 'auto', $inertMain: { property: inertMain, value: style[inertMain] } };
        // A flex item's main size is the one its container resolved (grown, shrunk or clamped by its min/max, §9.7) and
        // passes down as the available size; its own width or height is only the base (measured: width: 50px with
        // flex-grow: 2 is 240px wide in a 300px row).
        else if (available.flexItem && style.position !== 'absolute') {
          const size = available.flexItem.main === 'block' ? 'block-size' : 'inline-size';
          const given = available[available.flexItem.main];
          // Unchanged (the item neither grew nor shrank, nor was clamped): keep its own size, which other rules read.
          const sides = available.flexItem.main === 'block' ? ['top', 'bottom'] : ['left', 'right'];
          const own = /^\d+(?:\.\d+)?px$/.test(String(style[size])) ? add(px(style[size]), style['box-sizing'] === 'content-box' ? sides.map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]))).reduce(add, zero) : zero) : null;
          const same = own && given && cmp(given.x, zero) === 0 && cmp(given.y, zero) === 0 && cmp(evaluate(given, { x: zero, y: zero }), own) === 0;
          if (style[size] !== 'auto' && given && !same) style = { ...style, [size]: 'auto', $flexMain: style[size] };
        }
        if (box.tag === 'html' && !parents.length && /^\d+(?:\.\d{1,6})?px$/.test(style['font-size'])) { rootFontSize = px(style['font-size']); unitContext.rootFontSize = rootFontSize; setRootFontSize(rootFontSize); }
        // defaultFontSize (the user's default font size, an assumption the caller states): the root's medium, %, em
        // or rem font-size resolves against it, so rem lengths do too.
        else if (box.tag === 'html' && !parents.length && options.defaultFontSize) {
          const fs = String(style['font-size']), base = q(String(options.defaultFontSize));
          const m = fs.match(/^(\d+(?:\.\d{1,6})?)(%|em|rem)$/);
          const size = ['medium', 'ua-default', 'initial', 'unset', 'revert'].includes(fs) ? base : m ? mul(base, m[2] === '%' ? div(q(m[1]), q('100')) : q(m[1])) : null;
          if (size) { rootFontSize = size; unitContext.rootFontSize = size; setRootFontSize(size); }
        }
        // A fixed table is laid out as its equivalent grid (rows and sections as contents, cells as blocks).
        if (box.tag === 'table' && style.display === 'table') style = tableAsGrid(box, style, state.region, parents, emit, available);
        if (!['grid', 'flex'].includes(style.display) && style.display !== 'none') { const generatedText = generatedElsewhere(box, state.region, [...parents, { box, style }], style); if (generatedText) box.generated = generatedText; }
        // A cell's width seeds its column (the cell fills the column); its height stretches to the row.
        style = tablePlacement(box, style);
        style = frAutoMinimums(box, style, state.region, parents);
        // min-block-size on a grid or flex container (auto height, not stretched by its parent): Grid §12.7.1 and
        // Flexbox §9.4 size the tracks or the line again against the container at its minimum, so where the natural
        // height falls short it lays out as if its height were the minimum (rows, fr rows and the flex line stretch).
        if (block && ['grid', 'inline-grid', 'flex', 'inline-flex'].includes(style.display) && !['auto', '0', '0px'].includes(String(style['min-block-size'])) && style['block-size'] === 'auto'
          // (Also an aligned item of a flex row: its cross size is its content raised to the minimum, like a grid item's.)
          && !available.$minNatural && !available.$minRaised && !available.root && !(available.flexItem && !(available.flexItem.main === 'inline' && available.alignBlock !== undefined)) && !available.flexBlockMinimum && !(available.block && available.alignBlock === undefined)) {
          const edge = key => style[key] === 'ua' ? zero : px(style[key]);
          const edges = scalar(['padding-top', 'padding-bottom', 'border-top', 'border-bottom'].map(edge).reduce(add, zero));
          for (const natural of solve(box, { ...available, $minNatural: true }, state.region, parents, inherited, false)) {
            if (!natural.block) throw new Error('CSS min-block-size on a container whose height is not known is not modeled');
            for (const m of lengthPieces(style['min-block-size'], available.percentBlock ?? available.block, natural.region, style)) {
              const minimum = style['box-sizing'] === 'content-box' ? sum(m.value, edges) : m.value;
              const split = partition(m.region, diff(natural.block, minimum), '>=');
              for (const r of split.yes) results.push(...solve(box, { ...available, $minNatural: true }, r, parents, inherited, emit));
              // (An aligned item keeps its area's size as block, for its offset; its own height is the raised one.)
              for (const r of split.no) results.push(...solve(box, available.alignBlock !== undefined ? { ...available, $raisedBlock: minimum, $minRaised: true } : { ...available, block: minimum, $minRaised: true }, r, parents, inherited, emit));
            }
          }
          continue;
        }
        if (!validate(style, box, state.region, emit, available, parents.at(-1)?.style ?? null)) continue;
        // A fieldset's first legend is rendered in its block-start border (HTML §15.3.13): it is not a
        // layout child, and the fieldset's effective border-top is max(border-top, legend height).
        const rendered = renderedLegend(box, style, state.region, parents);
        if (rendered) style = { ...style, 'border-top': `${number(rendered.effectiveTop)}px` };
        if (box.tag==='body' && parents.at(-1)?.box.documentRoot && inherited['overflow-x']==='visible' && inherited['overflow-y']==='visible' && inherited['container-type']==='normal' && style['container-type']==='normal' && (style['overflow-x']!=='visible' || style['overflow-y']!=='visible')) throw Object.assign(new Error('Body overflow propagation requires explicit overflow on html; set html overflow to auto or hidden'),{code:'U_LAYOUT_SCROLLBAR'});
        const incoming=available;
        for (const frame of scrollbarFrames(style,scrollbarProfile,box.documentRoot)) {
        const active=frame.inlineSize>0 || frame.blockSize>0;
        if (active && (style['grid-template-columns']==='subgrid' || style['grid-template-rows']==='subgrid')) throw Object.assign(new Error('Scrollbar insets on a shared subgrid axis need an adapter'),{code:'U_LAYOUT_SUBGRID',box,region:state.region,axis:'inline'});
        // Root scrollbars reduce the viewport; local scrollbars reduce the content box.
        const available=box.documentRoot ? {...incoming,inline:diff(incoming.inline,scalar(frame.inlineSize)),block:incoming.block ? diff(incoming.block,scalar(frame.blockSize)) : null,scrollbarFrame:active} : {...incoming,scrollbarFrame:active};
        if(emit && (active || ['auto','scroll'].includes(style['overflow-x']) || ['auto','scroll'].includes(style['overflow-y']))) scrollbars.push({box:box.label,path:box.path,...frame,viewport:Boolean(box.documentRoot),...ranges(state.region)});
        const edge = sides => scalar(sides.map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]))).reduce(add, zero));
        const cssInlineEdges=edge(['left','right']),cssBlockEdges=edge(['top','bottom']);
        const inlineEdges = sum(cssInlineEdges,scalar(box.documentRoot ? 0 : frame.inlineSize)), blockEdges = sum(cssBlockEdges,scalar(box.documentRoot ? 0 : frame.blockSize));
        // The preferred width (a viewport unit or calc() may split the region), as a border-box size.
        // A grid item (or block-flow child) with an aspect-ratio, a definite height and an auto width is not
        // stretched: justify-self: normal behaves as start for it, and its width follows the ratio (Grid §6.2, CSS
        // Sizing 4; measured). Flex items stretch on the cross axis or size by flex: not this case.
        const ratioWidth = block && style['inline-size'] === 'auto' && ratioOf(style) && /^\d+(?:\.\d+)?px$/.test(String(style['block-size'])) && available.gridItem && !available.flexItem
          && ['auto', 'normal'].includes(String(style['justify-self'] ?? 'auto')) && style.direction !== 'rtl' && !available.autoMargins?.inline;
        const ratioInline = () => {
          const h = length(style['block-size'], available.percentBlock ?? available.block, style), r = ratioOf(style);
          // ratio = height / width, on the box named by box-sizing.
          return style['box-sizing'] === 'content-box' ? sum(times(h, div(one, r)), cssInlineEdges) : times(h, div(one, r));
        };
        const preferredPieces = (style['inline-size'] === 'auto' ? [{ region: state.region, value: ratioWidth ? ratioInline() : available.inline }] : lengthPieces(style['inline-size'], available.percentInline ?? available.inline, state.region, style))
          .map(piece => ({ ...piece, value: style['inline-size'] !== 'auto' && style['box-sizing'] === 'content-box' ? sum(piece.value, cssInlineEdges) : piece.value }));
        const minimum = style['min-inline-size'] === 'auto' ? zero : px(style['min-inline-size']);
        const minimumBorderBox = sum(scalar(minimum), style['box-sizing'] === 'content-box' ? cssInlineEdges : scalar(0));
        const capped = style['max-inline-size'] !== 'none' ? preferredPieces.flatMap(piece => lengthPieces(style['max-inline-size'], available.percentInline ?? available.inline, piece.region, style).flatMap(cap => minimumOf(cap.region, piece.value, sum(cap.value, style['box-sizing'] === 'content-box' ? cssInlineEdges : scalar(0))))) : preferredPieces;
        const preferredStates = capped.flatMap(c => cmp(minimum, zero) > 0 ? maximum(c.region, c.value, minimumBorderBox) : [c]);
        const edgeExplanation = axis => () => explanation(sizeChain([...parents, { box, style }], axis, { hostInset: options.hostInset }), sizeProperties(axis).filter(property => /^(?:padding|border)-/.test(property)).map(property => fact(box, style, property)));
        for (const proposal of preferredStates) if (emit) obligation(proposal.value, inlineEdges, box, proposal.region, 'E_LAYOUT_BOX_EDGES', 'inline', true, edgeExplanation('inline'));
        const contentStates = preferredStates.flatMap(proposal => clamp(proposal.region, diff(proposal.value, inlineEdges)));
        for (const content of contentStates) {
          const inline = sum(content.value, inlineEdges), contentInline = content.value;
          // A text field's placeholder measured with its font (placeholderInlineSize): wider than the field's content
          // box, its end is cut off (the hint the user reads before typing).
          if (emit && box.contract?.placeholderInlineSize !== undefined && !layoutWarnings.some(w => w.code === 'W_A11Y_PLACEHOLDER_CLIPPED' && w.path === box.path)) {
            const cut = clip(content.region, diff(scalar(box.contract.placeholderInlineSize), contentInline), true);
            if (cut) { const p = sample(cut); layoutWarnings.push({ code: 'W_A11Y_PLACEHOLDER_CLIPPED', severity: 'warning', box: box.label, path: box.path, needs: box.contract.placeholderInlineSize,
              message: `${box.label}'s placeholder needs ${box.contract.placeholderInlineSize}px but the field shows ${number(evaluate(contentInline, p))}px at viewport ${number(p.x)}px: its end is cut off. Shorten the placeholder (or put the hint in a label) or widen the field`, ...ranges(cut) }); }
          }
          let fixedBlock = null;
          if (block) {
            if (style['block-size'] !== 'auto') fixedBlock = /^\d+(?:\.\d+)?(?:px|%)$/.test(style['block-size']) ? length(style['block-size'], available.percentBlock ?? available.block, style) : scalar(zero);
            // aspect-ratio with an auto block-size (an img, or a box with no content): the block size follows the
            // inline size, on the box named by box-sizing (the content box by default).
            else if (ratioOf(style) && (['img', 'video'].includes(box.tag) || (!(box.children ?? []).length && !box.text && !box.inline?.length))) {
              const r = ratioOf(style);
              // Where the container sets the block size, it wins over the ratio (measured: a growing column flex item,
              // and a grid item with an explicit align-self: stretch, take the container's size); that is not modeled.
              const parentStyle = parents.at(-1)?.style;
              const explicitStretch = String(style['align-self']) === 'stretch' || (['auto', 'normal'].includes(String(style['align-self'] ?? 'auto')) && String(parentStyle?.['align-items']) === 'stretch');
              const growing = available.flexItem?.main === 'block' && cmp(q(String(style['flex-grow'] ?? '0')), zero) > 0;
              // (A flex row stretches its items by default: align-items normal; measured: a ratio item is the line's height.)
              const rowStretch = available.flexItem?.main === 'inline' && available.alignBlock === undefined;
              if (growing || rowStretch || (explicitStretch && available.gridItem)) throw Object.assign(new Error(`${box.label}: aspect-ratio with an auto height where its container ${growing ? 'grows it (flex-grow in a column)' : 'stretches it (align-self: stretch, or a flex row\'s default)'} is not modeled`), { code: 'U_LAYOUT_CSS', box });
              fixedBlock = style['box-sizing'] === 'border-box' ? times(inline, r) : sum(times(contentInline, r), cssBlockEdges);
            }
            // aspect-ratio on a box with content: the ratio sets the height, raised to the content's by the automatic
            // minimum in some layouts and not in others (measured: a grid item with a 30px child is 30px, a flex container
            // whose content is 38px follows the ratio's 20px); that is not modeled.
            else if (ratioOf(style) && ((box.children ?? []).length || box.text || box.inline?.length)) throw Object.assign(new Error(`${box.label}: aspect-ratio on a box with content (its height is the ratio's or its content's) is not modeled; give it a height, or put the ratio on an empty box`), { code: 'U_LAYOUT_CSS', box });
            else if (!available.root && available.block && available.alignBlock === undefined) fixedBlock = available.block;
            // A container raised to its min-height keeps that height also when it is aligned (not stretched) in its area
            // (measured: align-self: center on a 38px flex container with min-height: 50px is 50px tall).
            else if (available.$minRaised && (available.$raisedBlock || available.block)) fixedBlock = available.$raisedBlock ?? available.block;
            else if (style['container-type'] === 'size') fixedBlock = blockEdges;
            if (style['block-size'] !== 'auto' && style['box-sizing'] === 'content-box') fixedBlock = sum(fixedBlock, cssBlockEdges);
          }
          const maxBlock = block && /^\d+(?:\.\d+)?px$/.test(style['max-block-size']) ? sum(scalar(px(style['max-block-size'])), style['box-sizing'] === 'content-box' ? cssBlockEdges : scalar(0)) : null;
          // A block-size with viewport units, min()/max()/clamp() may split the region (a single piece otherwise).
          const contentEdges = style['box-sizing'] === 'content-box' ? cssBlockEdges : scalar(0);
          const blockPieces = block && style['block-size'] !== 'auto' && !/^\d+(?:\.\d+)?(?:px|%)$/.test(style['block-size'])
            ? lengthPieces(style['block-size'], available.percentBlock ?? available.block, content.region, style).map(piece => ({ region: piece.region, value: sum(piece.value, contentEdges) }))
            : [{ region: content.region, value: fixedBlock }];
          const fixedPieces = blockPieces.flatMap(piece => !(block && style['max-block-size'] !== 'none' && piece.value) ? [piece]
            : lengthPieces(style['max-block-size'], available.percentBlock ?? available.block, piece.region, style).flatMap(cap => minimumOf(cap.region, piece.value, sum(cap.value, contentEdges))));
          // min-block-size (content-box value, outer minus edges): wins over max-block-size, so it is applied after it.
          const minBlock = block && !['auto', '0', '0px'].includes(String(style['min-block-size'])) && !available.flexBlockMinimum && !available.$minNatural
            ? region => lengthPieces(style['min-block-size'], available.percentBlock ?? available.block, region, style).map(m => ({ region: m.region, value: diff(sum(m.value, contentEdges), blockEdges) })) : null;
          const raisedPieces = !minBlock ? fixedPieces : fixedPieces.flatMap(piece => !piece.value ? [piece] : minBlock(piece.region).flatMap(m => maximum(m.region, piece.value, sum(m.value, blockEdges))));
          const blockStates = raisedPieces.flatMap(piece => piece.value ? clamp(piece.region, diff(piece.value, blockEdges)) : [{ region: piece.region, value: null }]);
          for (const piece of fixedPieces) if (piece.value && emit) obligation(piece.value, blockEdges, box, piece.region, 'E_LAYOUT_BOX_EDGES', 'block', true, edgeExplanation('block'));
          for (const bs of blockStates) {
            const origin=resolvedOrigin(style,available,inline,bs.value ? sum(bs.value,blockEdges) : null,parents);
            const contentOrigin=offset(origin,edge(['left']),edge(['top']));
            // A transformed box is the containing block of its absolute descendants, like a positioned one.
            const knownBlock = bs.value, own = { box, style, inline: contentInline, block: knownBlock, positioned:style.position!=='static' || containsFixed(style),
              contentOrigin,paddingOrigin:offset(origin,scalar(px(style['border-left'])),scalar(px(style['border-top']))),
              subgrid:style['grid-template-columns']==='subgrid' || style['grid-template-rows']==='subgrid',
              clipped:!(box.documentRoot && available.root) && (!['visible','clip'].includes(style['overflow-x']) || !['visible','clip'].includes(style['overflow-y'])), clipScope: !(box.documentRoot && available.root) && (style['overflow-x'] === 'clip' || style['overflow-y'] === 'clip'),
              paddingInline:diff(inline,scalar(add(px(style['border-left']),px(style['border-right'])))),
              paddingBlock:knownBlock ? diff(sum(knownBlock,blockEdges),scalar(add(px(style['border-top']),px(style['border-bottom'])))) : null,
              type: style['container-type'], names: style['container-name'] === 'none' ? [] : style['container-name'].split(/\s+/) };
            const ancestors = [...parents, own];
            if (rendered) placeLegend(rendered, origin, bs.region, ancestors, emit);
            // A fixed table narrower than its px columns grows past its width; the grid cannot follow that.
            // An automatic table shares a width below its px columns by content (not modeled), and one with an auto
            // width shrinks to a narrower container: Unknown there.
            if (emit && style.tableAutoMinimum) { const narrow = clip(bs.region, diff(sum(scalar(style.tableAutoMinimum), scalar(style.tableGaps)), contentInline), true); if (narrow) diagnostics.push({ code: 'U_LAYOUT_TABLE', severity: 'unknown', message: `${box.label} is narrower than its px columns; automatic layout then shares the width by content`, box: box.label, path: box.path, source: box.source, ...ranges(narrow) }); }
            if (emit && style.tableShrink && available.inline) { const narrow = clip(bs.region, diff(scalar(style.tableShrink), available.inline), true); if (narrow) diagnostics.push({ code: 'U_LAYOUT_TABLE', severity: 'unknown', message: `${box.label} has an automatic width wider than its container here, where it shrinks by content`, box: box.label, path: box.path, source: box.source, ...ranges(narrow) }); }
            if (emit && style.tableColumns) obligation(diff(contentInline, scalar(style.tableGaps)), scalar(style.tableColumns), box, bs.region, 'E_LAYOUT_TABLE_WIDTH', 'inline');
            const { axes: inheritedAxes, regions: geometryRegions } = subgridGeometry(style, box, available, bs.region, emit);
            for (const geometryRegion of geometryRegions) {
              // Even an empty Grid has explicit tracks and contributes their
              // height/overflow. Only ordinary leaves use intrinsic height.
              if (!box.children.length && style.display !== 'grid') {
                let heights = !block ? [{ region: geometryRegion, value: null }] : knownBlock ? [{ region: geometryRegion, value: knownBlock }] : intrinsic(box, contentInline, geometryRegion);
                // A line clamp caps the text's height at N lines; where the text needs more, the rest is cut off (a warning).
                if (style.$lineClamp && !knownBlock) heights = heights.flatMap(h => h.value ? minimumOf(h.region, h.value, scalar(mul(q(String(style.$lineClamp)), px(style['line-height'])))).map(c => {
                  const cut = clip(c.region, diff(h.value, c.value), true);
                  if (cut && !layoutWarnings.some(w => w.code === 'W_LAYOUT_LINE_CLAMPED' && w.path === box.path)) { const p = sample(cut); layoutWarnings.push({ code: 'W_LAYOUT_LINE_CLAMPED', severity: 'warning', box: box.label, path: box.path, lines: style.$lineClamp, message: `${box.label} is clamped to ${style.$lineClamp} lines and its text needs ${number(div(evaluate(h.value, p), px(style['line-height'])))} at viewport ${number(p.x)}px: the rest of the text is cut off (keep the full text available elsewhere, such as the page the card links to)`, ...ranges(cut) }); }
                  return c;
                }) : [h]);
                // A content height above max-block-size is capped; the content then has to fit (or overflow by contract).
                if (maxBlock && !knownBlock) heights = heights.flatMap(h => h.value ? minimumOf(h.region, h.value, diff(maxBlock, blockEdges)).map(c => {
                  if (c.value !== h.value && emit) obligation(c.value, h.value, box, c.region, 'E_LAYOUT_CONTENT', 'block', (box.contract?.overflowBlock ?? 'fit') === 'fit');
                  return c;
                }) : [h]);
                if (minBlock && !knownBlock) heights = heights.flatMap(h => h.value ? minBlock(h.region).flatMap(m => maximum(m.region, h.value, m.value)) : [h]);
                for (const h of heights) {
                  results.push(finish(box, style, h.region, inline, contentInline, h.value ? sum(h.value, blockEdges) : null, h.value, available, parents, emit));
                  // Absolute ::before/::after of the leaf, against the nearest positioned box (this leaf when it is).
                  for (const kind of box.absolutePseudo ?? []) {
                    const leafOwn = { ...own, paddingBlock: own.paddingBlock ?? (h.value ? diff(sum(h.value, blockEdges), scalar(add(px(style['border-top']), px(style['border-bottom'])))) : null) };
                    const chain = [...parents, leafOwn], containing = chain.findLast(a => a.positioned);
                    if (!block || !containing?.paddingBlock || containing.subgrid || chain.some(a => a.clipped)) throw Object.assign(new Error(`${box.label}::${kind} is absolutely positioned without an owned non-scrolling, unclipped containing block`), { code: 'U_LAYOUT_PSEUDO' });
                    const pbox = { ...box, path: `${box.path}/${kind === 'before' ? -1 : 0}`, label: `${box.label}::${kind}`, children: [], inline: undefined, text: false, contract: undefined, pseudo: kind, absolutePseudo: undefined,
                      named: undefined, focusable: false, tabIndex: undefined, role: undefined, href: undefined, ariaHidden: undefined, id: undefined };
                    solve(pbox, { inline: containing.paddingInline, block: containing.paddingBlock, containingBlock: { path: containing.box.path, inline: containing.paddingInline, block: containing.paddingBlock, origin: containing.paddingOrigin } }, h.region, chain, style, emit);
                  }
                }
                continue;
              }
              // Block flow: a display: block container whose children are all block-level, with no vertical margins
              // to collapse, lays them out as a one-column grid whose rows do not stretch (align-content: start) —
              // measured equal in Chromium for widths, %, horizontal margins, padding, borders, nested grids and images.
              // Its gaps and grid properties do not apply. Auto margins with an auto width fill, cap and center (below).
              // align-content applies to block containers (measured): center and end move the content; the rest is start.
              // justify-items on a block container aligns its block-level children and shrinks an auto width to fit
              // (measured: justify-items: end puts an empty child at the right edge, 0px wide); that is not modeled.
              if (style.display === 'block' && !box.text && !['normal', 'stretch', 'legacy', 'auto'].includes(String(style['justify-items'] ?? 'normal'))) throw Object.assign(new Error(`${box.label}: justify-items: ${style['justify-items']} on a block container aligns its children and shrinks them to fit, which is not modeled`), { code: 'U_LAYOUT_CSS', box });
              if (style.display === 'block' && !box.text) style = { ...style, display: 'grid', 'grid-template-columns': 'minmax(0,1fr)', 'grid-template-rows': 'none', 'grid-auto-rows': 'auto', 'grid-auto-flow': 'row', 'grid-template-areas': 'none', 'align-content': ['center', 'safe center'].includes(String(style['align-content'])) ? 'center' : ['end', 'flex-end'].includes(String(style['align-content'])) ? 'end' : 'start', 'justify-content': 'normal', 'align-items': 'normal', 'justify-items': 'normal', 'row-gap': 'normal', 'column-gap': 'normal', $blockFlow: true };
              if (!['grid', 'flex'].includes(style.display)) { issue('E_LAYOUT_CONTAINER', 'Layout containers must use grid or the flex subset', box, bs.region); continue; }
              const isFlex = style.display === 'flex';
              if (!isFlex && !['row', 'row dense', 'dense', 'column', 'column dense'].includes(String(style['grid-auto-flow']))) throw new Error('Only row auto-placement, and column auto-placement over listed rows, is supported (sparse or dense)');
              // Child boxes per region. display: contents is replaced by its
              // children, which inherit from it (the element tree) but are
              // laid out as items of this container.
              const collect = region => {
                let states = [{ region, children: [] }];
                const visit = (child, inheritedStyle) => {
                  states = bounded(states.flatMap(s => styles(child, s.region, ancestors, inheritedStyle, false).flatMap(c => {
                    if (child.tableCell || child.tableCaption) c = { ...c, style: tablePlacement(child, c.style) };
                    if (child.tablePart && ['table-row-group', 'table-header-group', 'table-footer-group', 'table-row'].includes(c.style.display)) c = { ...c, style: { ...c.style, display: 'contents' } };
                    if (c.style.display === 'none') return [{ region: c.region, children: s.children }];
                    if (c.style.display !== 'contents') return [{ region: c.region, children: [...s.children, { box: child, style: c.style, inherited: inheritedStyle }] }];
                    if (child.text || child.contract || child.targets?.length) throw new Error('display: contents with text, contracts or noshift targets needs anonymous or absent boxes');
                    if (emit) contentsInert(child, c.style, c.region);
                    return [{ region: c.region, children: s.children, contents: c.style }];
                  })));
                  const nested = states.filter(state => state.contents);
                  if (!nested.length) return;
                  if (nested.length !== states.length) throw new Error('display: contents that varies across regions is outside the subset');
                  const contentsStyle = nested[0].contents;
                  for (const state of states) delete state.contents;
                  for (const grandchild of child.children) visit(grandchild, contentsStyle);
                };
                // ::before/::after: an empty, absolutely positioned box with explicit sizes (decorative layers, overlays)
                // takes part as a child painted before or after the others; generated text is not modeled.
                const pseudo = kind => {
                  const pbox = { ...box, tag: box.tag, path: `${box.path}/${kind === 'before' ? -1 : box.children.length}`, label: `${box.label}::${kind}`, children: [], inline: undefined, text: false, contract: undefined, pseudo: kind,
                    named: undefined, focusable: false, tabIndex: undefined, role: undefined, href: undefined, ariaHidden: undefined, id: undefined };
                  states = bounded(states.flatMap(s => styles(pbox, s.region, ancestors, style, false, false, new Set([`::${kind}`])).map(c => {
                    const content = c.style.content ?? 'none';
                    if (content === 'none' || c.style.display === 'none') return { region: c.region, children: s.children };
                    // Generated text in a grid/flex container is an item of its own: sized by a selector::kind contract.
                    if (content.startsWith('text:')) {
                      const sized = pseudoContracts.find(p => p.kind === kind && matches(p.base, box));
                      if (!sized || c.style.position !== 'static') throw Object.assign(new Error(`${pbox.label} generates text${sized ? ' out of flow' : '; give it a contract (' + box.label + '::' + kind + ')'}`), { code: 'U_LAYOUT_PSEUDO' });
                      const tbox = { ...pbox, text: true, textContent: content.slice(5), generated: { [kind]: content.slice(5) }, contract: sized.contract, contractSelector: sized.selector };
                      return { region: c.region, children: kind === 'before' ? [{ box: tbox, style: c.style, inherited: style }, ...s.children] : [...s.children, { box: tbox, style: c.style, inherited: style }] };
                    }
                    if (c.style.position !== 'absolute') throw Object.assign(new Error(`${pbox.label} is generated in flow; only absolutely positioned generated boxes are modeled`), { code: 'U_LAYOUT_PSEUDO' });
                    return { region: c.region, children: kind === 'before' ? [{ box: pbox, style: c.style, inherited: style }, ...s.children] : [...s.children, { box: pbox, style: c.style, inherited: style }] };
                  })));
                };
                if (!box.pseudo) pseudo('before');
                // A closed details renders only its first summary (measured); an open attribute set by script is Unknown.
                if (box.tag === 'details' && box.detailsOpen === 'dynamic') throw Object.assign(new Error(`${box.label}: whether this details is open is decided at run time`), { code: 'U_LAYOUT_ELEMENT', box });
                const summary = box.tag === 'details' ? box.children.find(child => child.tag === 'summary') : null;
                for (const child of box.children) if (child !== rendered?.box && !(box.tag === 'details' && box.detailsOpen === false && child !== summary)) visit(child, style);
                if (!box.pseudo) pseudo('after');
                // order: items are laid out (and painted) in order-modified document order, a stable sort by order. Modeled
                // where in-flow items cannot overlap (so paint order does not matter): flex items, and grid items that are
                // all auto-placed; with a transform or relative offsets on a reordered item it stays Unknown. Tab order
                // still follows the DOM (visual-order reports the difference).
                for (const state of states) {
                  if (state.children.every(child => child.style.order === '0')) continue;
                  const reject = why => { throw Object.assign(new Error(`order changes the item sequence; ${why}`), { code: isFlex ? 'U_LAYOUT_FLEX' : 'U_LAYOUT_CSS', box }); };
                  if (state.children.some(child => !/^-?\d+$/.test(String(child.style.order)))) reject('only integer order values are modeled');
                  if (!isFlex && state.children.some(child => child.style['grid-column'] !== 'auto' || child.style['grid-row'] !== 'auto' || child.style['grid-area'] && child.style['grid-area'] !== 'auto')) reject('with explicitly placed grid items (which may overlap) it is not modeled');
                  if (state.children.some(child => child.style.transform !== 'none' || (child.style.position === 'relative' && ['top', 'left', 'right', 'bottom'].some(k => child.style[k] !== 'auto')))) reject('with transformed or offset items (whose paint order matters) it is not modeled');
                  state.children = [...state.children].sort((a, b) => Number(a.style.order) - Number(b.style.order));
                }
                return states;
              };
              if (isFlex) { for (const result of layoutFlex({ box, style, region: geometryRegion, inline, contentInline, knownBlock, blockEdges, available, parents, ancestors, contentOrigin, collect, emit })) results.push(result); continue; }
              const sharedColumns = inheritedAxes.inline;
              // Flex: the items' flex properties define one row of tracks.
              // repeat(auto-fill, T) with T = Lpx or minmax(Lpx | min(Lpx, 100%), Nfr): as many tracks as fit at their
              // minimum, at least one (css-grid-1 §7.2.3.2). The count is a region split on the container width.
              const autoRepeat = !sharedColumns && /^\s*repeat\(\s*auto-(fill|fit)\s*,(.*)\)\s*$/.exec(String(style['grid-template-columns']));
              let plans;
              if (autoRepeat) {
                // auto-fit collapses the tracks no item occupies (and their gaps): with k auto-placed single-span items
                // it is auto-fill capped at k tracks (measured). The item count is checked per state below.
                const fitItems = autoRepeat[1] === 'fit' ? (box.children ?? []).filter(child => !child.pseudo).length : null;
                const [track] = tracks(autoRepeat[2].trim());
                const size = track.fixed ?? track.min;
                if (!size || cmp(size, zero) <= 0) throw Object.assign(new Error(`repeat(auto-fill, ${autoRepeat[2].trim()}) needs a px or minmax(px, fr) track`), { code: 'U_LAYOUT_CSS' });
                const gapPx = gapSize(style['column-gap']), step = add(size, gapPx);
                const widest = Math.max(...geometryRegion.vertices.map(v => Number(number(evaluate(contentInline, v)))));
                const most = Math.min(64, Math.max(1, Math.floor((widest + Number(number(gapPx))) / Number(number(step)))));
                plans = [];
                for (let n = 1; n <= most; n++) {
                  // n tracks: n·size + (n−1)·gap ≤ W < (n+1)·size + n·gap (n = 1 also below one track: at least one).
                  let r = [geometryRegion];
                  if (n > 1) r = r.flatMap(x => partition(x, diff(contentInline, scalar(sub(mul(q(n), step), gapPx))), '>=').yes);
                  if (n < most) r = r.flatMap(x => partition(x, diff(contentInline, scalar(sub(mul(q(n + 1), step), gapPx))), '>=').no);
                  for (const region of r) plans.push({ region, columns: Array.from({ length: fitItems === null ? n : Math.max(1, Math.min(n, fitItems)) }, () => track), ...(fitItems !== null ? { fitItems } : {}) });
                }
              } else plans = [{ region: geometryRegion, columns: sharedColumns ? sharedColumns.values.map(value => ({ definite: value })) :
                style['grid-template-columns'] === 'none' ? [] : tracks(style['grid-template-columns'] ?? 'none') }];
              for (const plan of plans) {
              const columns = plan.columns;
              const columnGap = gapSize(style['column-gap'], sharedColumns);
              const columnBases = columns.map(track => scalar(track.fixed ?? track.edges ?? zero));
              const columnLayouts = sharedColumns ? [{ region: plan.region, values: sharedColumns.values, required: trackArea(sharedColumns.values, columnGap, 0, columns.length) }] :
                flex(plan.region, contentInline, columns, mul(columnGap, q(Math.max(0, columns.length - 1))), columnBases, false);
              // justify-content distributes free space between tracks (positions only).
              const justified = columnLayouts.flatMap(cs => {
                const d = sharedColumns ? { lead: zero, extra: zero, negative: 'start' } : distribution(style['justify-content'], 'inline', columns.length);
                if (cmp(d.lead, zero) === 0 && cmp(d.extra, zero) === 0) return [{ ...cs, shift: { lead: scalar(0), extra: scalar(0) } }];
                const free = diff(contentInline, sum(total(cs.values), scalar(mul(columnGap, q(Math.max(0, columns.length - 1))))));
                const split = partition(cs.region, free, '>=');
                return [...split.yes.map(region => ({ ...cs, region, shift: { lead: times(free, d.lead), extra: times(free, d.extra) } })),
                  ...split.no.map(region => ({ ...cs, region, shift: d.negative === 'start' ? { lead: scalar(0), extra: scalar(0) } : null }))];
              });
              for (const cs of justified) {
                if (emit) obligation(contentInline, cs.required, box, cs.region, 'E_LAYOUT_TRACKS', 'inline', (box.contract?.overflow ?? 'fit') === 'fit' && !scrolls(style, 'x'), () => explanation(sizeChain([...parents, { box, style }], 'inline', { hostInset: options.hostInset }), trackProperties('inline').map(property => fact(box, style, property))));
                const childStates = collect(cs.region);
                for (const children of childStates) {
                  if (!block && children.children.some(child=>child.style.position==='absolute')) throw new Error('Absolute boxes require both-axis analysis');
                  if (!columns.length && children.children.some(child=>child.style.position!=='absolute')) throw new Error('In-flow Grid children require explicit supported columns');
                  if (style.$blockFlow) {
                    const flow = children.children.filter(child => child.style.position !== 'absolute');
                    // Two classic inline-level bugs, seen from the DOM and the computed styles alone (the line layout
                    // itself stays Unknown below): whitespace between inline-blocks in the source is a space between
                    // them, and an inline image sits on the baseline with the descender's room under it (measured).
                    const inlineKids = flow.filter(child => child.style.$inlineLevel);
                    const fontless = ['0', '0px'].includes(String(style['font-size']));
                    // (Recorded from any pass: the line layout throws before the emitting one.)
                    if (inlineKids.length >= 2 && box.whitespace && !fontless && ['normal', 'nowrap', 'pre-line'].includes(String(style['white-space'])) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_INLINE_GAP' && w.path === box.path))
                      layoutWarnings.push({ code: 'W_LAYOUT_INLINE_GAP', severity: 'warning', box: box.label, path: box.path, items: inlineKids.map(c => c.box.label),
                        message: `${box.label} lays out ${inlineKids.map(c => c.box.label).join(', ')} as inline-level boxes, with whitespace between them in the markup: each gap is a space of ${box.label}'s font (about a quarter of its font-size), not a value you set. Use display: flex with gap on ${box.label} instead`, ...ranges(bs.region) });
                    for (const img of inlineKids.filter(c => c.box.tag === 'img' && String(c.style['vertical-align'] ?? 'baseline') === 'baseline'))
                      if (!fontless && !layoutWarnings.some(w => w.code === 'W_LAYOUT_IMAGE_BASELINE_GAP' && w.path === img.box.path))
                        layoutWarnings.push({ code: 'W_LAYOUT_IMAGE_BASELINE_GAP', severity: 'warning', box: img.box.label, path: img.box.path, parent: box.label,
                          message: `${img.box.label} is an inline image in ${box.label}: it sits on the text baseline, so ${box.label} is taller than the image by the font's descender (a few pixels of gap under it). Give ${img.box.label} display: block (or vertical-align: top)`, ...ranges(bs.region) });
                    for (const child of flow) if (child.style.$inlineLevel) throw Object.assign(new Error(`${child.box.label} is inline-level inside the block container ${box.label}: its line layout is not modeled (give it display: block, or make ${box.label} a grid or flex container)`), { code: 'U_LAYOUT_INLINE', box: child.box, region: children.region });
                    // Grid placement and self-alignment do nothing in block flow: laid out as auto, reported as inert.
                    // (justify-self is not inert: Chromium aligns block-level boxes by it — measured — which is not modeled.)
                    for (const child of flow) if (!['auto', 'normal', 'stretch', 'legacy'].includes(String(child.style['justify-self'] ?? 'auto'))) throw Object.assign(new Error(`${child.box.label}: justify-self: ${child.style['justify-self']} aligns a block-level box (CSS Box Alignment), which is not modeled`), { code: 'U_LAYOUT_CSS', box: child.box, region: children.region });
                    const inertDefaults = { 'grid-column': 'auto', 'grid-row': 'auto', 'align-self': 'auto' };
                    flow.forEach((child, k) => {
                      const written = Object.keys(inertDefaults).filter(key => child.style.$sources?.[key] && !['auto', 'normal', 'stretch'].includes(String(child.style[key])));
                      if (!written.length) return;
                      if (emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === child.box.path))
                        layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: child.box.label, path: child.box.path, properties: written,
                          css: written.map(key => ({ property: key, file: child.style.$sources[key].file, line: child.style.$sources[key].line, selector: child.style.$sources[key].selector })),
                          message: `${child.box.label}: ${written.map(key => `${key}: ${String(child.style[key]).replace(/^area:/, '')}`).join(', ')} ${written.length > 1 ? 'have' : 'has'} no effect (its parent ${box.label} is display: block, not grid or flex)`, ...ranges(children.region) });
                      const index = children.children.indexOf(child);
                      children.children[index] = { ...child, style: { ...child.style, ...Object.fromEntries(written.map(key => [key, inertDefaults[key]])) } };
                      flow[k] = children.children[index];
                    });
                    // Vertical margins collapse between adjacent siblings (the larger one wins; measured): the next
                    // sibling's top margin becomes max(previous bottom, its top) − previous bottom. Collapsing through the
                    // container (no padding or border on that side) or through an empty child is not modeled.
                    const mv = (child, side) => /^\d+(?:\.\d+)?px$/.test(String(child.style[`margin-${side}`])) ? px(child.style[`margin-${side}`]) : zero;
                    // A plain block child (not a formatting root, no padding or border on that side) lets its first
                    // (last) child's top (bottom) margin collapse through it: its own margin becomes the larger of the
                    // two, and it lays that grandchild out without it (collapsedTop / collapsedBottom). The grandchild's
                    // style must be the same across this region.
                    const zeroEdge = (st, side) => cmp(add(px(st[`padding-${side}`] === 'ua' ? '0' : st[`padding-${side}`]), px(st[`border-${side}`] === 'ua' ? '0' : st[`border-${side}`])), zero) === 0;
                    const plainBlock = st => st.display === 'block' && !['hidden', 'auto', 'scroll'].includes(String(st['overflow-x'])) && !['hidden', 'auto', 'scroll'].includes(String(st['overflow-y'])) && st.position === 'static';
                    flow.forEach((child, k) => {
                      if (!plainBlock(child.style) || child.box.text || !(child.box.children ?? []).length) return;
                      const childAncestors = [...ancestors, { box: child.box, style: child.style, inline: null, block: null, type: child.style['container-type'], names: [] }];
                      // The in-flow children of a box ({ box, style }), or null when one's style varies here.
                      const flowOf = (owner, ownerStyle, at) => {
                        const out = [];
                        for (const g of owner.children ?? []) {
                          let pieces;
                          try { pieces = styles(g, children.region, at, ownerStyle, false); } catch { return null; }
                          const keys = new Set(pieces.map(p => JSON.stringify([p.style.display, p.style.position, p.style['margin-top'], p.style['margin-bottom'], p.style['padding-top'], p.style['padding-bottom'], p.style['border-top'], p.style['border-bottom'], p.style['block-size'], p.style['overflow-x'], p.style['overflow-y']])));
                          if (keys.size !== 1) return null;
                          const st = pieces[0].style;
                          if (st.display !== 'none' && st.position !== 'absolute') out.push({ box: g, style: st });
                        }
                        return out;
                      };
                      const gm = (st, side) => /^\d+(?:\.\d+)?px$/.test(String(st[`margin-${side}`])) ? px(st[`margin-${side}`]) : zero;
                      // The margin that collapses out of a box on one side: its own and, through every plain block with
                      // no padding or border there (and an auto height, for the bottom), its first (last) child's
                      // (measured: several levels deep). null when that is not known.
                      const outward = (owner, st, at, side, depth) => {
                        const own = gm(st, side);
                        if (depth > 16 || !plainBlock(st) || owner.text || !(owner.children ?? []).length || !zeroEdge(st, side) || (side === 'bottom' && st['block-size'] !== 'auto')) return own;
                        const inner = [...at, { box: owner, style: st, inline: null, block: null, type: st['container-type'], names: [] }];
                        const kids = flowOf(owner, st, inner);
                        if (!kids) return null;
                        if (!kids.length || kids.some(k => /inline|contents|table/.test(String(k.style.display)))) return own;
                        const edge = side === 'top' ? kids[0] : kids.at(-1);
                        const theirs = outward(edge.box, edge.style, inner, side, depth + 1);
                        if (theirs === null) return null;
                        return cmp(theirs, own) > 0 ? theirs : own;
                      };
                      const updates = {};
                      const grand = flowOf(child.box, child.style, childAncestors);
                      if (!grand || grand.some(g => /inline|contents|table/.test(String(g.style.display)))) return;
                      const childOf = [...childAncestors];
                      for (const side of ['top', 'bottom']) {
                        if (!grand.length || !zeroEdge(child.style, side) || (side === 'bottom' && child.style['block-size'] !== 'auto')) continue;
                        const edge = side === 'top' ? grand[0] : grand.at(-1);
                        const theirs = outward(edge.box, edge.style, childOf, side, 1);
                        if (theirs === null) return;
                        if (cmp(theirs, zero) <= 0) continue;
                        const total = cmp(theirs, mv(child, side)) > 0 ? theirs : mv(child, side);
                        updates[`margin-${side}`] = cmp(total, zero) === 0 ? '0' : `${number(total)}px`; updates[side === 'top' ? '$collapsedTop' : '$collapsedBottom'] = true;
                      }
                      if (!Object.keys(updates).length) return;
                      const index = children.children.indexOf(child);
                      children.children[index] = { ...child, style: { ...child.style, ...updates } };
                      flow[k] = children.children[index];
                    });
                    // This container's own first/last child margins already moved out by its parent.
                    if (available.collapsedTop && flow.length) { const index = children.children.indexOf(flow[0]); children.children[index] = { ...flow[0], style: { ...flow[0].style, 'margin-top': '0' } }; flow[0] = children.children[index]; }
                    if (available.collapsedBottom && flow.length) { const index = children.children.indexOf(flow.at(-1)); children.children[index] = { ...flow.at(-1), style: { ...flow.at(-1).style, 'margin-bottom': '0' } }; flow[flow.length - 1] = children.children[index]; }
                    if (flow.some(child => cmp(add(mv(child, 'top'), mv(child, 'bottom')), zero) > 0)) {
                      const edge = side => cmp(add(px(style[`padding-${side}`] === 'ua' ? '0' : style[`padding-${side}`]), px(style[`border-${side}`] === 'ua' ? '0' : style[`border-${side}`])), zero) > 0;
                      const unknownCollapse = why => { throw Object.assign(new Error(`${box.label}: ${why}; that margin collapsing is not modeled`), { code: 'U_LAYOUT_CSS', box, region: children.region }); };
                      // A container that establishes a formatting context (a grid or flex item, overflow hidden/auto/
                      // scroll, absolute) keeps its children's margins inside it (measured): nothing collapses through.
                      const parentStyle = parents.at(-1)?.style;
                      // (The root element always establishes one.)
                      const formattingRoot = (!parents.length && box.documentRoot) || (parentStyle && ['grid', 'flex', 'inline-grid', 'inline-flex'].includes(parentStyle.display) && !parentStyle.$blockFlow) || ['hidden', 'auto', 'scroll'].includes(String(style['overflow-x'])) || ['hidden', 'auto', 'scroll'].includes(String(style['overflow-y'])) || style.position === 'absolute';
                      if (flow.length && cmp(mv(flow[0], 'top'), zero) > 0 && !edge('top') && !formattingRoot) unknownCollapse(`the top margin of ${flow[0].box.label} collapses through its container (no padding or border on top)`);
                      if (flow.length && cmp(mv(flow.at(-1), 'bottom'), zero) > 0 && !edge('bottom') && style['block-size'] === 'auto' && !formattingRoot) unknownCollapse(`the bottom margin of ${flow.at(-1).box.label} collapses through its container (no padding or border below, auto height)`);
                      for (const child of flow) if (cmp(add(mv(child, 'top'), mv(child, 'bottom')), zero) > 0 && !(child.box.children ?? []).length && !child.box.text && child.style['block-size'] === 'auto' && !['top', 'bottom'].some(side => cmp(px(child.style[`padding-${side}`] === 'ua' ? '0' : child.style[`padding-${side}`]), zero) > 0))
                        unknownCollapse(`${child.box.label} may be empty, so its own margins would collapse together`);
                      for (let i = 1; i < flow.length; i++) {
                        const previous = mv(flow[i - 1], 'bottom'), top = mv(flow[i], 'top'), adjusted = cmp(top, previous) > 0 ? sub(top, previous) : zero;
                        const index = children.children.indexOf(flow[i]);
                        children.children[index] = { ...flow[i], style: { ...flow[i].style, 'margin-top': cmp(adjusted, zero) === 0 ? '0' : `${number(adjusted)}px` } };
                        flow[i] = children.children[index];
                      }
                    }
                  }
                  if (plan.fitItems !== undefined) {
                    const flow = children.children.filter(child => child.style.position !== 'absolute');
                    if (flow.length !== plan.fitItems || flow.some(child => child.style['grid-column'] !== 'auto' || child.style['grid-row'] !== 'auto'))
                      throw Object.assign(new Error('repeat(auto-fit, …) is modeled only when every child is an auto-placed, single-cell item that renders'), { code: 'U_LAYOUT_CSS', region: children.region });
                  }
                  let placed;
                  // A grid-area name the parent's grid-template-areas does not define: a typo or a stale name. Chromium
                  // puts the item on implicit lines (outside the subset); the warning names it.
                  const areas = parseAreas(style['grid-template-areas']);
                  for (const child of children.children) for (const key of ['grid-row', 'grid-column']) {
                    const raw = String(child.style[key]), name = raw.startsWith('area:') ? raw.slice(5) : /^-?[A-Za-z_][\w-]*$/.test(raw) && !['auto', 'span'].includes(raw) ? raw : null;
                    if (name && !areas.areas.has(name) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_GRID_AREA_UNKNOWN' && w.path === child.box.path))
                      layoutWarnings.push({ code: 'W_LAYOUT_GRID_AREA_UNKNOWN', severity: 'warning', box: child.box.label, path: child.box.path, area: name, parent: box.label,
                        message: `${child.box.label} is placed in the grid area ${name}, but ${box.label}'s grid-template-areas ${areas.areas.size ? `defines only ${[...areas.areas.keys()].join(', ')}` : 'defines none'}: the browser puts it on new implicit tracks after the explicit grid`, ...ranges(children.region) });
                  }
                  try { placed = place(children.children.filter(child=>child.style.position!=='absolute'), columns.length, { subgridColumns: Boolean(sharedColumns), rows: inheritedAxes.block?.values.length, areas, dense: /dense/.test(String(style['grid-auto-flow'])), columnFlow: /^column/.test(String(style['grid-auto-flow'])), explicitRows: (() => { const v = String(style['grid-template-rows'] ?? 'none'); if (v === 'none' || v === 'subgrid' || /auto-(?:fill|fit)/.test(v)) return undefined; try { return expandTracks(v).length || undefined; } catch { return undefined; } })() }).map(item => ({ ...item, inherited: children.children.find(child => child.box === item.box).inherited })); }
                  catch (error) { error.region = children.region; throw error; }
                  const areaInline = item => trackArea(cs.values, columnGap, item.start, item.span);
                  // A grid item's px margins: the item is laid out in its area less them, offset by the start margins, and
                  // its margin box (block size plus margins) sizes auto rows. rtl with unequal inline margins and margins on
                  // subgrid items are not modeled.
                  const marginOf = (item, side) => /^\d+(?:\.\d+)?px$/.test(String(item.style[`margin-${side}`])) ? px(item.style[`margin-${side}`]) : zero;
                  const marginInline = item => add(marginOf(item, 'left'), marginOf(item, 'right')), marginBlock = item => add(marginOf(item, 'top'), marginOf(item, 'bottom'));
                  for (const item of placed) if (cmp(add(marginInline(item), marginBlock(item)), zero) !== 0) {
                    if (item.style['grid-template-columns'] === 'subgrid' || item.style['grid-template-rows'] === 'subgrid') throw Object.assign(new Error(`${item.box.label}: margins on a subgrid are not modeled`), { code: 'U_LAYOUT_SUBGRID', box: item.box });
                    if (style.direction === 'rtl' && cmp(marginOf(item, 'left'), marginOf(item, 'right')) !== 0) throw Object.assign(new Error(`${item.box.label}: unequal inline margins in rtl are not modeled`), { code: 'U_LAYOUT_CSS', box: item.box });
                  }
                  const itemInline = item => diff(areaInline(item), scalar(marginInline(item)));
                  // Inline auto margins of a grid item with an explicit width take the free space of its area (both: half
                  // each), and none of it when it is negative (start-aligned; measured). With an auto width the item
                  // would shrink to fit its content: Unknown.
                  const autoMargins = item => ['margin-left', 'margin-right'].some(key => item.style[key] === 'auto');
                  // In block flow an auto width fills the area, max-inline-size caps it, and the auto margins center it.
                  const blockFill = item => style.$blockFlow && String(item.style['inline-size']) === 'auto' && /^(?:none|\d+(?:\.\d+)?px)$/.test(String(item.style['max-inline-size']));
                  for (const item of placed) if (autoMargins(item) && !blockFill(item)) {
                    const w = String(item.style['inline-size']);
                    if (!/^\d+(?:\.\d+)?(?:px|%)$/.test(w) || (item.style['box-sizing'] === 'content-box' && ['left', 'right'].some(side => !/^(?:0|\d+(?:\.\d+)?px)$/.test(String(item.style[`padding-${side}`])) || !/^(?:0|ua|\d+(?:\.\d+)?px)$/.test(String(item.style[`border-${side}`])))) || style.direction === 'rtl')
                      throw Object.assign(new Error(`${item.box.label}: auto margins on a grid item are modeled only with a px or % width (ltr); with an auto width it shrinks to fit its content`), { code: 'U_LAYOUT_CSS', box: item.box });
                  }
                  // justify-self (or the grid's justify-items) start, center or end: the item keeps its own width and moves by
                  // that share of its area's free space, also when it is negative (Chromium aligns grid items unsafely:
                  // measured −90px for a 300px item at end in a 200px area). Its own width is a px width, or with an auto
                  // width a text leaf's fit-content width min(max-content, max(min-content, area)), capped by a px
                  // max-width. Anything else stays Unknown (finish).
                  const justifyShare = item => {
                    const own = String(item.style['justify-self'] ?? 'auto'), v = ['auto', 'normal'].includes(own) ? String(style['justify-items'] ?? 'normal') : own;
                    if (['start', 'flex-start', 'self-start'].includes(v) || (v === 'left' && style.direction !== 'rtl')) return zero;
                    if (v === 'center') return div(one, q(2));
                    if (['end', 'flex-end', 'self-end'].includes(v) || (v === 'right' && style.direction !== 'rtl')) return one;
                    return null;
                  };
                  const justified = (item, region) => {
                    const share = justifyShare(item);
                    if (share === null || style.$blockFlow || autoMargins(item) || style.direction === 'rtl') return null;
                    const st = item.style, pxOf = v => ['0', '0px'].includes(String(v)) ? zero : /^\d+(?:\.\d+)?px$/.test(String(v)) ? px(v) : null;
                    const sideEdges = ['left', 'right'].flatMap(side => [pxOf(st[`padding-${side}`]), pxOf(st[`border-${side}`])]);
                    if (sideEdges.includes(null)) return null;
                    const edgesInline = sideEdges.reduce(add, zero), area = itemInline(item);
                    const place = (r, w) => ({ region: r, offset: times(diff(area, w), share), inline: w });
                    if (/^\d+(?:\.\d+)?px$/.test(String(st['inline-size']))) { const w = scalar(st['box-sizing'] === 'content-box' ? add(px(st['inline-size']), edgesInline) : px(st['inline-size'])); return [place(region, w)]; }
                    const c = item.box.contract;
                    if (String(st['inline-size']) !== 'auto' || !item.box.text || (item.box.children ?? []).length || c?.minInlineSize === undefined || c?.maxInlineSize === undefined) return null;
                    const maxW = String(st['max-inline-size']) === 'none' ? null : pxOf(st['max-inline-size']);
                    if (maxW === null && String(st['max-inline-size']) !== 'none') return null;
                    let lo = add(q(String(c.minInlineSize)), edgesInline);
                    let hi = add(q(String(c.maxInlineSize)), edgesInline);
                    // max-width caps the fit-content width, its min-content end too (measured: a 260px max-width bubble
                    // with a 339px URL at justify-self: end is 260px wide at the end of its area; the URL overflows it).
                    if (maxW !== null) { const cap = st['box-sizing'] === 'content-box' ? add(maxW, edgesInline) : maxW; if (cmp(cap, hi) < 0) hi = cap; if (cmp(cap, lo) < 0) lo = cap; }
                    const out = [];
                    const wide = partition(region, diff(area, scalar(hi)), '>=');
                    for (const r of wide.yes) out.push(place(r, scalar(hi)));
                    for (const r of wide.no) { const mid = partition(r, diff(area, scalar(lo)), '>='); for (const m of mid.yes) out.push(place(m, area)); for (const m of mid.no) out.push(place(m, scalar(lo))); }
                    return out;
                  };
                  const autoOffsets = (item, region) => {
                    const aligned = justified(item, region);
                    if (aligned) return aligned.map(a => ({ ...a, justified: true }));
                    if (!autoMargins(item)) return [{ region, offset: scalar(0) }];
                    if (blockFill(item)) {
                      const max = String(item.style['max-inline-size']);
                      if (max === 'none') return [{ region, offset: scalar(0) }];
                      const free = diff(itemInline(item), scalar(px(max))), share = item.style['margin-left'] === 'auto' ? (item.style['margin-right'] === 'auto' ? div(one, q(2)) : one) : zero;
                      const split = partition(region, free, '>=');
                      return [...split.yes.map(r => ({ region: r, offset: times(free, share) })), ...split.no.map(r => ({ region: r, offset: scalar(0) }))];
                    }
                    const w = String(item.style['inline-size']), area = itemInline(item);
                    let outer = w.endsWith('%') ? times(areaInline(item), div(q(w.slice(0, -1)), q(100))) : scalar(px(w));
                    // The used width is the width clamped by max-width, then min-width (measured: width: 300px with
                    // min-width: 350px and margin-left: auto ends at the right edge 350px wide). px bounds on a px width only.
                    const minW = String(item.style['min-inline-size'] ?? 'auto'), maxW = String(item.style['max-inline-size'] ?? 'none');
                    if (!['auto', '0', '0px'].includes(minW) || maxW !== 'none') {
                      if (w.endsWith('%') || ![minW, maxW].every(v => ['auto', '0', '0px', 'none'].includes(v) || /^\d+(?:\.\d+)?px$/.test(v)) || item.style['box-sizing'] === 'content-box') throw Object.assign(new Error(`${item.box.label}: auto margins with a min-width or max-width are modeled for a px width and px bounds (border-box) only`), { code: 'U_LAYOUT_CSS', box: item.box });
                      let used = px(w);
                      if (/px$/.test(maxW) && cmp(px(maxW), used) < 0) used = px(maxW);
                      if (/px$/.test(minW) && cmp(px(minW), used) > 0) used = px(minW);
                      outer = scalar(used);
                    }
                    const extra = item.style['box-sizing'] === 'content-box' ? ['left', 'right'].flatMap(side => [item.style[`padding-${side}`], item.style[`border-${side}`]]).filter(v => v && !['0', 'ua'].includes(String(v))).reduce((acc, v) => add(acc, px(v)), zero) : zero;
                    const free = diff(area, sum(outer, scalar(extra)));
                    const share = item.style['margin-left'] === 'auto' ? (item.style['margin-right'] === 'auto' ? div(one, q(2)) : one) : zero;
                    const split = partition(region, free, '>=');
                    return [...split.yes.map(r => ({ region: r, offset: times(free, share) })), ...split.no.map(r => ({ region: r, offset: scalar(0) }))];
                  };
                  const childColumns = item => trackSlice(cs.values, columnGap, box, item.start, item.span);
                  // Block-axis self-alignment (align-self, or the grid's align-items): an item that is not stretched keeps its
                  // own height and is offset in its area by that share of the free space (CSS Box Alignment §6.1).
                  const gridAlign = item => { if (style.$blockFlow) return {}; const a = crossAlignment(style['align-items'], item.style['align-self']); return a === 'stretch' ? {} : { alignBlock: a }; };
                  if (!block) {
                    let endings = [children.region];
                    for (const item of placed) endings = bounded(endings.flatMap(r => solve(item.box, { inline: itemInline(item), percentInline: areaInline(item), tracks: { inline: childColumns(item) }, gridItem: true, ...(style.$blockFlow ? { blockFlowChild: true, ...(item.style.$collapsedTop ? { collapsedTop: true } : {}), ...(item.style.$collapsedBottom ? { collapsedBottom: true } : {}) } : {}), autoMargins: autoMargins(item), marginEnd: { inline: marginOf(item, 'right'), block: marginOf(item, 'bottom') }, fitInline: (box.contract?.overflow ?? 'fit') === 'fit' }, r, ancestors, item.inherited ?? style, emit).map(result => result.region)));
                    for (const r of endings) results.push(finish(box, style, r, inline, contentInline, null, null, available, parents, emit));
                    continue;
                  }
                  const rowCount = placed.length ? Math.max(...placed.map(item => item.row + item.rowSpan)) : 0;
                  const sharedRows = inheritedAxes.block;
                  let rows = sharedRows ? sharedRows.values.map(value => ({ definite: value })) : style['grid-template-rows'] === 'none' ? [] : tracks(style['grid-template-rows'], true);
                  const explicitRowCount = rows.length;
                  const implicit = sharedRows ? [] : tracks(style['grid-auto-rows'], true);
                  while (rows.length < rowCount) rows.push(implicit[(rows.length - explicitRowCount) % implicit.length]);
                  if (rows.length > 2048) throw new Error('Grid row limit exceeded');
                  const rowGap = gapSize(style['row-gap'], sharedRows), gaps = mul(rowGap, q(Math.max(0, rows.length - 1)));
                  for (const item of placed) if (rows.slice(item.row, item.row + item.rowSpan).some(row => row.auto || (!knownBlock && row.weight)) &&
                    (item.rowSpan > 1 || item.style['grid-template-rows'] === 'subgrid')) {
                    throw subgridError('Intrinsic row contributions across subgrids or row spans are not modeled; use independently sized parent rows', item.box, children.region, 'block');
                  }
                  let measurements = [{ region: children.region, bases: rows.map(row => row.definite ?? scalar(row.fixed ?? row.edges ?? zero)) }];
                  for (const item of placed.filter(item => rows[item.row].auto || rows[item.row].autoMin || (!knownBlock && rows[item.row].weight))) {
                    // In a bare fr row an item's minimum contribution is its min-height when set, or its edges for a
                    // scroll container (Grid §6.6); otherwise its measured height.
                    if (rows[item.row].autoMin) {
                      if ((item.rowSpan ?? 1) > 1) throw Object.assign(new Error(`${item.box.label} spans several rows, one of them a bare fr row; that is not modeled`), { code: 'U_LAYOUT_GRID_FR', box: item.box });
                      const st = item.style, pxOf = v => ['0', '0px'].includes(String(v)) ? zero : /^\d+(?:\.\d+)?px$/.test(String(v)) ? px(v) : null;
                      const edgesOf = ['top', 'bottom'].map(side => [pxOf(st[`padding-${side}`]), pxOf(st[`border-${side}`])]).flat();
                      let lower = null;
                      if (st['min-block-size'] !== 'auto') { const m = pxOf(st['min-block-size']); if (m === null || edgesOf.includes(null)) throw Object.assign(new Error(`${item.box.label}: min-height ${st['min-block-size']} in a bare fr row is not modeled`), { code: 'U_LAYOUT_GRID_FR', box: item.box }); lower = st['box-sizing'] === 'content-box' ? edgesOf.reduce(add, m) : m; }
                      else if (['hidden', 'auto', 'scroll'].includes(String(st['overflow-y']))) { if (edgesOf.includes(null)) throw Object.assign(new Error(`${item.box.label}: UA edges in a bare fr row are not modeled`), { code: 'U_LAYOUT_GRID_FR', box: item.box }); lower = edgesOf.reduce(add, zero); }
                      if (lower !== null) { const edgesTotal = edgesOf.includes(null) ? zero : edgesOf.reduce(add, zero); if (cmp(lower, edgesTotal) < 0) lower = edgesTotal; measurements = bounded(measurements.flatMap(m => maximum(m.region, m.bases[item.row], sum(scalar(lower), scalar(marginBlock(item)))).map(mx => ({ region: mx.region, bases: m.bases.map((v, i) => i === item.row ? mx.value : v) })))); continue; }
                    }
                    measurements = bounded(measurements.flatMap(m => (justified(item, m.region) ?? [{ region: m.region }]).flatMap(jr => solve(item.box, { inline: jr.inline ?? itemInline(item), ...(jr.inline ? { justifyHandled: true } : {}), percentInline: areaInline(item), tracks: { inline: childColumns(item) }, gridItem: true, ...(style.$blockFlow ? { blockFlowChild: true, ...(item.style.$collapsedTop ? { collapsedTop: true } : {}), ...(item.style.$collapsedBottom ? { collapsedBottom: true } : {}) } : {}), autoMargins: autoMargins(item) }, jr.region, ancestors, item.inherited ?? style, false).flatMap(measured => maximum(measured.region, m.bases[item.row], sum(measured.block, scalar(marginBlock(item)))).map(mx => ({ region: mx.region, bases: m.bases.map((v, i) => i === item.row ? mx.value : v) }))))));
                  }
                  for (const m of measurements) {
                    let fractions = [{ region: m.region, value: scalar(0) }];
                    if (!knownBlock) for (let i = 0; i < rows.length; i++) if (rows[i].weight) {
                      const divisor = cmp(rows[i].weight, one) > 0 ? rows[i].weight : one;
                      fractions = fractions.flatMap(f => maximum(f.region, f.value, times(m.bases[i], div(one, divisor))));
                    }
                    const layouts = sharedRows ? [{ region: m.region, values: sharedRows.values, required: trackArea(sharedRows.values, rowGap, 0, rows.length) }] : knownBlock ? flex(m.region, knownBlock, rows, gaps, m.bases, !['start', 'center', 'end'].includes(style['align-content'])) : fractions.map(f => {
                      const values = rows.map((row, i) => row.weight ? times(f.value, row.weight) : m.bases[i]);
                      return { region: f.region, values, required: sum(total(values), scalar(gaps)) };
                    });
                    // A block-flow container raised by min-block-size: its rows stay at the top (align-content: start).
                    for (const rs of layouts.flatMap(rs => minBlock && !knownBlock && style.$blockFlow ? minBlock(rs.region).flatMap(m => maximum(m.region, rs.required, m.value).map(x => ({ ...rs, region: x.region, raised: x.value }))) : [rs])) {
                      const contentBlock = knownBlock ?? rs.raised ?? rs.required, blockSize = sum(contentBlock, blockEdges);
                      const finalAncestors = [...parents, { ...own, block: contentBlock, paddingBlock:diff(blockSize,scalar(add(px(style['border-top']),px(style['border-bottom'])))) }];
                      // A scroll container's automatic minimum size is 0 (CSS Sizing 3 §4.5): in an auto row of a grid whose
                      // height is definite and too small, Chromium shrinks that row toward the item's padding instead of
                      // its content (measured), clipping the item's content. Row sizes there are not modeled: Unknown in the
                      // region where the rows overflow.
                      // (Block flow does not shrink them: block children keep their size and overflow — measured — which is
                      // what the rows here are.)
                      if (emit && knownBlock && !style.$blockFlow) {
                        const shrinking = placed.filter(item => rows[item.row]?.auto && ['overflow-x', 'overflow-y'].some(key => item.style[key] !== 'visible'));
                        const over = shrinking.length && clip(rs.region, diff(rs.required, knownBlock), true);
                        if (over) diagnostics.push({ code: 'U_LAYOUT_GRID_SHRINK', severity: 'unknown', box: box.label, path: box.path, source: box.source, items: shrinking.map(item => item.box.label),
                          message: `${box.label}'s auto rows need more than its height here, and ${shrinking.map(item => item.box.label).join(', ')} ${shrinking.length > 1 ? 'are scroll containers' : 'is a scroll container'} (overflow not visible), whose minimum size is 0: the browser shrinks those rows below their content, which is not modeled`, ...ranges(over) });
                      }
                      if (emit) obligation(contentBlock, rs.required, box, rs.region, 'E_LAYOUT_TRACKS', 'block', (box.contract?.overflowBlock ?? 'fit') === 'fit' && !scrolls(style, 'y'), () => explanation(sizeChain([...parents, { box, style }], 'block', { hostInset: options.hostBlockInset }), trackProperties('block').map(property => fact(box, style, property))));
                      let endings = [rs.region];
                      // align-content center/end (unstretched rows in a known height): the rows move by part of the free space.
                      // The free space is what the resolved rows leave (fr rows take it all, so they do not move; measured), not the
                      // rows' required minimum.
                      const rowsUsed = rs.values ? sum(total(rs.values), scalar(gaps)) : rs.required;
                      const blockLead = knownBlock && ['center', 'end'].includes(style['align-content']) ? times(diff(knownBlock, rowsUsed), style['align-content'] === 'center' ? div(one, q(2)) : one) : scalar(zero);
                      for (const item of placed) endings = bounded(endings.flatMap(r0 => autoOffsets(item, r0)).flatMap(({ region: r, offset: autoLead, inline: alignedInline, justified }) => solve(item.box, { inline: alignedInline ?? itemInline(item), ...(justified ? { justifyHandled: true } : {}), block: diff(trackArea(rs.values, rowGap, item.row, item.rowSpan), scalar(marginBlock(item))), ...gridAlign(item), percentInline: areaInline(item), percentBlock: trackArea(rs.values, rowGap, item.row, item.rowSpan), gridItem: true, ...(style.$blockFlow ? { blockFlowChild: true, ...(item.style.$collapsedTop ? { collapsedTop: true } : {}), ...(item.style.$collapsedBottom ? { collapsedBottom: true } : {}) } : {}), autoMargins: autoMargins(item), marginEnd: { inline: marginOf(item, 'right'), block: marginOf(item, 'bottom') },
                        origin:cs.shift ? offset(contentOrigin,sum(sum(sum(sum(trackStart(cs.values,columnGap,item.start),cs.shift.lead),times(cs.shift.extra,q(item.start))),scalar(marginOf(item, 'left'))),autoLead),sum(sum(trackStart(rs.values,rowGap,item.row),blockLead),scalar(marginOf(item, 'top')))) : null,
                        tracks: { inline: childColumns(item), block: trackSlice(rs.values, rowGap, box, item.row, item.rowSpan) },
                        fitInline: (box.contract?.overflow ?? 'fit') === 'fit', fitBlock: (box.contract?.overflowBlock ?? 'fit') === 'fit' }, r, finalAncestors, item.inherited ?? style, emit).map(result => result.region)));
                      for (const item of children.children.filter(child=>child.style.position==='absolute')) endings = bounded(endings.flatMap(r => {
                        // position: fixed: the viewport is the containing block, unless an ancestor transform (or a clip or
                        // scroll that would move it relative to the page) intervenes, which is not modeled.
                        if (item.style.$fixed) {
                          // An ancestor transform makes that ancestor the containing block of fixed descendants (CSS Transforms 1
                          // §2): the box is placed against it and scrolls with it instead of staying on the viewport.
                          const trap = finalAncestors.findLast(ancestor => ancestor.style && containsFixed(ancestor.style) && ancestor.box);
                          // The trap is a likely bug (a toast or modal meant for the viewport, placed against a header or a
                          // card): a warning besides the Unknown, so it is not only a not-checked line.
                          if (trap && !layoutWarnings.some(w => w.code === 'W_LAYOUT_FIXED_TRAPPED' && w.path === item.box.path)) layoutWarnings.push({ code: 'W_LAYOUT_FIXED_TRAPPED', severity: 'warning', box: item.box.label, path: item.box.path, ancestor: trap.box.label,
                            message: `${item.box.label} is position: fixed, but ${trap.box.label} (${trap.style.transform !== 'none' ? `transform: ${trap.style.transform}` : trap.style['backdrop-filter'] !== 'none' ? `backdrop-filter: ${trap.style['backdrop-filter']}` : `will-change: ${trap.style['will-change']}`}) becomes its containing block: it is placed against ${trap.box.label} and moves with it instead of staying on the viewport. Render it outside that box (a portal to the end of body), or drop the property`, ...ranges(r) });
                          if (trap) throw Object.assign(new Error(`${item.box.label} is position: fixed, but its ancestor ${trap.box.label} has ${trap.style.transform !== 'none' ? `transform: ${trap.style.transform}` : trap.style['backdrop-filter'] !== 'none' ? `backdrop-filter: ${trap.style['backdrop-filter']}` : `will-change: ${trap.style['will-change']}`}, which makes it the containing block: ${item.box.label} is placed against ${trap.box.label} and scrolls with it, not with the viewport. Move it outside that box (for example to the end of body), or drop the property`), { code: 'U_LAYOUT_FIXED_CONTAINED', box: item.box, region: r, ancestor: trap.box.label, ancestorPath: trap.box.path, property: 'transform' });
                          if (finalAncestors.some(ancestor=>ancestor.clipped || ancestor.subgrid || (ancestor.style && (containsFixed(ancestor.style) || ['overflow-x','overflow-y'].some(key=>ancestor.style[key] !== 'visible'))))) throw Object.assign(new Error(`${item.box.label} is position: fixed inside a transformed, clipped or scrolling ancestor`), { code: 'U_LAYOUT_CSS' });
                          const viewport = { inline: width, block: height, origin: { inline: scalar(0), block: scalar(0) } };
                          return solve(item.box,{inline:viewport.inline,block:viewport.block,containingBlock:{path:'viewport',...viewport}},r,finalAncestors,item.inherited ?? style,emit).map(result=>result.region);
                        }
                        const containing = finalAncestors.findLast(ancestor=>ancestor.positioned);
                        // No positioned (or transformed) ancestor: the initial containing block — the viewport's size at the
                        // top of the page — places it (CSS 2 §10.1), and it scrolls with the page. Usually a missing
                        // position: relative on the box it was meant to sit in (a badge that jumps to the page corner).
                        // A clipping or scrolling ancestor in between (does it clip the box?) stays Unknown.
                        if (!containing && height && !finalAncestors.some(ancestor=>ancestor.clipped || ancestor.subgrid || (ancestor.style && ['overflow-x','overflow-y'].some(key=>ancestor.style[key] !== 'visible')))) {
                          const parent = finalAncestors.at(-1)?.box;
                          if (emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_ABSOLUTE_PAGE' && w.path === item.box.path)) layoutWarnings.push({ code: 'W_LAYOUT_ABSOLUTE_PAGE', severity: 'warning', box: item.box.label, path: item.box.path, ...(parent ? { parent: parent.label } : {}),
                            message: `${item.box.label} is position: absolute with no positioned ancestor, so it is placed against the page (the initial containing block), not ${parent ? parent.label : 'its parent'}. Give the box it belongs to position: relative`, ...ranges(r) });
                          const initial = { inline: width, block: height, origin: { inline: scalar(0), block: scalar(0) } };
                          return solve(item.box,{inline:initial.inline,block:initial.block,containingBlock:{path:'initial',...initial}},r,finalAncestors,item.inherited ?? style,emit).map(result=>result.region);
                        }
                        // A containing block that hides its overflow (overflow: hidden, not scrolling) clips the box at its
                        // padding box: the box is laid out as usual, and what reaches past that edge is cut off
                        // (E_LAYOUT_ABSOLUTE_CLIPPED). Any other clipping ancestor stays Unknown.
                        const clipping = finalAncestors.filter(ancestor => ancestor.clipped);
                        const ownClip = clipping.length === 1 && clipping[0] === finalAncestors.at(-1) && ['hidden', 'visible'].includes(clipping[0].style?.['overflow-x']) && ['hidden', 'visible'].includes(clipping[0].style?.['overflow-y']);
                        // A scroll container that is the containing block: the box is placed against its padding box at
                        // scroll offset 0 and scrolls with the content (what reaches past the end extends the scrollable
                        // area instead of being cut off). Its size is known; its position, like the content's, only at
                        // offset 0 (scroll-zero), so it has none otherwise.
                        const ownScroll = clipping.length === 1 && clipping[0] === finalAncestors.at(-1) && containing === clipping[0] && [clipping[0].style?.['overflow-x'], clipping[0].style?.['overflow-y']].every(v => ['auto', 'scroll', 'hidden', 'visible'].includes(String(v))) && !ownClip;
                        if (!containing?.paddingBlock || containing.subgrid || (clipping.length && !ownClip && !ownScroll)) throw new Error('Absolute boxes require an owned non-scrolling, unclipped containing block without subgrid placement');
                        if (ownClip) containing.clips = { box: clipping[0].box.label, x: clipping[0].style['overflow-x'] === 'hidden', y: clipping[0].style['overflow-y'] === 'hidden' };
                        return solve(item.box,{inline:containing.paddingInline,block:containing.paddingBlock,
                          containingBlock:{path:containing.box.path,inline:containing.paddingInline,block:containing.paddingBlock,origin:containing.paddingOrigin,...(containing.clips ? { clips: containing.clips } : {})}},r,finalAncestors,item.inherited ?? style,emit).map(result=>result.region);
                      }));
                      for (const r of endings) results.push(finish(box, style, r, inline, contentInline, blockSize, contentBlock, available, parents, emit));
                    }
                  }
                }
              }
              }
            }
          }
        }
        }
      }
    } catch (error) {
      if (error.code?.startsWith('E_LAYOUT_')) issue(error.code, error.message, error.box ?? box, error.region ?? region, error.axis);
      else if (error.code === 'U_LAYOUT_FIXED_CONTAINED') diagnostics.push({ code: error.code, severity: 'unknown', message: error.message, box: error.box.label, path: error.box.path, source: error.box.source, ancestor: error.ancestor, ancestorPath: error.ancestorPath, property: error.property, ...ranges(error.region) });
      else if (error.code === 'U_LAYOUT_SUBGRID') diagnostics.push({ code: error.code, severity: 'unknown', message: error.message, box: error.box.label, path: error.box.path, source: error.box.source, axis: error.axis, ...ranges(error.region) });
      else unknown(error.code?.startsWith('U_LAYOUT_') ? error.code : 'U_LAYOUT_GEOMETRY', error.message, error.css?.line, error.box ?? box,error.css?.file);
    }
    return results;
  }
  if (!diagnostics.length) {
    try {
      let environments = [{ region: initial, style: undefined, paint: [] }];
      for (let i = 0; i < (options.ancestors ?? []).length; i++) {
        const ancestor = options.ancestors[i];
        const host = { ...ancestor, classes: ancestor.classes ?? [], documentRoot: i === 0 && ancestor.tag === 'html', label: `ancestor:${ancestor.tag}`, path: `ancestor/${i}` };
        environments = bounded(environments.flatMap(environment => styles(host, environment.region, [], environment.style, false, false).map(state => ({ ...state, paint: [...environment.paint, paintFacts(state.style)] })).filter(state => {
          if (state.style.display === 'none') { unknown('U_LAYOUT_ANCESTOR', 'A hidden ancestor cannot provide the declared containing sizes', undefined, host); return false; }
          if (state.style['container-type'] === 'normal') return true;
          unknown('U_LAYOUT_ANCESTOR', 'Query containers need size geometry; include this ancestor in the analyzed template', undefined, host); return false;
        })));
      }
      for (const environment of environments) (ancestorPaint = environment.paint ?? [], solve(root, { root: true,origin:{inline:scalar(0),block:scalar(0)}, inline: diff(width, scalar(options.hostInset ?? 0)), block: block && options.viewport.height ? diff(height, scalar(options.hostBlockInset ?? 0)) : null }, environment.region, [], environment.style));
    } catch (error) { unknown(error.code?.startsWith('U_LAYOUT_') ? error.code : 'U_LAYOUT_ANCESTOR', error.message,error.css?.line,undefined,error.css?.file); }
  }
  // Preserve compact one-dimensional diagnostics; 2-D regions retain correlated constraints.
  findings.sort((a, b) => a.signature.localeCompare(b.signature) || a.range.min - b.range.min);
  const merged = [];
  for (const finding of findings) {
    const previous = merged.at(-1);
    if (!block && previous?.signature === finding.signature && previous.range.maxExact === finding.range.minExact && (previous.range.maxInclusive || finding.range.minInclusive)) previous.range = { ...previous.range, max: finding.range.max, maxExact: finding.range.maxExact, maxInclusive: finding.range.maxInclusive };
    else merged.push({ ...finding });
  }
  diagnostics.push(...merged.map(({ signature, ...finding }) => finding));
  let integrityWarnings = [], integrityExempted = [], accessibilityWarnings = [], accessibilityNotes = [], accessibilityExempted = [];
  if (options.integrity && !untransformed && hovered === undefined && !options.$animationFrame && !options.$slideVariant && !diagnostics.some(d => d.severity === 'unknown')) {
    const judged = judgeIntegrity({ geometry, waived }, { block, targetSize: options.integrity.targetSize ?? 24, protrusion: options.integrity.protrusion ?? 'all', ranges });
    diagnostics.push(...judged.findings);
    integrityWarnings = judged.warnings; integrityExempted = judged.exempted;
  }
  if (options.accessibility && !untransformed && hovered === undefined && !options.$animationFrame && !options.$slideVariant && !diagnostics.some(d => d.severity === 'unknown')) {
    const judged = judgeAccessibility({ geometry, waived, root, domain: initial }, { scrollZero: preferences.includes('scroll-zero'), defaultColors: options.defaultColors && !preferences.includes('prefers-color-scheme:dark') && !rules.some(rule => rule.declarations.some(d => d.property === 'color-scheme' && /dark/.test(String(d.value)))) ? { canvas: '#ffffff', canvastext: '#000000' } : null, forcedColorsHandled: rules.some(rule => rule.preferences?.some(p => p.feature === 'forced-colors')), smoothReduced: rules.some(rule => rule.declarations.some(d => d.property === 'scroll-behavior') && (rule.preferences?.some(p => p.feature === 'prefers-reduced-motion'))), keyframeFrames, hostInset: options.hostInset ?? 0, hostBlockInset: options.hostBlockInset ?? 0, viewportBlock: block && options.viewport.height ? height : null, scrollPaddingDeclared: rules.some(rule => rule.declarations.some(d => /^scroll-padding-(?:top|bottom)$/.test(d.property))), viewportMin: options.viewport.min, contrast: options.accessibility.contrast ?? 'AA', targetLevel: options.accessibility.targetLevel ?? 'AA', targetSize: options.accessibility.targetSize ?? (options.accessibility.targetLevel === 'AAA' ? 44 : 24), ranges, block });
    diagnostics.push(...judged.findings, ...judged.unknowns);
    // Dark color scheme: when the CSS has prefers-color-scheme: dark rules, the contrast rules run
    // again with them (paint only, so the geometry is the same). System colors stay the light ones:
    // the color-scheme property is outside the subset.
    if (pristine && rules.some(rule => rule.preferences?.some(p => p.feature === 'prefers-color-scheme' && p.value === 'dark') || rule.declarations.some(d => d.property === 'color-scheme' && /\bdark\b/.test(d.value) && /\blight\b/.test(d.value)))) {
      const dark = analyzeBoxTree(pristine, { ...options, integrity: undefined }, scrollbarProfile, budget, inlineSheets, [], ['prefers-color-scheme:dark']);
      const contrastCodes = new Set(['E_A11Y_CONTRAST', 'U_A11Y_CONTRAST', 'E_A11Y_STATE_CONTRAST', 'E_A11Y_LINK_IN_TEXT', 'U_A11Y_LINK_IN_TEXT', 'E_A11Y_FOCUS_VISIBLE']);
      // A finding that holds in both schemes is reported once, with `alsoUnder`.
      const same = (a, b) => a.code === b.code && a.path === b.path && a.message === b.message && JSON.stringify([a.range, a.heightRange, a.regionConstraints, a.state]) === JSON.stringify([b.range, b.heightRange, b.regionConstraints, b.state]);
      for (const d of dark.diagnostics.filter(d => contrastCodes.has(d.code))) {
        const light = diagnostics.find(l => same(l, d));
        if (light) light.alsoUnder = [...(light.alsoUnder ?? []), 'prefers-color-scheme: dark'];
        else diagnostics.push({ ...d, preference: 'prefers-color-scheme: dark', message: `${d.message} (prefers-color-scheme: dark)` });
      }
    }
    // Text inside a scroll container under a box painted over it (U_A11Y_SCROLLED_COVER): laid out again at scroll offset
    // 0, the page's initial view, where positions inside are exact. A text start or first line hidden there is an error
    // at the initial scroll position; the other offsets stay Unknown.
    const scrolledCovers = diagnostics.filter(d => d.code === 'U_A11Y_SCROLLED_COVER');
    const alignedScroller = geometry.some(row => row.overflow === 'scroll' && row.alignsContent && !row.box.documentRoot);
    if (pristine && (scrolledCovers.length || alignedScroller)) {
      const zero = analyzeBoxTree(pristine, { ...options, integrity: undefined }, scrollbarProfile, budget, inlineSheets, [], ['scroll-zero']);
      // Content before a scroll container's start edge (any scroll offset: it never scrolls there).
      for (const d of zero.diagnostics.filter(d => d.code === 'E_A11Y_SCROLL_START_UNREACHABLE'))
        if (!diagnostics.some(x => x.code === d.code && x.path === d.path && x.edge === d.edge && JSON.stringify([x.range, x.heightRange]) === JSON.stringify([d.range, d.heightRange]))) diagnostics.push(d);
      // The scroll range from offset 0: the end of a scroller's content covered at every offset.
      for (const d of zero.diagnostics.filter(d => d.code === 'E_A11Y_SCROLL_END_COVERED'))
        if (scrolledCovers.some(u => d.path.startsWith(`${u.path}/`) && u.cover === d.cover) && !diagnostics.some(x => x.code === d.code && x.path === d.path && JSON.stringify([x.range, x.heightRange]) === JSON.stringify([d.range, d.heightRange]))) diagnostics.push(d);
      for (const d of zero.diagnostics.filter(d => ['E_A11Y_TEXT_START_OBSCURED', 'E_A11Y_TEXT_LINE_OBSCURED'].includes(d.code)))
        if (scrolledCovers.some(u => d.path.startsWith(`${u.path}/`) && u.cover === d.cover) && !diagnostics.some(x => x.code === d.code && x.path === d.path && JSON.stringify([x.range, x.heightRange, x.regionConstraints]) === JSON.stringify([d.range, d.heightRange, d.regionConstraints])))
          diagnostics.push({ ...d, scrollOffset: 0, message: `${d.message} (at the initial scroll position of ${scrolledCovers.find(u => d.path.startsWith(`${u.path}/`)).box}; other scroll offsets are not checked)` });
    }
    // Focus rules that change layout: each focusable box they can reach is laid out again focused, and the geometric
    // focus findings for that box come from that layout instead of the unfocused one.
    if (pristine && rules.some(rule => rule.stateLayout)) {
      const geometricFocus = new Set(['E_A11Y_FOCUS_OBSCURED', 'E_A11Y_FOCUS_OFFSCREEN', 'E_A11Y_FOCUS_CLIPPED', 'E_A11Y_FOCUS_SCROLLED_UNDER', 'E_A11Y_FOCUS_AREA', 'E_A11Y_FOCUS_CLIPPED_AWAY']);
      const layoutRules = rules.filter(rule => rule.stateLayout);
      const all = []; (function walk(box, chain) { all.push({ box, chain }); for (const child of box.children ?? []) walk(child, [...chain, box]); })(root, []);
      const reached = ({ box, chain }) => layoutRules.some(rule => rule.selectors.some(selector => (selector.state !== 'focus-within' && matches(selector, box, new Set(['focus', 'focus-visible', 'focus-within']))) || (selector.state === 'focus-within' && [...chain, box].some(a => matches(selector, a, new Set(['focus-within']))))));
      for (const entry of all.filter(entry => focusableBox(entry.box) && reached(entry))) {
        const focused = analyzeBoxTree(pristine, { ...options, integrity: undefined }, scrollbarProfile, budget, inlineSheets, [], [`focus-at:${entry.box.path}`]);
        for (let i = diagnostics.length - 1; i >= 0; i--) if (diagnostics[i].path === entry.box.path && geometricFocus.has(diagnostics[i].code)) diagnostics.splice(i, 1);
        if (focused.status === 'unknown') { diagnostics.push({ code: 'U_A11Y_FOCUS_LAYOUT', severity: 'unknown', message: `${entry.box.label}: its focused layout is not decided (${focused.diagnostics.find(d => d.severity === 'unknown')?.message ?? 'unknown'})`, box: entry.box.label, path: entry.box.path, rule: 'focus-obscured' }); continue; }
        for (const d of focused.diagnostics.filter(d => d.path === entry.box.path && geometricFocus.has(d.code))) diagnostics.push({ ...d, message: `${d.message} (in its focused layout)`, focusedLayout: true });
        // Boxes the focused layout moves (a :focus border or padding that changes size): Layout Instability excuses
        // shifts right after a key press, but the content still jumps under the keyboard user. Compared like hover.
        const rect = row => row.layoutRect !== undefined ? row.layoutRect : row.rect;
        const r = v => { const [n, d = '1'] = String(v ?? '0').split('/'); return div(q(n), q(d)); };
        const at = (a, w, h) => add(add(r(a.constant), mul(r(a.coefficient), w)), mul(r(a.heightCoefficient), h));
        for (const row of sizes) {
          if (layoutWarnings.some(w => w.code === 'W_LAYOUT_FOCUS_SHIFT' && w.path === row.path && w.focusedPath === entry.box.path) || !rect(row) || !row.$shown?.region) continue;
          for (const other of focused.sizes.filter(o => o.path === row.path && rect(o) && o.$shown?.region)) {
            const shared = intersect(row.$shown.region, other.$shown.region);
            if (!shared) continue;
            const moved = ['inlineStart', 'blockStart'].flatMap(field => shared.vertices.map(v => ({ field, v, delta: sub(at(rect(other)[field], v.x, v.y), at(rect(row)[field], v.x, v.y)) })).filter(c => cmp(c.delta, zero) !== 0).slice(0, 1));
            if (!moved.length) continue;
            const { field, v, delta } = moved[0];
            layoutWarnings.push({ code: 'W_LAYOUT_FOCUS_SHIFT', severity: 'warning', box: row.box, path: row.path, focused: entry.box.label, focusedPath: entry.box.path, field, delta: exact(delta),
              message: `Focusing ${entry.box.label} moves ${row.box} (${field} by ${number(delta)}px at viewport ${number(v.x)}px${block ? ` × ${number(v.y)}px` : ''}): the content jumps as the keyboard user tabs. Draw the focus with outline or box-shadow, or keep the size (border-color instead of border-width)` });
            break;
          }
        }
      }
    }
    // Profile: drop the rules outside it; every accessibility row carries its usefulness tier.
    const keep = accessibilityProfiles[options.accessibility.profile ?? 'all'];
    if (!keep) throw Object.assign(new Error(`Unknown accessibility profile ${options.accessibility.profile}`), { code: 'U_LAYOUT_OPTIONS' });
    const tiered = list => list.filter(d => !d.rule || keep(d.rule)).map(d => d.rule ? { ...d, tier: ruleTier(d.rule) } : d);
    const kept = diagnostics.flatMap(d => d.rule && accessibilityRules.includes(d.rule) ? tiered([d]) : [d]);
    diagnostics.length = 0; diagnostics.push(...kept);
    accessibilityWarnings = tiered(judged.warnings); accessibilityNotes = judged.notes; accessibilityExempted = judged.exempted;
  }
  // accessible-name from the markup alone, where the layout is Unknown (and the geometric checks did not run): a button
  // or link with no text, no image text and no naming attribute has no name whatever its geometry. It is reported
  // only when no CSS rule could hide it (display: none, visibility hidden/collapse, content-visibility: hidden) or
  // give it generated text (content), and no ancestor hides it from the accessibility tree.
  else if (options.accessibility && !untransformed && hovered === undefined && !options.$animationFrame && !options.$slideVariant
    && !rules.some(rule => rule.declarations.some(d => d.property === 'content' || (d.property === 'display' && String(d.value) === 'none') || (d.property === 'visibility' && /hidden|collapse/.test(String(d.value))) || (d.property === 'content-visibility' && String(d.value) === 'hidden')))) {
    const speaks = box => box.text || box.inline?.length || (box.textContent ?? '').trim() || (box.tag === 'img' && (box.alt ?? '').trim()) || box.alt === undefined && box.tag === 'img' || (box.tag === 'svg' && box.named) || (box.children ?? []).some(speaks) || (box.inline ?? []).some(speaks);
    // label elements by for= (a field is labelled by a wrapping label or label[for=id] whose text is present).
    const labelsFor = new Map(); (function collect(box) { if (box.tag === 'label' && box.labelFor) labelsFor.set(box.labelFor, [...(labelsFor.get(box.labelFor) ?? []), box]); for (const child of [...(box.children ?? []), ...(box.inline ?? [])]) collect(child); })(root);
    const labelSpeaks = (label, field) => label.text || (label.textContent ?? '').trim() || [...(label.children ?? []), ...(label.inline ?? [])].some(child => child !== field && speaks(child));
    const fieldOf = box => ['select', 'textarea'].includes(box.tag) || (box.tag === 'input' && !['hidden', 'submit', 'reset', 'button', 'image'].includes(box.inputType));
    const widget = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'slider', 'spinbutton', 'textbox', 'searchbox', 'combobox', 'treeitem', 'gridcell']);
    const owners = { option: ['listbox'], treeitem: ['tree'], gridcell: ['grid', 'treegrid'], menuitem: ['menu', 'menubar'], menuitemcheckbox: ['menu', 'menubar'], menuitemradio: ['menu', 'menubar'] };
    const roleOfBox = box => box.role && box.role !== 'dynamic' ? box.role.split(/\s+/)[0] : undefined;
    const walk = (box, hidden, wrappingLabel = null, ancestorsRoles = []) => {
      // UA-hidden: a popover (closed until shown), a dialog that is not open, and a closed details' content.
      const gone = hidden || box.ariaHidden || box.hiddenAttr || box.inert || box.popover || (box.tag === 'dialog' && box.dialogOpen !== true) || box.tag === 'template';
      const control = !box.pseudo && (box.tag === 'button' || (box.tag === 'a' && box.focusable !== false && box.href !== undefined));
      // An exposed img without an alt attribute (role none/presentation or aria-hidden take it out of the tree).
      if (box.tag === 'img' && !box.pseudo && !gone && box.alt === undefined && !['none', 'presentation'].includes(String(box.role ?? '').split(/\s+/)[0]))
        diagnostics.push({ code: 'E_A11Y_IMAGE_ALT', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'image-alt', ...ranges(initial),
          message: `${box.label} has no alt; use alt="" if it is decorative (checked from the markup; the layout was not analysed)` });
      if (control && !gone && !box.named && !box.labelledBy && !speaks(box))
        diagnostics.push({ code: 'E_A11Y_NAME', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'accessible-name', ...ranges(initial),
          message: `${box.label} has no accessible name: no text, no image text and no aria-label, aria-labelledby or title (checked from the markup; the layout was not analysed)` });
      // form-label: a field with no aria name and no label with text (label[for] or a wrapping label).
      if (!box.pseudo && !gone && fieldOf(box) && box.named !== 'dynamic' && box.inputType !== 'dynamic' && !labelsFor.has('dynamic')) {
        const labelled = box.named === true || (wrappingLabel && labelSpeaks(wrappingLabel, box)) || (box.id && (labelsFor.get(box.id) ?? []).some(l => labelSpeaks(l, box)));
        if (!labelled && !box.labelledBy) diagnostics.push(box.placeholder
          ? { code: 'W_A11Y_PLACEHOLDER_LABEL', severity: 'warning', box: box.label, path: box.path, source: box.source, rule: 'form-label', ...ranges(initial), message: `${box.label} is named only by its placeholder, which disappears on input (checked from the markup; the layout was not analysed)` }
          : { code: 'E_A11Y_LABEL', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'form-label', ...ranges(initial), message: `${box.label} has no label: add a visible <label>, aria-label, aria-labelledby or title (checked from the markup; the layout was not analysed)` });
      }
      // interactive-role-focusable: a widget role on an element that cannot take focus (items of a composite widget get it
      // from their owner).
      const role = roleOfBox(box);
      if (!box.pseudo && !gone && role && widget.has(role) && !(owners[role] ?? []).some(o => ancestorsRoles.includes(o))
        && !(box.focusable === true || box.tabIndex >= 0 || ['button', 'input', 'select', 'textarea'].includes(box.tag) || (box.tag === 'a' && box.href !== undefined && box.focusable !== false)))
        diagnostics.push({ code: 'E_A11Y_ROLE_FOCUS', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'interactive-role-focusable', ...ranges(initial), message: `${box.label} has role ${role} but cannot take focus; add tabindex="0" (checked from the markup; the layout was not analysed)` });
      for (const child of [...(box.children ?? []), ...(box.inline ?? [])]) walk(child, gone || (box.tag === 'details' && box.detailsOpen !== true && child.tag !== 'summary'), box.tag === 'label' ? box : wrappingLabel, role ? [...ancestorsRoles, role] : ancestorsRoles);
    };
    walk(root, false);
  }
  // Layout rectangles: a transform moves the painted box but not the layout box (a layout shift ignores it; measured
  // in docs/cls-evaluation.md). With a transform anywhere, every row's layoutRect comes from the untransformed
  // re-layout, matched by path and condition region; a row without a match gets layoutRect null (not decided).
  if (pristine && sawTransform && !diagnostics.some(d => d.severity === 'unknown')) {
    const plain = analyzeBoxTree(pristine, options, scrollbarProfile, budget, inlineSheets, [], [...preferences, 'untransformed']);
    // Rows correspond by path and condition polygon (its vertices; constraints may repeat redundant bounds).
    const key = row => JSON.stringify([row.path, row.range, row.heightRange, row.region?.vertices]);
    const byKey = new Map();
    if (plain.status !== 'unknown') for (const row of plain.sizes) byKey.set(key(row), byKey.has(key(row)) ? null : row);
    for (const row of sizes) { const match = byKey.get(key(row)); row.layoutRect = match?.rect ?? null; }
  }
  // Layout shifts from :hover rules that change layout: each box such a rule matches is hovered in a re-layout, and
  // every box's layout start position (inlineStart, blockStart) is compared on the same condition region. An affine
  // difference vanishes on a convex region exactly when it vanishes at its vertices, so the check is exact.
  if (pristine && hovered === undefined && !options.$animationFrame && !options.$slideVariant && rules.some(rule => rule.hoverLayout) && !diagnostics.some(d => d.severity === 'unknown')) {
    const hoverRules = rules.filter(rule => rule.hoverLayout);
    const targets = []; (function walk(box) { if (hoverRules.some(rule => rule.selectors.some(selector => matches(selector, box, new Set(['hover']))))) targets.push(box); for (const child of box.children ?? []) walk(child); })(root);
    // Rows correspond by path and condition polygon (its vertices; constraints may repeat redundant bounds).
    const key = row => JSON.stringify([row.path, row.range, row.heightRange, row.region?.vertices]);
    const rect = row => row.layoutRect !== undefined ? row.layoutRect : row.rect;
    const r = v => { const [n, d = '1'] = String(v ?? '0').split('/'); return div(q(n), q(d)); };
    const at = (a, w, h) => add(add(r(a.constant), mul(r(a.coefficient), w)), mul(r(a.heightCoefficient), h));
    for (const target of targets.slice(0, 64)) {
      const hover = analyzeBoxTree(pristine, options, scrollbarProfile, budget, inlineSheets, [], [`hover-at:${target.path}`]);
      if (hover.status === 'unknown') { diagnostics.push({ code: 'U_LAYOUT_HOVER_SHIFT', severity: 'unknown', message: `${target.label}: its hovered layout is not decided (${hover.diagnostics.find(d => d.severity === 'unknown')?.message ?? 'unknown'})`, box: target.label, path: target.path }); continue; }
      // Each base row against each hovered row of the same box, on the intersection of their condition regions.
      const undecided = [...sizes, ...hover.sizes].find(row => !rect(row) || !row.$shown?.region);
      if (undecided) { diagnostics.push({ code: 'U_LAYOUT_HOVER_SHIFT', severity: 'unknown', message: `${target.label}: the hovered layout of ${undecided.box} cannot be compared (it has no layout rectangle)`, box: target.label, path: target.path }); continue; }
      const reported = new Set();
      for (const row of sizes) for (const other of hover.sizes.filter(o => o.path === row.path)) {
        const shared = intersect(row.$shown.region, other.$shown.region);
        if (!shared || reported.has(row.path)) continue;
        const moved = ['inlineStart', 'blockStart'].flatMap(field => shared.vertices.map(v => ({ field, v, delta: sub(at(rect(other)[field], v.x, v.y), at(rect(row)[field], v.x, v.y)) })).filter(c => cmp(c.delta, zero) !== 0).slice(0, 1));
        if (!moved.length) continue;
        reported.add(row.path);
        const { field, v, delta } = moved[0];
        const scoreBound = block ? shiftScoreBound(sizes, hover.sizes, () => true, v) : null;
        diagnostics.push({ code: 'E_LAYOUT_HOVER_SHIFT', severity: 'error', box: row.box, path: row.path, hovered: target.label, hoveredPath: target.path, field, delta: exact(delta), ...(scoreBound !== null ? { scoreBound } : {}),
          message: `Hovering ${target.label} moves ${row.box} (${field} by ${number(delta)}px at viewport ${number(v.x)}px${block ? ` × ${number(v.y)}px` : ''}): a layout shift without an excusing input. Change paint or transform on :hover, or reserve the space`, ...ranges(shared) });
      }
    }
  }
  // Layout shifts from CSS animations of layout properties (margin, size, insets, padding, …; transform and opacity
  // never shift, measured): the page is laid out at each keyframe's declarations, and any box whose layout start
  // moves where the animation runs is reported. Frames between keyframes are not enumerated: a shift at a keyframe
  // is a shift every iteration (an infinite animation shifts every frame; docs/cls-evaluation.md).
  if (pristine && hovered === undefined && !options.$animationFrame && !options.$slideVariant && animated.length && !diagnostics.some(d => d.severity === 'unknown')) {
    const r = v => { const [n, d = '1'] = String(v ?? '0').split('/'); return div(q(n), q(d)); };
    const at = (a, w, h) => add(add(r(a.constant), mul(r(a.coefficient), w)), mul(r(a.heightCoefficient), h));
    const rect = row => row.layoutRect !== undefined ? row.layoutRect : row.rect;
    const seen = new Set();
    for (const entry of animated) {
      const id = `${entry.box.path}|${entry.name}`;
      if (seen.has(id) || seen.size >= 32) continue;
      seen.add(id);
      const where = animated.filter(other => `${other.box.path}|${other.name}` === id).map(other => other.region);
      const reported = new Set();
      const states = []; let complete = true; // keyframe layouts for the score bound
      for (const frame of keyframeFrames.get(entry.name).filter(frame => frame.layout)) {
        const label = `${entry.name} at ${number(q(String(Math.round(frame.offset * 1e4) / 100)))}%`;
        // A nonzero px margin-top/left (the checked layout has zero margins) moves an in-flow box's own start: a shift
        // without a re-layout (margins are outside the layout subset).
        const starts = Object.fromEntries(frame.layout.split(';').flatMap(decl => {
          const [prop, ...rest] = decl.split(':'), value = rest.join(':').trim(), parts = value.split(/\s+/), name = prop.trim().toLowerCase();
          if (name === 'margin') return [['blockStart', parts[0]], ['inlineStart', parts[3] ?? parts[1] ?? parts[0]]];
          if (name === 'margin-block' || name === 'margin-top' || name === 'margin-block-start') return [['blockStart', parts[0]]];
          if (name === 'margin-inline' || name === 'margin-left' || name === 'margin-inline-start') return [['inlineStart', parts[0]]];
          return [];
        }));
        const shifted = Object.entries(starts).find(([, value]) => /^-?\d+(?:\.\d+)?px$/.test(value) && Number.parseFloat(value) !== 0);
        if (shifted && !reported.has(entry.box.path) && !['absolute', 'fixed'].includes(entry.position)) {
          reported.add(entry.box.path);
          diagnostics.push({ code: 'E_LAYOUT_ANIMATION_SHIFT', severity: 'error', box: entry.box.label, path: entry.box.path, animated: entry.box.label, animatedPath: entry.box.path, animation: entry.name, offset: frame.offset, field: shifted[0], delta: exact(q(shifted[1].replace(/px$/, ''))),
            message: `Animation ${label} on ${entry.box.label} sets a ${shifted[1]} start margin, which moves it (${shifted[0]}): a layout shift while it runs. Animate transform (translate) instead of margin`, ...ranges(entry.region) });
          complete = false;
          continue;
        }
        const moved = analyzeBoxTree(pristine, { ...options, $animationFrame: { path: entry.box.path, css: frame.layout } }, scrollbarProfile, budget, inlineSheets, [], preferences);
        if (moved.status === 'unknown') { diagnostics.push({ code: 'U_LAYOUT_ANIMATION_SHIFT', severity: 'unknown', message: `${entry.box.label}: the layout at keyframe ${label} is not decided (${moved.diagnostics.find(d => d.severity === 'unknown')?.message ?? 'unknown'})`, box: entry.box.label, path: entry.box.path }); continue; }
        if (moved.status !== 'unknown') states.push({ offset: frame.offset, sizes: moved.sizes }); else complete = false;
        const undecided = [...sizes, ...moved.sizes].find(row => !rect(row) || !row.$shown?.region);
        if (undecided) { diagnostics.push({ code: 'U_LAYOUT_ANIMATION_SHIFT', severity: 'unknown', message: `${entry.box.label}: the layout of ${undecided.box} at keyframe ${label} cannot be compared (it has no layout rectangle)`, box: entry.box.label, path: entry.box.path }); continue; }
        for (const row of sizes) for (const other of moved.sizes.filter(o => o.path === row.path)) {
          if (reported.has(row.path)) continue;
          for (const running of where) {
            const both = intersect(row.$shown.region, other.$shown.region), shared = both && intersect(both, running);
            if (!shared) continue;
            const change = ['inlineStart', 'blockStart'].flatMap(field => shared.vertices.map(v => ({ field, v, delta: sub(at(rect(other)[field], v.x, v.y), at(rect(row)[field], v.x, v.y)) })).filter(c => cmp(c.delta, zero) !== 0).slice(0, 1))[0];
            if (!change) continue;
            reported.add(row.path);
            diagnostics.push({ code: 'E_LAYOUT_ANIMATION_SHIFT', severity: 'error', box: row.box, path: row.path, animated: entry.box.label, animatedPath: entry.box.path, animation: entry.name, offset: frame.offset, field: change.field, delta: exact(change.delta),
              message: `Animation ${label} on ${entry.box.label} moves ${row.box} (${change.field} by ${number(change.delta)}px at viewport ${number(change.v.x)}px${block ? ` × ${number(change.v.y)}px` : ''}): a layout shift while it runs (every frame it moves). Animate transform (translate/scale) instead of layout properties`, ...ranges(shared) });
            break;
          }
        }
      }
      // The score bound of one 5 s session window (Chromium's CLS window), under the premise that boxes move
      // monotonically between keyframes. Missing 0% / 100% keyframes are the box's own (base) layout.
      const found = diagnostics.filter(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT' && d.animatedPath === entry.box.path && d.animation === entry.name);
      if (complete && found.length && block && options.viewport.height) {
        const frames = [...states].sort((a, b) => a.offset - b.offset);
        if (!frames.length || frames[0].offset > 0) frames.unshift({ offset: 0, sizes });
        if (frames.at(-1).offset < 1) frames.push({ offset: 1, sizes });
        const shared = found[0];
        const regionOf = d => d.regionConstraints ?? d.region?.constraints;
        const p = sample(entry.region);
        let perIteration = 0, ok = true;
        for (let i = 0; i + 1 < frames.length; i++) { const b = sweptBound(frames[i].sizes, frames[i + 1].sizes, p); if (!b) { ok = false; break; } perIteration += b.impact * b.distance; }
        // A normal-direction repeat jumps from the last keyframe back to the first in one frame; the start jumps from
        // the base layout to the first keyframe.
        const jump = (a, b) => shiftScoreBound(a, b, () => true, p);
        const seconds = (/^(\d+(?:\.\d+)?|\.\d+)(m?s)$/.exec(String(entry.duration)) ?? []);
        const duration = seconds[2] === 'ms' ? Number(seconds[1]) / 1000 : Number(seconds[1]);
        const count = entry.count === 'infinite' ? Infinity : Number(entry.count);
        if (ok && duration > 0 && count > 0) {
          const iterations = Math.min(count, Math.ceil(5 / duration));
          const wraps = ['normal', 'reverse'].includes(entry.direction) ? Math.max(0, iterations - 1) : 0;
          const startJump = jump(sizes, frames[0].sizes) ?? 0, wrapJump = wraps ? (jump(frames.at(-1).sizes, frames[0].sizes) ?? 0) : 0;
          const windowBound = perIteration * iterations + wraps * wrapJump + startJump;
          for (const d of found) d.scoreBound = { window: windowBound, perIteration, iterations, viewport: { width: number(p.x), height: number(p.y) }, assumes: 'boxes move monotonically between keyframes' };
        }
      }
    }
  }
  // A sticky box that cannot stick: its containing block (the parent's content box) ends at or before its own bottom,
  // so there is no scroll range in which it stays at top: 0 (a sticky header wrapped in a box of its own height).
  if (block && hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of geometry.filter(row => row.sticky?.parent && row.origin && row.block)) {
    const parent = geometry.find(other => other.path === row.sticky.parent && other.origin && other.contentBlockSize && intersect(other.region, row.region));
    if (!parent || layoutWarnings.some(w => w.code === 'W_LAYOUT_STICKY_INERT' && w.path === row.path)) continue;
    const room = diff(sum(sum(parent.origin.block, scalar(parent.content.top)), parent.contentBlockSize), sum(row.origin.block, row.block));
    const shared = intersect(row.region, parent.region);
    if (!shared || clip(shared, room, true)) continue;
    layoutWarnings.push({ code: 'W_LAYOUT_STICKY_INERT', severity: 'warning', box: row.box.label, path: row.path, parent: parent.box.label,
      message: `${row.box.label} is position: sticky, but its parent ${parent.box.label} ends at its bottom: it scrolls away like a static box. Make it a child of the scrolling content (or give the parent the height it should stick across)`, ...ranges(shared) });
  }
  // An img whose srcset has width descriptors picks its file by the sizes attribute's width (× the pixel ratio): a
  // sizes width below the width the image is laid out at selects a file too small for its box (a blurry image).
  // sizes is evaluated like the layout: its media conditions split the region, its lengths are viewport-affine.
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of sizes) {
    const box = boxes.find(b => b.path === row.path);
    const facts = box?.tag === 'img' ? box.imageSize : null;
    if (!facts || typeof facts.srcset !== 'string' || !/\d+w\s*(?:,|$)/.test(facts.srcset) || !row.$shown?.region) continue;
    // No sizes attribute: the browser sizes the w-descriptor candidates for 100vw. Where the image is laid out at most
    // half the viewport wide, it downloads a file at least twice as wide as it shows (at every device pixel ratio).
    if (facts.sizes === undefined) {
      const wide = clip(row.$shown.region, diff(width, times(row.$shown.inline, q(2))));
      if (wide && !layoutWarnings.some(w => w.code === 'W_LAYOUT_SIZES_MISSING' && w.path === row.path)) {
        const p = sample(wide);
        layoutWarnings.push({ code: 'W_LAYOUT_SIZES_MISSING', severity: 'warning', box: row.box, path: row.path, srcset: facts.srcset,
          message: `${row.box} has a srcset with width descriptors but no sizes attribute, so the browser assumes 100vw: at viewport ${number(p.x)}px it is laid out ${number(evaluate(row.$shown.inline, p))}px wide and downloads a file for ${number(p.x)}px. Add sizes (for this layout, the width it takes at each breakpoint)`, ...ranges(wide) });
      }
      continue;
    }
    if (facts.sizes === 'dynamic' || /^\s*auto\b/i.test(facts.sizes)) continue;
    const entries = []; let depth = 0, start = 0;
    for (let i = 0; i <= facts.sizes.length; i++) { const c = facts.sizes[i]; if (c === '(') depth++; else if (c === ')') depth--; else if ((c === ',' && depth === 0) || i === facts.sizes.length) { entries.push(facts.sizes.slice(start, i).trim()); start = i + 1; } }
    let pending = [{ region: row.$shown.region }], findings = [];
    try {
      for (const entry of entries.filter(Boolean)) {
        const m = /^(\(.*\))\s+(\S.*)$/.exec(entry);
        const [media, len] = m ? [m[1], m[2]] : [null, entry];
        const next = [];
        for (const piece of pending) {
          let yes = [piece.region], no = [];
          if (media) {
            // Split by every atom, then classify each piece at a sample point (as the cascade does).
            const compiled = context(parseCondition(media, 'media'), []);
            let parts = [piece.region];
            for (const atom of compiled.groups.flat()) parts = parts.flatMap(r => { const p = partition(r, atom.slack, atom.relation); return [...p.yes, ...p.no]; });
            const holds = r => { const p = sample(r); return compiled.groups.some(group => group.every(atom => compare(cmp(evaluate(atom.slack, p), zero), atom.relation))); };
            yes = parts.filter(holds); no = parts.filter(r => !holds(r));
          }
          for (const r of yes) for (const L of lengthPieces(len, null, r, {})) { const short = clip(L.region, diff(row.$shown.inline, L.value), true); if (short) findings.push({ region: short, L: L.value }); }
          next.push(...no.map(region => ({ region })));
        }
        pending = next;
        if (!pending.length) break;
      }
    } catch { continue; }
    for (const { region: short, L } of findings.slice(0, 8)) { const p = sample(short);
    if (layoutWarnings.filter(w => w.code === 'W_LAYOUT_SIZES_SMALL' && w.path === row.path).length >= 8) break;
    layoutWarnings.push({ code: 'W_LAYOUT_SIZES_SMALL', severity: 'warning', box: row.box, path: row.path, sizes: facts.sizes,
      message: `${row.box} is laid out ${number(evaluate(row.$shown.inline, p))}px wide at viewport ${number(p.x)}px but its sizes attribute says ${number(evaluate(L, p))}px: the browser picks a srcset file for the smaller width, so the image is upscaled (blurry). Make sizes match the layout width`, ...ranges(short) }); }
  }
  // A list item's outside marker is drawn before its start edge (left in ltr): where that edge is at the viewport's left
  // edge, the whole marker lies outside and is not seen (measured). Under a clipping ancestor positions are not
  // tracked, and a small gap that cuts the marker in part depends on the font: neither is reported.
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of geometry.filter(row => row.outsideMarker && (row.origin ?? row.clipOrigin) && !row.box.pseudo)) {
    if (layoutWarnings.some(w => w.code === 'W_LAYOUT_MARKER_HIDDEN' && w.path === row.path)) continue;
    // (Under a clipping ancestor a row keeps its position as clipOrigin.)
    const at = r => r.origin ?? r.clipOrigin;
    // An overflow-x: clip ancestor (it never scrolls, so positions under it are exact) cuts the marker at its padding
    // edge; hidden/auto/scroll ancestors may be scrolled and are not judged.
    const ancestors = geometry.filter(other => other.path !== row.path && row.path.startsWith(other.path + '/') && other.overflow !== 'visible' && intersect(other.region, row.region));
    if (ancestors.some(other => !other.clipAxes?.inline)) continue;
    const clipper = ancestors.sort((a, b) => b.path.length - a.path.length)[0];
    if (clipper && !at(clipper)) continue;
    const edge = clipper ? sum(at(clipper).inline, scalar(clipper.borders?.left ?? zero)) : scalar(0);
    const hidden = clip(clipper ? intersect(row.region, clipper.region) : row.region, diff(edge, at(row).inline));
    if (!hidden) continue;
    const p = sample(hidden);
    layoutWarnings.push({ code: 'W_LAYOUT_MARKER_HIDDEN', severity: 'warning', box: row.box.label, path: row.path, marker: row.outsideMarker, ...(clipper ? { clippedBy: clipper.box.label } : {}),
      message: `${row.box.label}'s ${row.outsideMarker} marker is drawn outside it, before its left edge, which is at ${clipper ? `the start of ${clipper.box.label} (overflow ${clipper.overflowValue})` : 'the left edge of the viewport'} at viewport ${number(p.x)}px: the marker is not seen. Give the list padding-inline-start (or list-style-position: inside)`, ...ranges(hidden) });
  }
  // An image laid out wider than its widest file: the file's natural width (a single src whose size is known), or the
  // largest w descriptor of its srcset. The browser upscales it — blurry even at a device pixel ratio of 1.
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of sizes) {
    const box = boxes.find(b => b.path === row.path), facts = box?.tag === 'img' ? box.imageSize : null;
    if (!facts || !row.$shown?.region || box.pseudo || layoutWarnings.some(w => w.code === 'W_LAYOUT_IMAGE_UPSCALED' && w.path === row.path)) continue;
    const parent = boxes.find(b => (b.children ?? []).includes(box));
    if (parent?.tag === 'picture' && (parent.children ?? []).some(c => c.tag === 'source')) continue;
    let widest, from;
    if (typeof facts.srcset === 'string' && facts.srcset !== 'dynamic' && /\d+w\s*(?:,|$)/.test(facts.srcset)) {
      const ws = facts.srcset.split(',').map(part => /\s(\d+)w\s*$/.exec(part.trim())?.[1]).filter(Boolean).map(Number);
      if (ws.length) { widest = Math.max(...ws); from = `its largest srcset candidate is ${widest}w`; }
    } else if (facts.srcset === undefined && typeof facts.src === 'string' && options.images?.[facts.src]?.width) {
      widest = options.images[facts.src].width; from = `${facts.src} is ${widest}px wide`;
    }
    if (!widest) continue;
    const over = clip(row.$shown.region, diff(row.$shown.inline, scalar(widest)), true);
    if (!over) continue;
    const p = sample(over);
    layoutWarnings.push({ code: 'W_LAYOUT_IMAGE_UPSCALED', severity: 'warning', box: row.box, path: row.path, naturalWidth: widest,
      message: `${row.box} is laid out ${number(evaluate(row.$shown.inline, p))}px wide at viewport ${number(p.x)}px, but ${from}: the browser upscales it, so it looks blurry even at 1x. Cap it (max-width: ${widest}px) or add a wider file`, ...ranges(over) });
  }
  // object-fit: fill (the initial value) scales an img's picture to its content box on each axis: a box whose ratio
  // differs from the picture's (by more than 2%) draws it stretched. Boxes with padding or borders are not judged.
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of geometry.filter(row => row.imageRatio && !row.imageRatio.follows && row.paint?.objectFit === 'fill' && row.inline && row.block && !row.box.pseudo)) {
    if (layoutWarnings.some(w => w.code === 'W_LAYOUT_IMAGE_DISTORTED' && w.path === row.path)) continue;
    if (['left', 'right', 'top', 'bottom'].some(side => cmp(row.borders?.[side] ?? zero, zero) !== 0) || cmp(row.content.left, zero) !== 0 || cmp(row.content.top, zero) !== 0) continue;
    const { width: w, height: h } = row.imageRatio;
    // inline·h vs block·w: wider when inline·h·50 > block·w·51, taller when inline·h·51 < block·w·50.
    const wide = clip(row.region, diff(times(row.inline, q(String(h * 50))), times(row.block, q(String(w * 51)))), true);
    const tall = clip(row.region, diff(times(row.block, q(String(w * 50))), times(row.inline, q(String(h * 51)))), true);
    for (const [found, way] of [[wide, 'wider'], [tall, 'taller']]) {
      if (!found) continue;
      const p = sample(found), iw = number(evaluate(row.inline, p)), ih = number(evaluate(row.block, p));
      layoutWarnings.push({ code: 'W_LAYOUT_IMAGE_DISTORTED', severity: 'warning', box: row.box.label, path: row.path, natural: `${w}/${h}`, basis: row.imageRatio.basis, stretched: way,
        message: `${row.box.label} is drawn ${iw}×${ih}px at viewport ${number(p.x)}px, but its picture is ${w}×${h} (${row.imageRatio.basis === 'file' ? 'the file' : 'its width/height attributes'}): object-fit: fill stretches it ${way}. Use object-fit: cover (or contain), or let one size be auto`, ...ranges(found) });
    }
  }
  // A grid whose columns are all px tracks does not shrink: where they (and the gaps) are wider than the container
  // (the inline E_LAYOUT_TRACKS), the fix is flexible tracks.
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of geometry.filter(row => row.fixedTracks)) {
    const failed = diagnostics.find(d => d.code === 'E_LAYOUT_TRACKS' && d.path === row.path && d.axis === 'inline');
    if (!failed || layoutWarnings.some(w => w.code === 'W_LAYOUT_FIXED_TRACKS' && w.path === row.path)) continue;
    layoutWarnings.push({ code: 'W_LAYOUT_FIXED_TRACKS', severity: 'warning', box: row.box.label, path: row.path, columns: row.fixedTracks,
      message: `${row.box.label} has grid-template-columns: ${row.fixedTracks}, only fixed px tracks, so it cannot shrink below their sum and overflows narrower containers. Use flexible tracks: repeat(N, minmax(0, 1fr)), or fewer columns under a media or container query`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
  }
  // Wrapping text with overflow-wrap: normal breaks only between words: its minimum width is its longest word (a
  // URL, a long compound). Where that does not fit (the inline E_LAYOUT_CONTENT), say so.
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of geometry.filter(row => row.wrapsByWords)) {
    const failed = diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.path === row.path && d.axis === 'inline');
    if (!failed || layoutWarnings.some(w => w.code === 'W_LAYOUT_LONG_WORD' && w.path === row.path)) continue;
    layoutWarnings.push({ code: 'W_LAYOUT_LONG_WORD', severity: 'warning', box: row.box.label, path: row.path,
      message: `${row.box.label} wraps only between words (overflow-wrap: normal), and its longest word is wider than the box: it sticks out. Use overflow-wrap: anywhere (or break-word) for URLs and long words`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
  }
  // An img (or video) sized by its width attribute with no CSS width or max-width keeps that px width in a narrower
  // container: the inline overflow is explained by the missing max-width: 100%.
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of geometry.filter(row => row.widthFromAttribute)) {
    const failed = diagnostics.find(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.path === row.path && d.axis === 'inline');
    if (!failed || layoutWarnings.some(w => w.code === 'W_LAYOUT_MEDIA_NO_MAX' && w.path === row.path)) continue;
    layoutWarnings.push({ code: 'W_LAYOUT_MEDIA_NO_MAX', severity: 'warning', box: row.box.label, path: row.path, width: row.widthFromAttribute,
      message: `${row.box.label} takes its width from its width="${row.widthFromAttribute}" attribute and no CSS width or max-width limits it, so it is wider than its container. Add max-width: 100% (with height: auto to keep its ratio)`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
  }
  // width: 100% is the whole area; a px start margin then pushes the box out of it (stretching, width: auto, would
  // have subtracted the margins). Explains the inline E_LAYOUT_ITEM_SIZE.
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of geometry.filter(row => row.fullWidthMargins?.length)) {
    const failed = diagnostics.find(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.path === row.path && d.axis === 'inline');
    if (!failed || layoutWarnings.some(w => w.code === 'W_LAYOUT_FULL_WIDTH_MARGIN' && w.path === row.path)) continue;
    layoutWarnings.push({ code: 'W_LAYOUT_FULL_WIDTH_MARGIN', severity: 'warning', box: row.box.label, path: row.path, properties: row.fullWidthMargins,
      message: `${row.box.label} has width: 100% and ${row.fullWidthMargins.join(', ')}; the 100% is the whole area, so the margin pushes the box out of it. Drop width: 100% (a grid or flex item stretches to the area less its margins) or use calc(100% - the margins)`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
  }
  // width: 100% under box-sizing: content-box is the content width: the padding and border come on top, so the box
  // is wider than its container (the content-box pitfall, the default for most boxes and for text inputs).
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of geometry.filter(row => row.contentBoxFull?.length)) {
    const failed = diagnostics.find(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.path === row.path && d.axis === 'inline');
    if (!failed || layoutWarnings.some(w => w.code === 'W_LAYOUT_CONTENT_BOX_FULL' && w.path === row.path)) continue;
    layoutWarnings.push({ code: 'W_LAYOUT_CONTENT_BOX_FULL', severity: 'warning', box: row.box.label, path: row.path, properties: row.contentBoxFull,
      message: `${row.box.label} is width: 100% with box-sizing: content-box, so its ${row.contentBoxFull.join(', ')} come on top of the container's width and it overflows. Use box-sizing: border-box (or width: auto in a grid or flex parent)`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
  }
  // A vw width is a share of the whole viewport, the classic scrollbar included: on a scrolling page it is wider
  // than the space beside the scrollbar (100vw → a horizontal scrollbar). Explains the inline E_LAYOUT_ITEM_SIZE.
  if (hovered === undefined && !options.$animationFrame && !options.$slideVariant && scrollbarProfile?.inlineSize > 0) for (const row of geometry.filter(row => row.vwInline)) {
    const failed = diagnostics.find(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.path === row.path && d.axis === 'inline');
    if (!failed || layoutWarnings.some(w => w.code === 'W_LAYOUT_VW_SCROLLBAR' && w.path === row.path)) continue;
    layoutWarnings.push({ code: 'W_LAYOUT_VW_SCROLLBAR', severity: 'warning', box: row.box.label, path: row.path, width: row.vwInline, scrollbar: scrollbarProfile.inlineSize,
      message: `${row.box.label} is width: ${row.vwInline}, and vw includes the ${scrollbarProfile.inlineSize}px classic scrollbar of the scrolling page: it is wider than the page beside the scrollbar, which scrolls sideways. Use 100% (or width: auto in a grid or flex parent)`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
  }
  // A lazily loaded image in the initial viewport (its layout top above the viewport height somewhere, at the
  // initial scroll position): it starts loading only after layout, later than an eager one, which delays the largest
  // contentful paint when it is the hero image. Reported as a warning with the region where it is visible.
  if (block && options.viewport.height && hovered === undefined && !options.$animationFrame && !options.$slideVariant) for (const row of sizes) {
    const box = boxes.find(b => b.path === row.path);
    if (box?.tag !== 'img' || box.imageSize?.loading !== 'lazy' || !row.$shown?.origin || !row.$shown.block || layoutWarnings.some(w => w.code === 'W_LAYOUT_LAZY_IN_VIEWPORT' && w.path === row.path)) continue;
    const top = row.$shown.origin.block, bottom = sum(top, row.$shown.block), left = row.$shown.origin.inline;
    // Visible: top < H, bottom > 0 and left < W.
    let visible = clip(row.$shown.region, diff(height, top), true);
    visible = visible && clip(visible, bottom, true);
    visible = visible && clip(visible, diff(width, left), true);
    if (!visible) continue;
    const p = sample(visible);
    layoutWarnings.push({ code: 'W_LAYOUT_LAZY_IN_VIEWPORT', severity: 'warning', box: row.box, path: row.path,
      message: `${row.box} has loading="lazy" but is in the initial viewport (top ${number(evaluate(top, p))}px at viewport ${number(p.x)}px × ${number(p.y)}px): it loads later than an eager image; drop loading="lazy" for images above the fold (and consider fetchpriority="high" for the largest one)`, ...ranges(visible) });
  }
  // Carousels (the WAI-ARIA pattern: aria-roledescription="carousel" with "slide" descendants): with each slide shown
  // in turn, nothing outside the slides may move, or switching slides is a layout shift (slides of different heights
  // move the content below; measured). The shown slide is the one without the hidden attribute, or the one carrying
  // a class no other slide has; each variant moves that marker to another slide.
  if (pristine && hovered === undefined && !options.$animationFrame && !options.$slideVariant && !diagnostics.some(d => d.severity === 'unknown')) {
    const role = (box, name) => String(box.aria?.['aria-roledescription'] ?? '').trim().toLowerCase() === name;
    const carousels = []; (function walk(box) { if (role(box, 'carousel')) carousels.push(box); for (const child of box.children ?? []) walk(child); })(root);
    for (const carousel of carousels.slice(0, 8)) {
      const slides = []; (function walk(box) { for (const child of box.children ?? []) { if (role(child, 'slide')) slides.push(child); else if (!role(child, 'carousel')) walk(child); } })(carousel);
      if (slides.length < 2) continue;
      const fail = message => diagnostics.push({ code: 'U_LAYOUT_CAROUSEL_SHIFT', severity: 'unknown', message: `${carousel.label}: ${message}`, box: carousel.label, path: carousel.path });
      const shownByHidden = slides.filter(slide => slide.hiddenAttr !== true);
      // A state class (active, is-current, selected, show, …) that exactly one slide carries marks the shown slide.
      const stateClass = /(?:^|[-_])(?:active|current|selected|show|shown|visible|open)$/i;
      const unique = slides.map(slide => slide.classes.filter(c => stateClass.test(c) && !slides.some(other => other !== slide && other.classes.includes(c))));
      let marker;
      if (slides.some(slide => slide.hiddenAttr === 'dynamic' || slide.hiddenAttr === 'until-found' || [...slide.classes].some(c => c === 'dynamic'))) { fail('a slide with a dynamic hidden attribute or class is not enumerated'); continue; }
      if (shownByHidden.length === 1) marker = { kind: 'hidden' };
      else if (unique.filter(list => list.length).length === 1) marker = { kind: 'class', name: unique.find(list => list.length)[0], from: slides[unique.findIndex(list => list.length)].path };
      else if (shownByHidden.length !== slides.length) { fail('the shown slide is not identified (one slide without hidden, or one with a state class such as active that no other slide has)'); continue; }
      else marker = null; // every slide shown at once (a scrolling track): switching does not change the layout
      if (!marker) continue;
      const inSlide = path => slides.some(slide => path === slide.path || path.startsWith(slide.path + '/'));
      const variants = [];
      for (const target of slides.slice(0, 16)) {
        const copy = structuredClone(pristine);
        const find = (box, path) => box.path === path ? box : (box.children ?? []).map(child => find(child, path)).find(Boolean);
        const list = slides.map(slide => find(copy, slide.path));
        if (marker.kind === 'hidden') list.forEach(slide => { if (slide.path === target.path) delete slide.hiddenAttr; else slide.hiddenAttr = true; });
        else list.forEach(slide => { slide.classes = slide.classes.filter(c => c !== marker.name); if (slide.path === target.path) slide.classes.push(marker.name); });
        variants.push({ target, report: analyzeBoxTree(copy, { ...options, $slideVariant: true }, scrollbarProfile, budget, inlineSheets, [], preferences) });
      }
      const failed = variants.find(v => v.report.status === 'unknown');
      if (failed) { fail(`its layout with ${failed.target.label} shown is not decided (${failed.report.diagnostics.find(d => d.severity === 'unknown')?.message ?? 'unknown'})`); continue; }
      const first = variants[0];
      for (const variant of variants.slice(1)) {
        const result = layoutStartMoves(first.report.sizes, variant.report.sizes, row => !inSlide(row.path));
        if (result.undecided) { fail(`${result.undecided.box} has no layout rectangle to compare across slides`); break; }
        for (const move of result.moves) diagnostics.push({ code: 'E_LAYOUT_CAROUSEL_SHIFT', severity: 'error', box: move.row.box, path: move.row.path, carousel: carousel.label, carouselPath: carousel.path, from: first.target.label, to: variant.target.label, field: move.field, delta: exact(move.delta),
          ...(() => { const bound = block ? shiftScoreBound(first.report.sizes, variant.report.sizes, row => !inSlide(row.path), move.v) : null; return bound !== null ? { scoreBound: bound } : {}; })(),
          message: `Switching ${carousel.label} from ${first.target.label} to ${variant.target.label} moves ${move.row.box} (${move.field} by ${number(move.delta)}px at viewport ${number(move.v.x)}px${block ? ` × ${number(move.v.y)}px` : ''}): slides of different sizes shift the page. Give the slide area a fixed height or aspect-ratio, or stack the slides in one grid cell`, ...ranges(move.shared) });
        if (result.moves.length) break;
      }
    }
  }
  // A picture source that is never the selected one in the checked range: an earlier source's media covers every
  // width where its own matches (the first matching source wins), or its media never matches. Its files are dead.
  if (!diagnostics.some(d => d.severity === 'unknown')) for (const use of sourceUse.values()) use.sources.forEach((source, i) => {
    if (use.chosen.has(i)) return;
    const media = source.facts.media ?? 'all', earlier = use.sources.slice(0, i).map(s => s.facts.media ?? 'all');
    layoutWarnings.push({ code: 'W_LAYOUT_SOURCE_SHADOWED', severity: 'warning', box: use.box.label, path: use.box.path, source: i, media, srcset: source.facts.srcset,
      message: use.active.has(i)
        ? `<source media="${media}"> (source ${i + 1}) of ${use.box.label}'s picture is never used: wherever it matches, an earlier source (${earlier.join(', ')}) matches too, and the first match wins. Order the sources from the most specific media to the least`
        : `<source media="${media}"> (source ${i + 1}) of ${use.box.label}'s picture never matches in the checked viewport range, so it is never used` });
  });
  // A container query that matches no element anywhere in the checked range: no ancestor is a query container (of
  // that name), or the containers it finds are never that size. Its rules never apply.
  {
    const byRule = new Map();
    for (const f of queryFacts) {
      const key = `${f.condition.css?.file}:${f.condition.css?.line}:${f.condition.params}`;
      if (!byRule.has(key)) byRule.set(key, []);
      byRule.get(key).push(f);
    }
    for (const facts of byRule.values()) {
      if (facts.some(f => f.matched) || diagnostics.some(d => d.severity === 'unknown')) continue;
      const { condition } = facts[0], targets = [...new Set(facts.map(f => f.target).filter(Boolean))], boxes = [...new Set(facts.map(f => f.box))];
      const why = !targets.length ? (condition.name ? `no ancestor of ${boxes.join(', ')} has container-name: ${condition.name}` : `no ancestor of ${boxes.join(', ')} has a container-type`) : `its container ${targets.join(', ')} is never that size in the checked viewport range`;
      layoutWarnings.push({ code: 'W_CSS_CONTAINER_QUERY_NEVER', severity: 'warning', box: boxes[0], boxes, query: condition.params, ...(condition.name ? { name: condition.name } : {}), reason: targets.length ? 'size' : 'no-container',
        ...(condition.css ? { css: condition.css } : {}),
        message: `@container ${condition.params} never matches: ${why}, so its rules never apply${targets.length ? '' : ` (give an ancestor container-type: inline-size${condition.name ? ` and container-name: ${condition.name}` : ''})`}` });
    }
  }
  const status = diagnostics.some(d => d.severity === 'unknown') ? 'unknown' : diagnostics.length ? 'violated' : 'verified';
  return { version: 1, ok: status === 'verified', status, component,
    scope: { axis: block ? 'both' : 'inline', viewport: { ...projection(initial, 'x'), ...(block ? { height: options.viewport.height ? projection(initial, 'y') : null } : {}) }, hostInset: options.hostInset ?? 0, ...(block ? { hostBlockInset: options.hostBlockInset ?? 0 } : {}), closedCSS: true, browserRounding: false, blockSizing: block },
    assumptions: ['The supplied CSS is the complete author cascade and the selected root has no external query-container ancestors; host provides the declared containing sizes without unmodeled scrollbar gutters.',
      'Each minInlineSize/minBlockSize is a trusted sufficient content-size bound; intrinsicBlockSize is a trusted exact auto-height profile for the permitted content/fonts.',
      'Only horizontal-tb/ltr in-flow and explicitly sized local absolute geometry is checked; ink overflow and browser pixel rounding are outside the contract.',
      ...(rules.some(rule=>rule.declarations.some(d=>d.expression || d.pending)) ? ['Custom properties are unregistered; unknown external inheritance and cycles through fallback references prevent verification when used by geometry.'] : [])],
    styleSources: styleSources.map(({ kind, file }) => ({ kind, file })), diagnostics, policies, checks, sizes, queries, subgrids,
    elements:boxes.map(({path,tag,id,classes,owner,targets,targetIdentity})=>({path,tag,...(id ? {id} : {}),classes,owner,...(targets?.length ? {targets} : {}),...(targetIdentity ? {targetIdentity} : {})})),
    ...(boxes.some(box=>box.layoutContracts?.length) ? {layoutBindings:boxes.flatMap(box=>(box.layoutContracts ?? []).map(declaration=>({path:box.path,declaration})))} : {}),
    ...(geometry.some(row => row.bounds) ? { inlineBounds: geometry.filter(row => row.bounds).flatMap(row => row.bounds.map(piece => ({ box: row.box.label, path: row.path, ...ranges(piece.region), ...(block ? { regionConstraints: serialize(piece.region).constraints } : {}),
      ...Object.fromEntries(['outer', 'inner'].map(key => [key, piece[key] ? { inlineStart: affine(piece[key].origin.inline), blockStart: affine(piece[key].origin.block), inlineSize: affine(piece[key].inline), blockSize: affine(piece[key].block) } : null])) }))) } : {}),
    ...(scrollbars.length ? {scrollbars} : {}), ...(invalidSubstitutions.length ? {invalidSubstitutions} : {}), ...(layoutWarnings.length ? { layoutWarnings } : {}), ...(options.reportTextFonts ? { textFonts: [...textFonts].map(([path, facts]) => facts === 'varied' ? { path, varied: true } : { path, ...facts }) } : {}), ...((options.selectors || options.scope) && !untransformed && hovered === undefined && !options.$animationFrame && !options.$slideVariant ? { selectors: (() => { const usage = options.selectors ? selectorUsage(rules, boxes) : { rows: [], warnings: [] }; return options.scope ? { ...usage, warnings: [...usage.warnings, ...selectorScope(rules, boxes, options.scope).warnings] } : usage; })() } : {}), ...(generatedTexts.length ? { generatedText: generatedTexts } : {}),
    ...(options.accessibility ? { accessibility: { rules: accessibilityRules.filter(accessibilityProfiles[options.accessibility.profile ?? 'all']), profile: options.accessibility.profile ?? 'all', contrast: options.accessibility.contrast ?? 'AA', targetLevel: options.accessibility.targetLevel ?? 'AA', targetSize: options.accessibility.targetSize ?? (options.accessibility.targetLevel === 'AAA' ? 44 : 24), warnings: accessibilityWarnings, exempted: accessibilityExempted, notes: accessibilityNotes } } : {}),
    ...(options.integrity ? { integrity: { rules: ['page-overflow-x', 'container-protrusion', 'text-collision', 'target-undersized', 'clipped-content', 'nested-scroll'], targetSize: options.integrity.targetSize ?? 24, protrusion: options.integrity.protrusion ?? 'all', warnings: integrityWarnings, exempted: integrityExempted } } : {}) };
}
