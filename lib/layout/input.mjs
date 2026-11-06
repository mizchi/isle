import { q, cmp } from './linear.mjs';
import { simpleSelector } from './css.mjs';
const tags = new Set('div main aside section article nav header footer p span a strong em b i small h1 h2 h3 h4 h5 h6 output label'.split(' '));
const supportedOptions = new Set(['component', 'css', 'cssFile', 'reset', 'ancestors', 'viewport', 'hostInset', 'hostBlockInset', 'block', 'boxes']);
const supportedContract = new Set(['minInlineSize', 'minBlockSize', 'intrinsicBlockSize', 'wrap', 'overflow', 'overflowBlock']);
function finiteSize(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error(`Invalid layout ${name}`);
  return q(value);
}
export function validateOptions(options) {
  if (!options || Object.keys(options).some(key => !supportedOptions.has(key))) throw new Error('Invalid layout options');
  if (typeof options.css !== 'string' || options.css.length > 1_000_000) throw new Error('Invalid layout CSS input');
  if (options.reset !== undefined && (!Array.isArray(options.reset) || options.reset.length > 32 || options.reset.some(sheet => !sheet || typeof sheet.css !== 'string' || Object.keys(sheet).some(k => !['css', 'file'].includes(k)) || (sheet.file !== undefined && typeof sheet.file !== 'string')))) throw new Error('Invalid reset stylesheet contract');
  if ((options.reset ?? []).reduce((n, sheet) => n + sheet.css.length, options.css.length) > 1_000_000) throw new Error('Reset and app CSS size limit exceeded');
  if (options.ancestors !== undefined && (!Array.isArray(options.ancestors) || options.ancestors.length > 32 || options.ancestors.some(ancestor => !ancestor || (!tags.has(ancestor.tag) && !['html', 'body'].includes(ancestor.tag)) || Object.keys(ancestor).some(k => !['tag', 'id', 'classes'].includes(k)) || (ancestor.id !== undefined && typeof ancestor.id !== 'string') || (ancestor.classes !== undefined && (!Array.isArray(ancestor.classes) || ancestor.classes.some(c => typeof c !== 'string')))))) throw new Error('Invalid ancestor contract: use supported HTML elements');
  if (!options.viewport || Object.keys(options.viewport).some(key => !['min', 'max', 'height'].includes(key))) throw new Error('Invalid viewport contract');
  const min = finiteSize(options.viewport?.min, 'viewport minimum'), max = finiteSize(options.viewport?.max, 'viewport maximum');
  if (cmp(min, max) > 0) throw new Error('Invalid viewport interval');
  finiteSize(options.hostInset ?? 0, 'hostInset');
  finiteSize(options.hostBlockInset ?? 0, 'hostBlockInset');
  if (options.block !== undefined && typeof options.block !== 'boolean') throw new Error('Invalid block option');
  if (options.block === true && !options.viewport.height) throw new Error('Block checking requires a viewport height interval');
  if (options.viewport.height !== undefined) {
    const h = options.viewport.height;
    if (!h || typeof h !== 'object' || Array.isArray(h) || Object.keys(h).some(key => !['min', 'max'].includes(key)) || options.block === false) throw new Error('Invalid viewport height contract');
    if (cmp(finiteSize(h.min, 'viewport height'), finiteSize(h.max, 'viewport height')) > 0) throw new Error('Invalid viewport height interval');
  }
  if (options.boxes === null || (options.boxes !== undefined && (typeof options.boxes !== 'object' || Array.isArray(options.boxes)))) throw new Error('Invalid box contracts');
  for (const [selector, contract] of Object.entries(options.boxes ?? {})) {
    if (!selector || !simpleSelector.test(selector) || !contract || Object.keys(contract).some(key => !supportedContract.has(key))) throw new Error('Invalid box contract');
    if (contract.minInlineSize !== undefined) finiteSize(contract.minInlineSize, 'minInlineSize');
    if (contract.minBlockSize !== undefined) finiteSize(contract.minBlockSize, 'minBlockSize');
    if (contract.intrinsicBlockSize !== undefined) {
      if (Array.isArray(contract.intrinsicBlockSize)) {
        const profile = contract.intrinsicBlockSize;
        if (!profile.length || profile.length > 32) throw new Error('Invalid intrinsic block profile');
        let previous = -1;
        for (const entry of profile) {
          finiteSize(entry.atLeastInlineSize, 'profile width'); finiteSize(entry.blockSize, 'profile blockSize');
          if (entry.atLeastInlineSize <= previous || Object.keys(entry).some(k => !['atLeastInlineSize', 'blockSize'].includes(k))) throw new Error('Invalid intrinsic block profile order');
          previous = entry.atLeastInlineSize;
        }
      } else finiteSize(contract.intrinsicBlockSize, 'intrinsicBlockSize');
    }
    if (contract.wrap !== undefined && !['normal', 'anywhere', 'nowrap'].includes(contract.wrap)) throw new Error('Invalid wrap contract');
    if (contract.overflow !== undefined && !['fit', 'scroll', 'clip', 'visible'].includes(contract.overflow)) throw new Error('Invalid overflow contract');
    if (contract.overflowBlock !== undefined && !['fit', 'scroll', 'clip', 'visible'].includes(contract.overflowBlock)) throw new Error('Invalid block overflow contract');
  }
  return { min, max, minInclusive: true, maxInclusive: true };
}

export function extractBoxes(ir, component, unknown) {
  const definitions = new Map(ir.components.map(c => [c.name, c]));
  if (!definitions.has(component)) throw new Error(`Unknown layout component: ${component}`);
  let count = 0;
  const visit = (node, path, stack) => {
    if (!node) return null;
    if (++count > 2048 || stack.length > 64) { unknown('U_LAYOUT_LIMIT', 'Box tree limit exceeded'); return null; }
    if (node.kind === 'island') {
      if (node.children.length || stack.includes(node.component)) { unknown('U_LAYOUT_STRUCTURE', 'Opaque children or recursive component boundary'); return null; }
      return visit(definitions.get(node.component)?.root, `${path}/${node.component}`, [...stack, node.component]);
    }
    if (node.kind !== 'element') { unknown('U_LAYOUT_STRUCTURE', `Unsupported template structure: ${node.kind}`); return null; }
    if (!tags.has(node.tag)) unknown('U_LAYOUT_ELEMENT', `Native or foreign element needs a size adapter: ${node.tag}`);
    const attributes = Object.fromEntries(node.attributes.map(attribute => [attribute.name, attribute.value]));
    if (['class', 'id'].some(key => attributes[key] && attributes[key].kind !== 'string') || ['style', 'hidden', 'dir'].some(key => attributes[key])) {
      unknown('U_LAYOUT_STRUCTURE', 'Dynamic class/id, inline style or rendering attributes need an adapter');
    }
    const classes = attributes.class?.kind === 'string' ? attributes.class.value.split(/\s+/).filter(Boolean) : [];
    const box = { tag: node.tag, classes, id: attributes.id?.value, path, source: node.source, children: [], text: false };
    box.label = box.id ? `#${box.id}` : classes.length ? classes.map(name => `.${name}`).join('') : `${box.tag}@${path}`;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.kind === 'text' || child.kind === 'expression') {
        if (child.kind === 'expression' || child.value.trim()) box.text = true;
      } else {
        const nested = visit(child, `${path}/${i}`, stack);
        if (nested) box.children.push(nested);
      }
    }
    if (box.children.length && box.text) unknown('U_LAYOUT_STRUCTURE', 'Wrap text in an explicit leaf instead of creating anonymous grid items');
    return box;
  };
  return visit(definitions.get(component).root, component, [component]);
}
