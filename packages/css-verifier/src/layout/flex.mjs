// Flex subset (css-flexbox-1): a single-line `row` or `column` container whose
// items are fixed (no grow/shrink, definite basis), flexible (zero basis,
// explicit zero minimum) or, in a column, content-sized (auto basis and
// height; the block content size is both its minimum and its basis). The
// flexible length algorithm then freezes nothing, so item outer sizes are
// affine in the container size. Everything else is Unknown.
import { q, add, cmp } from './linear.mjs';
import { px } from './css.mjs';

const unknown = message => { throw Object.assign(new Error(message), { code: 'U_LAYOUT_FLEX' }); };
const zeroLength = value => ['0', '0px', '0%'].includes(value);
const stretch = value => ['normal', 'stretch', 'auto'].includes(value);

/** Returns the main axis: 'inline' for row, 'block' for column. */
export function validateFlexContainer(style) {
  if (!['row', 'column'].includes(style['flex-direction'])) unknown(`flex-direction ${style['flex-direction']} is outside the row/column flex subset`);
  if (style['flex-wrap'] !== 'nowrap') unknown(`flex-wrap ${style['flex-wrap']} needs a line-breaking flex model`);
  if (!['normal', 'flex-start', 'start'].includes(style['justify-content'])) unknown(`justify-content ${style['justify-content']} moves items; only normal/flex-start/start are modeled`);
  const axis = style['flex-direction'] === 'row' ? 'inline' : 'block';
  // A column's cross axis is the inline axis; items must stretch to the content width.
  if (axis === 'block' && !stretch(style['align-items'])) unknown(`align-items ${style['align-items']} shrink-wraps column items; only normal/stretch is modeled`);
  return axis;
}

const names = axis => axis === 'inline'
  ? { size: 'inline-size', min: 'min-inline-size', sides: ['left', 'right'], label: 'width', minLabel: 'min-width' }
  : { size: 'block-size', min: 'min-block-size', sides: ['top', 'bottom'], label: 'height', minLabel: 'min-height' };
const edges = (style, sides) => sides.map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]))).reduce(add, q(0));
const definite = value => /^\d/.test(value) && !value.endsWith('%');

/**
 * Main-axis track for one in-flow item: `{fixed}` (outer border-box size),
 * `{weight, edges}` (padding+border plus a share of free space) or, in a
 * column, `{auto: true}` (its intrinsic block size, measured by the solver).
 */
export function flexTrack(style, { empty = false, axis = 'inline' } = {}) {
  const n = names(axis);
  if (style.order !== '0') unknown('order changes the item sequence; only order: 0 is modeled');
  if (axis === 'block' && !stretch(style['align-self'])) unknown(`align-self ${style['align-self']} shrink-wraps a column item; only auto/normal/stretch is modeled`);
  // An empty box has a zero content-based minimum; otherwise `auto` depends on content.
  const automatic = style[n.min] === 'auto' && !empty;
  const grow = q(style['flex-grow']), shrink = q(style['flex-shrink']), basis = style['flex-basis'];
  const contentBox = style['box-sizing'] === 'content-box', own = edges(style, n.sides);
  if (cmp(grow, q(0)) > 0) {
    if (!zeroLength(basis)) unknown(`flex-basis ${basis} on a growing item is outside the subset; use a zero basis`);
    if (style[n.size] !== 'auto') unknown(`A flexible item with a ${n.label} is outside the subset; flex sizes it`);
    if (automatic) unknown(`The automatic minimum size of a flex item depends on its content; set ${n.minLabel}: 0`);
    if (style[n.min] !== 'auto' && cmp(px(style[n.min]), q(0)) !== 0) unknown(`A positive ${n.minLabel} on a flexible item can freeze it; only ${n.minLabel}: 0 is modeled`);
    return { weight: grow, edges: own };
  }
  // In a column, an auto basis with an auto height is the block content size,
  // which is also its automatic minimum: it neither grows nor shrinks.
  if (axis === 'block' && basis === 'auto' && style[n.size] === 'auto') {
    if (style[n.min] !== 'auto' && cmp(shrink, q(0)) !== 0) unknown(`A shrinkable content-sized item with an explicit ${n.minLabel} can shrink; use flex-shrink: 0 or ${n.minLabel}: auto`);
    return { auto: true };
  }
  if (cmp(shrink, q(0)) !== 0 && !zeroLength(basis)) unknown('A shrinkable item with a nonzero basis is outside the subset; use flex-shrink: 0');
  let size;
  if (basis === 'auto') {
    if (!definite(style[n.size])) unknown(`flex-basis: auto with an auto ${n.label} uses the content size; give a px ${n.label} or basis`);
    size = px(style[n.size]);
  } else if (basis === 'content') unknown('flex-basis: content uses the content size');
  else if (/%$/.test(basis) && !zeroLength(basis)) unknown(`Percentage flex-basis ${basis} is outside the subset`);
  else {
    if (style[n.size] !== 'auto') unknown(`An item with both flex-basis and ${n.label} is outside the subset; flex-basis wins over ${n.label}`);
    size = zeroLength(basis) ? q(0) : px(basis);
    if (automatic) unknown(`The automatic minimum size of a flex item depends on its content; set an explicit ${n.minLabel}`);
    if (style[n.min] !== 'auto') { const minimum = px(style[n.min]); if (cmp(minimum, size) > 0) size = minimum; }
  }
  return { fixed: contentBox ? add(size, own) : (cmp(size, own) < 0 ? own : size) };
}
