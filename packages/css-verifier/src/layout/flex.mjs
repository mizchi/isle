// Flex subset (css-flexbox-1): a single-line row container whose items are
// either fixed (no grow, no shrink, definite basis) or flexible (zero basis,
// explicit zero minimum). In this subset the flexible length algorithm has no
// min/max violations to freeze, so item outer sizes are affine in the
// container size. Everything else is Unknown.
import { q, add, cmp } from './linear.mjs';
import { px } from './css.mjs';

const unknown = message => { throw Object.assign(new Error(message), { code: 'U_LAYOUT_FLEX' }); };
const zeroLength = value => ['0', '0px', '0%'].includes(value);

export function validateFlexContainer(style) {
  if (style['flex-direction'] !== 'row') unknown(`flex-direction ${style['flex-direction']} is outside the row flex subset`);
  if (style['flex-wrap'] !== 'nowrap') unknown(`flex-wrap ${style['flex-wrap']} needs a line-breaking flex model`);
  if (!['normal', 'flex-start', 'start'].includes(style['justify-content'])) unknown(`justify-content ${style['justify-content']} moves items; only normal/flex-start/start are modeled`);
}

const edges = style => ['left', 'right'].map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]))).reduce(add, q(0));

/**
 * Track definition for one in-flow item: `{fixed}` (outer border-box size) or
 * `{weight, edges}` (flexible: padding+border plus a share of free space).
 */
export function flexTrack(style, { empty = false } = {}) {
  // An empty box has a zero content-based minimum; otherwise `auto` depends on content.
  const automatic = style['min-inline-size'] === 'auto' && !empty;
  if (style.order !== '0') unknown('order changes the item sequence; only order: 0 is modeled');
  const grow = q(style['flex-grow']), shrink = q(style['flex-shrink']), basis = style['flex-basis'];
  const contentBox = style['box-sizing'] === 'content-box', own = edges(style);
  if (cmp(grow, q(0)) > 0) {
    if (!zeroLength(basis)) unknown(`flex-basis ${basis} on a growing item is outside the subset; use a zero basis`);
    if (style['inline-size'] !== 'auto') unknown('A flexible item with a width is outside the subset; flex sizes it');
    if (automatic) unknown('The automatic minimum size of a flex item depends on its content; set min-width: 0');
    if (style['min-inline-size'] !== 'auto' && cmp(px(style['min-inline-size']), q(0)) !== 0) unknown('A positive min-width on a flexible item can freeze it; only min-width: 0 is modeled');
    return { weight: grow, edges: own };
  }
  if (cmp(shrink, q(0)) !== 0 && !zeroLength(basis)) unknown('A shrinkable item with a nonzero basis is outside the subset; use flex-shrink: 0');
  let size;
  if (basis === 'auto') {
    if (!/^\d/.test(style['inline-size']) || style['inline-size'].endsWith('%')) unknown('flex-basis: auto with an auto width uses the content size; give a px width or basis');
    size = px(style['inline-size']);
  } else if (basis === 'content') unknown('flex-basis: content uses the content size');
  else if (/%$/.test(basis) && !zeroLength(basis)) unknown(`Percentage flex-basis ${basis} is outside the subset`);
  else {
    if (style['inline-size'] !== 'auto') unknown('An item with both flex-basis and width is outside the subset; flex-basis wins over width');
    size = zeroLength(basis) ? q(0) : px(basis);
    // Without a width, the automatic minimum is the content size.
    if (automatic) unknown('The automatic minimum size of a flex item depends on its content; set an explicit min-width');
    if (style['min-inline-size'] !== 'auto') { const minimum = px(style['min-inline-size']); if (cmp(minimum, size) > 0) size = minimum; }
  }
  return { fixed: contentBox ? add(size, own) : (cmp(size, own) < 0 ? own : size) };
}
