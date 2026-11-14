// Flex subset (css-flexbox-1). This module turns computed styles into the
// item model solved by the engine; everything it cannot describe exactly is
// Unknown (U_LAYOUT_FLEX), never a guessed violation.
//
// Container: row or column; nowrap, or wrap for rows. Items: a definite flex
// base size (0, px, or auto with a px main size; in a column also the block
// content size), grow/shrink factors, and a minimum that is explicit, zero
// (empty box or scroll container) or, for content-sized column items, the
// content size itself. Main-axis auto margins, justify-content and
// align-items/align-self (except baseline) only move items.
import { q, add, cmp, div } from './linear.mjs';
import { px } from './css.mjs';

export const flexUnknown = message => Object.assign(new Error(message), { code: 'U_LAYOUT_FLEX' });
const unknown = message => { throw flexUnknown(message); };
const zeroLength = value => ['0', '0px', '0%'].includes(value);
const definite = value => /^\d/.test(value) && !value.endsWith('%');

/** @returns {{main: 'inline'|'block', wrap: boolean}} */
export function validateFlexContainer(style) {
  const direction = style['flex-direction'];
  if (!['row', 'column'].includes(direction)) unknown(`flex-direction ${direction} reverses the item order; only row and column are modeled`);
  const main = direction === 'row' ? 'inline' : 'block';
  if (style['flex-wrap'] === 'wrap-reverse') unknown('flex-wrap: wrap-reverse is outside the subset');
  const wrap = style['flex-wrap'] === 'wrap';
  if (wrap && main === 'block') unknown('A wrapping column needs the content widths of its lines; only rows wrap in the subset');
  distribution(style['justify-content'], main);
  if (wrap && !['normal', 'stretch', 'flex-start', 'start'].includes(style['align-content'])) unknown(`align-content ${style['align-content']} on a multi-line flex container is outside the subset`);
  crossAlignment(style['align-items'], 'auto');
  return { main, wrap };
}

/**
 * justify-content as `free → {lead, extra}` multipliers: the first item is
 * offset by lead·free and every gap grows by extra·free. `negative` says how
 * the value behaves when the free space is negative (`start` or unknown).
 */
export function distribution(value, main, count = 1) {
  const n = q(count);
  switch (value) {
    case 'normal': case 'stretch': case 'flex-start': case 'start': return { lead: q(0), extra: q(0), negative: 'start' };
    case 'left': if (main !== 'inline') unknown('justify-content: left applies to rows'); return { lead: q(0), extra: q(0), negative: 'start' };
    case 'right': if (main !== 'inline') unknown('justify-content: right applies to rows'); return { lead: q(1), extra: q(0), negative: 'unknown' };
    case 'flex-end': case 'end': return { lead: q(1), extra: q(0), negative: 'unknown' };
    case 'center': return { lead: div(q(1), q(2)), extra: q(0), negative: 'unknown' };
    // A single item or negative free space falls back to flex-start (§8.2).
    case 'space-between': return count > 1 ? { lead: q(0), extra: div(q(1), q(count - 1)), negative: 'start' } : { lead: q(0), extra: q(0), negative: 'start' };
    case 'space-around': return { lead: div(q(1), q(2 * count)), extra: div(q(1), n), negative: 'unknown' };
    case 'space-evenly': return { lead: div(q(1), q(count + 1)), extra: div(q(1), q(count + 1)), negative: 'unknown' };
    default: unknown(`justify-content ${value} is outside the subset`);
  }
}

/** Cross-axis alignment: 'stretch' or the factor of the free cross space before the item. */
export function crossAlignment(alignItems, alignSelf) {
  const value = ['auto', 'normal'].includes(alignSelf) ? alignItems : alignSelf;
  if (['normal', 'stretch'].includes(value)) return 'stretch';
  if (['flex-start', 'start', 'self-start'].includes(value)) return q(0);
  if (value === 'center') return div(q(1), q(2));
  if (['flex-end', 'end', 'self-end'].includes(value)) return q(1);
  unknown(`align ${value} is outside the subset (baseline alignment needs font metrics)`);
}

