import {boxTags as tags} from '../../packages/css-verifier/src/layout/input.mjs';
import {validateOptions as validateCSSOptions} from '../../packages/css-verifier/src/layout/input.mjs';

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
    const box = { tag: node.tag, classes, id: attributes.id?.value, owner:scopedOwners.length===1 ? scopedOwners[0] : scopedOwners.length ? '' : stack.at(-1), path, source: node.source, children: [], text: false,
      documentRoot: path === component && node.tag === 'html',...(node.layoutContracts ? {layoutContracts:node.layoutContracts} : {}) };
    if(node.layoutTargets?.length) box.targets=[...node.layoutTargets];
    if(node.layoutIdentity) box.layoutIdentity=node.layoutIdentity;
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
