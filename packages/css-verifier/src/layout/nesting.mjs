// CSS Nesting 1: nested style rules flattened into plain ones, in place, before the stylesheet is read.
//
//   .card { color: red; & .title { … } > .x { … } @media (…) { gap: 0 } margin: 0 }
//     → .card { color: red }  .card .title { … }  .card > .x { … }  @media (…) { .card { gap: 0 } }  .card { margin: 0 }
//
// & is the parent selector; a nested selector without & is relative to it (a descendant, or the combinator it starts
// with). A nested conditional rule (@media, @supports, @container) wraps a rule of the parent selector. Declarations
// after a nested rule are a rule of their own that comes after it (CSS Nesting's nested declarations rule), so the order
// of appearance is kept. & means :is(parent list), whose specificity is the largest of the list: a parent list whose
// selectors have different specificities would give each expanded selector its own, so it is refused (the caller
// reports Unknown), as are a pseudo-element parent and nesting inside rules other than the conditional ones.
import { compileSelector } from './selectors.mjs';

const conditional = new Set(['media', 'supports', 'container']);
const fail = message => { throw new Error(message); };

function resolve(parents, nested) {
  const specificities = parents.map(p => { try { return compileSelector(p).specificity.join(','); } catch { return null; } });
  return nested.flatMap(selector => {
    const s = selector.trim();
    if (s.includes('&')) {
      if (parents.length > 1 && new Set(specificities).size > 1) fail(`& in ${s} stands for :is(${parents.join(', ')}), whose specificity differs between them, which is not modeled`);
      // & is :is(parent): a complex parent (with combinators) written out in place means the same only where & starts
      // the selector, once (.x & with parent .a .b is .x :is(.a .b), which .x .a .b would narrow).
      const complex = parents.some(p => /[\s>+~]/.test(p.replace(/\([^)]*\)/g, '()').trim()));
      if (complex && (!s.startsWith('&') || (s.match(/&/g) ?? []).length > 1)) fail(`${s} puts & after other selectors while its parent ${parents.join(', ')} has combinators: :is() of a complex selector there is not modeled`);
      return parents.map(p => s.replace(/&/g, p));
    }
    // A relative selector: a descendant of the parent, or joined by the combinator it starts with.
    return parents.map(p => `${p} ${s}`);
  });
}

// The plain nodes of one style rule with nested children.
function flattenRule(rule) {
  const parents = rule.selectors;
  if (parents.some(p => /::/.test(p))) fail(`${rule.selector}: nesting under a pseudo-element is not modeled`);
  const out = [];
  let current = null;
  const declarations = () => { if (!current) { current = rule.clone({ nodes: [] }); out.push(current); } return current; };
  for (const node of [...rule.nodes]) {
    if (node.type === 'decl' || node.type === 'comment') { declarations().append(node.clone()); continue; }
    current = null; // declarations after a nested rule start a new rule after it
    if (node.type === 'rule') {
      const nested = node.clone({ selector: resolve(parents, node.selectors).join(', ') });
      out.push(...(nested.nodes.some(n => n.type !== 'decl' && n.type !== 'comment') ? flattenRule(nested) : [nested]));
    } else if (node.type === 'atrule' && conditional.has(node.name.toLowerCase()) && node.nodes) {
      const inner = rule.clone({ nodes: node.nodes.map(n => n.clone()) });
      const wrapped = node.clone({ nodes: [] });
      for (const n of flattenRule(inner)) wrapped.append(n);
      out.push(wrapped);
    } else fail(`@${node.name ?? node.type} nested in ${rule.selector} is not modeled`);
  }
  return out.filter(n => n.type !== 'rule' || n.nodes.length);
}

export function flattenNesting(container) {
  for (const node of [...(container.nodes ?? [])]) {
    if (node.type === 'rule' && node.nodes?.some(n => n.type !== 'decl' && n.type !== 'comment')) node.replaceWith(...flattenRule(node));
    else if (node.type === 'atrule' && node.nodes && conditional.has(node.name.toLowerCase())) flattenNesting(node);
    else if (node.type === 'atrule' && node.nodes && ['layer', 'scope'].includes(node.name.toLowerCase())) flattenNesting(node);
  }
  return container;
}