const names = axis => axis === 'inline'
  ? { size: 'inline-size', min: 'min-inline-size', sides: ['left', 'right'], label: 'width', minLabel: 'min-width' }
  : { size: 'block-size', min: 'min-block-size', sides: ['top', 'bottom'], label: 'height', minLabel: 'min-height' };
const edges = (style, sides) => sides.map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]))).reduce(add, q(0));
const outer = (size, own, contentBox) => contentBox ? add(size, own) : (cmp(size, own) < 0 ? own : size);

/**
 * Main-axis model of one in-flow item.
 * - base: outer flex base size (rational), or 'content' for the measured block content size.
 * - minimum: outer minimum (rational), or 'content' (equal to the base).
 * - automaticBelowBase: the automatic minimum is unknown but at most the base;
 *   the item must then never shrink.
 */
export function flexItem(style, { empty = false, axis = 'inline' } = {}) {
  const n = names(axis);
  if (style.order !== '0') unknown('order changes the item sequence; only order: 0 is modeled');
  const [startSide, endSide] = n.sides;
  const autoStart = style[`margin-${startSide}`] === 'auto', autoEnd = style[`margin-${endSide}`] === 'auto';
  const grow = q(style['flex-grow']), shrink = q(style['flex-shrink']), basis = style['flex-basis'];
  const contentBox = style['box-sizing'] === 'content-box', own = edges(style, n.sides);
  // The automatic minimum is zero for empty boxes and scroll containers
  // (overflow other than visible/clip, §4.5); otherwise it depends on content.
  const scrollContainer = !['visible', 'clip'].includes(style['overflow-x']) || !['visible', 'clip'].includes(style['overflow-y']);
  const automatic = style[n.min] === 'auto' && !empty && !scrollContainer;
  let base;
  if (zeroLength(basis)) base = q(0);
  else if (/^\d+(?:\.\d+)?px$/.test(basis)) base = px(basis);
  else if (basis === 'auto' && definite(style[n.size])) base = px(style[n.size]);
  else if ((basis === 'auto' || basis === 'content') && axis === 'block' && style[n.size] === 'auto') base = 'content';
  else if (basis === 'auto' || basis === 'content') unknown(`flex-basis: ${basis} with an auto ${n.label} uses the content size; give a px ${n.label} or basis`);
  else unknown(`flex-basis ${basis} is outside the subset`);
  if (basis !== 'auto' && style[n.size] !== 'auto') unknown(`An item with both flex-basis and ${n.label} is outside the subset; flex-basis wins over ${n.label}`);
  const item = { grow, shrink, edges: own, autoStart, autoEnd, automaticBelowBase: false };
  if (base === 'content') {
    // The block content size is both the flex base size and the automatic minimum.
    if (style[n.min] !== 'auto') unknown(`A content-sized item with an explicit ${n.minLabel} is outside the subset`);
    return { ...item, base: 'content', minimum: 'content' };
  }
  item.base = outer(base, own, contentBox);
  // max-width on a row's main axis (px): items above it freeze there (§9.7). Others stay outside the subset.
  if (style[axis === 'inline' ? 'max-inline-size' : 'max-block-size'] !== 'none') {
    const max = style[axis === 'inline' ? 'max-inline-size' : 'max-block-size'];
    if (axis !== 'inline' || !/^\d+(?:\.\d+)?px$/.test(max)) unknown(`A flex item's max size ${max} is outside the subset (px max-width on a row only)`);
    item.maximum = outer(px(max), own, contentBox);
  }
  if (style[n.min] !== 'auto') item.minimum = outer(px(style[n.min]), own, contentBox);
  else if (!automatic) item.minimum = own;
  else if (basis === 'auto') {
    // min(content size, specified size) ≤ the base: safe while it never shrinks.
    if (item.maximum !== undefined) unknown('An automatic minimum together with a max size depends on the content');
    item.minimum = own; item.automaticBelowBase = true;
  } else unknown(`The automatic minimum size of a flex item depends on its content; set ${n.minLabel}, or make it a scroll container`);
  return item;
}
