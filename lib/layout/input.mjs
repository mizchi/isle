import {boxTags as tags} from '../../packages/css-verifier/src/layout/input.mjs';
import {validateOptions as validateCSSOptions} from '../../packages/css-verifier/src/layout/input.mjs';
import {accessibilityFacts, phrasingTags} from '../../packages/css-verifier/src/tree.mjs';

export function validateOptions(options) {
  if(!options || Object.hasOwn(options,'name')) throw new Error('Invalid layout options');
  const {component,props,...configuration}=options;
  if(props!==undefined && (!props || typeof props!=='object' || Array.isArray(props))) throw new Error('Invalid layout props');
  return validateCSSOptions({...configuration,...(component!==undefined ? {name:component} : {})});
}

export function extractBoxes(ir, component, unknown) {
  const definitions = new Map(ir.components.map(c => [c.name, c]));
  const scopeOwners=new Map(ir.components.filter(c=>c.style).map(c=>[c.style.scope,c.name]));
  if (!definitions.has(component)) throw new Error(`Unknown layout component: ${component}`);
  let count = 0;
  const visit = (node, path, stack) => {
    if (!node) return null;
    if (++count > 2048 || stack.length > 64) { unknown('U_LAYOUT_LIMIT', 'Box tree limit exceeded'); return null; }
    if (node.kind === 'island') {
      if (node.children.length || stack.includes(node.component)) { unknown('U_LAYOUT_STRUCTURE', 'Opaque children or recursive component boundary'); return null; }
      const root=visit(definitions.get(node.component)?.root, `${path}/${node.component}`, [...stack, node.component]);
      if(root && node.layoutContracts) root.layoutContracts=[...(root.layoutContracts ?? []),...node.layoutContracts];
      return root;
    }
    if (node.kind !== 'element') { unknown('U_LAYOUT_STRUCTURE', `Unsupported template structure: ${node.kind}`); return null; }
    if (!tags.has(node.tag)) unknown('U_LAYOUT_ELEMENT', `Native or foreign element needs a size adapter: ${node.tag}`);
    const attributes = Object.fromEntries(node.attributes.map(attribute => [attribute.name, attribute.value]));
    if (['class', 'id'].some(key => attributes[key] && attributes[key].kind !== 'string') || ['style', 'hidden', 'dir'].some(key => attributes[key])) {
      unknown('U_LAYOUT_STRUCTURE', 'Dynamic class/id, inline style or rendering attributes need an adapter');
    }
    const classes = attributes.class?.kind === 'string' ? attributes.class.value.split(/\s+/).filter(Boolean) : [];
    const scopedOwners=[...new Set(classes.flatMap(name=>scopeOwners.has(name) ? [scopeOwners.get(name)] : []))];
    // lang: the content language (a dynamic value is never a measured language).
    const lang = attributes.lang ? (attributes.lang.kind === 'string' ? attributes.lang.value.trim() : '<dynamic>') : undefined;
    const facts = accessibilityFacts(node.tag, Object.fromEntries(Object.entries(attributes).map(([name, value]) => [name, value.kind === 'string' ? value.value : undefined])));
    const box = { tag: node.tag, classes, id: attributes.id?.value, ...(lang !== undefined ? { lang } : {}), ...facts, owner:scopedOwners.length===1 ? scopedOwners[0] : scopedOwners.length ? '' : stack.at(-1), path, source: node.source, children: [], text: false,
      documentRoot: path === component && node.tag === 'html',...(node.layoutContracts ? {layoutContracts:node.layoutContracts} : {}) };
    if(node.layoutTargets?.length) box.targets=[...node.layoutTargets];
    if(node.layoutIdentity) box.layoutIdentity=node.layoutIdentity;
    box.label = box.id ? `#${box.id}` : classes.length ? classes.map(name => `.${name}`).join('') : `${box.tag}@${path}`;
    // DOM order of text and child elements (text strings and child indices; an expression is unknown text).
    box.runs = [];
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.kind === 'text' || child.kind === 'expression') {
        if (child.kind === 'expression') box.runs.push('dynamic'); else if (child.value.trim()) box.runs.push(child.value.replace(/[\t\n\r ]+/g, ' ').trim());
        if (child.kind === 'expression' || child.value.trim()) box.text = true;
        // Direct text for comparisons; an expression makes it dynamic.
        if (child.kind === 'expression') box.textContent = 'dynamic';
        else if (child.value.trim() && box.textContent !== 'dynamic') box.textContent = [box.textContent, child.value.replace(/[\t\n\r ]+/g, ' ').trim()].filter(Boolean).join(' ');
      } else {
        const nested = visit(child, `${path}/${i}`, stack);
        if (nested) { box.runs.push(box.children.length); box.children.push(nested); }
      }
    }
    // Phrasing children of a text leaf are inline content of that leaf (not layout children).
    const phrasing = child => phrasingTags.has(child.tag) && child.children.every(phrasing);
    if (box.children.length && box.text && box.children.every(phrasing)) { box.inline = box.children; box.children = []; }
    if (box.children.length && box.text) unknown('U_LAYOUT_STRUCTURE', 'Wrap text in an explicit leaf instead of creating anonymous grid items');
    return box;
  };
  return visit(definitions.get(component).root, component, [component]);
}
