import { childGroups, childrenOf, hasControls, hasRegionExpressions } from './template.mjs';
/** Unsupported owner/HTML combinations fail during compilation, never during a user interaction. */
export function checkControlContracts(ir) {
  const diagnostics = [];
  for (const component of ir.components) {
    const regions = hasControls(component.root) || hasRegionExpressions(component) || [...component.props, ...component.states].some(field => !['number', 'string', 'boolean'].includes(field.type));
    if (!regions) continue;
    const fail = (node, message) => diagnostics.push({ code: 'E_CONTROL_CONTRACT', message,
      hint: 'Use pure universal children and ordinary DOM containers. Put schema forms and independent client owners in a static sibling component.', ...(node.source ?? { start: 0, end: 1 }) });
    if (component.root.kind !== 'element' || ['input', 'br', 'textarea', 'select', 'option'].includes(component.root.tag)) fail(component.root, 'Region owners require a non-void native container root');
    // Universal holes are compile-time templates; caller fragments are already
    // expanded in client owners. A client slot still requires runtime projection.
    function walk(node, restricted = false) {
      if (node.kind === 'island' || (node.kind === 'slot' && !(component.side === 'universal' && component.children)) || node.form || ['textarea', 'select', 'option'].includes(node.tag)) fail(node, 'This region backend does not yet support this owner, fragment or native control');
      if (restricted && ['select', 'each', 'boundary'].includes(node.kind)) fail(node, 'Control ranges cannot be nested inside text-only native content');
      childrenOf(node).forEach(child => walk(child, restricted || ['textarea', 'option'].includes(node.tag)));
    }
    walk(component.root);
    // Local IDs belong to one generated frame; cross-frame ARIA/label edges would be dangling.
    function block(nodes) {
      const ids = new Set(), references = [];
      function collect(node) {
        if (['select', 'each', 'boundary'].includes(node.kind)) { childGroups(node).forEach(block); return; }
        for (const attr of node.attributes ?? []) {
          if (attr.name === 'id') ids.add(attr.value.value);
          if (['for', 'aria-labelledby', 'aria-describedby', 'aria-errormessage'].includes(attr.name)) references.push([node, attr.value.value]);
        }
        childrenOf(node).forEach(collect);
      }
      nodes.forEach(collect);
      for (const [node, value] of references) if (String(value).split(/\s+/).some(id => !ids.has(id))) fail(node, 'Local ID references cannot cross a control-frame boundary');
    }
    block([component.root]);
  }
  return diagnostics;
}
