// ADR-0002 explanation facts. They describe which cascade winners fed the two
// sides of an obligation. They are attached to findings after the geometry is
// decided and are never read by the proof, the region split or Z3.

const sides = axis => axis === 'inline' ? ['left', 'right'] : ['top', 'bottom'];
const sizeProperty = axis => axis === 'inline' ? 'inline-size' : 'block-size';
/** Properties that determine a box's own border/content size on one axis. */
export const sizeProperties = axis => ['box-sizing', sizeProperty(axis), `min-${sizeProperty(axis)}`,
  ...sides(axis).flatMap(side => [`padding-${side}`, `border-${side}`])];
export const trackProperties = axis => axis === 'inline' ? ['grid-template-columns', 'column-gap'] : ['grid-template-rows', 'grid-auto-rows', 'row-gap'];
const placementProperty = axis => axis === 'inline' ? 'grid-column' : 'grid-row';
const isDefault = (style, property) => !style.$sources[property];
const definite = value => /^(?:\d+(?:\.\d+)?px|0)$/.test(value);

/** One cascade winner (or the initial/UA value), with dormant conditional writes. */
export function fact(box, style, property) {
  const css = style.$sources[property], dormant = style.$dormant?.[property];
  return {path: box.path, box: box.label, property, value: style[property],
    ...(css ? {origin: 'author', css: clean(css)} : {origin: 'default'}),
    ...(dormant?.length ? {dormant: dormant.map(css => ({css: clean(css)}))} : {})};
}
const clean = ({file, line, selector, layer, specified, conditions}) => ({file, line, selector, ...(layer ? {layer} : {}), specified, ...(conditions ? {conditions} : {})});

/**
 * Facts for the size a box offers its content on `axis`, walking ancestors
 * only while the size still depends on the containing block. A definite
 * length ends the path; an auto root depends on the viewport/host.
 */
export function sizeChain(chain, axis, {hostInset = 0} = {}) {
  const facts = [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const {box, style} = chain[i];
    if (!style) break;
    for (const property of sizeProperties(axis)) if (!isDefault(style, property) || property === sizeProperty(axis)) facts.push(fact(box, style, property));
    const own = style[sizeProperty(axis)];
    if (definite(own) || style.position === 'absolute') return facts;
    const parent = chain[i - 1];
    if (parent?.style) {
      // A grid item's area comes from the parent's tracks and gaps.
      for (const property of trackProperties(axis)) facts.push(fact(parent.box, parent.style, property));
      facts.push(fact(box, style, placementProperty(axis)));
    }
  }
  facts.push({kind: 'viewport', axis, ...(hostInset ? {hostInset} : {})});
  return facts;
}

export function contractFact(box, property) {
  return {kind: 'contract', path: box.path, box: box.label, property, value: box.contract[property], selector: box.contractSelector, trusted: true};
}

export const explanation = (available, required) => ({version: 1, available: {facts: available}, required: {facts: required}});
