import { compoundMatches as exactMatches, PARENT } from './selectors.mjs';
// A match that is not known (a dynamic attribute value) counts as a match: such a selector is never reported.
const compoundMatches = (selector, box) => { try { return exactMatches(selector, box); } catch { return true; } };

// Component scope (opt-in, options.scope): a component's selectors and the parent-child relations they rely on are
// closed in the component's own template. Checked on one tree (one state); an adapter intersects the states.
//   E_SCOPE_OUTSIDE   a compound left of a combinator matches no element of the component: the rule depends on an
//                     ancestor or sibling the page or a parent component provides (where the component is placed)
//   E_SCOPE_REACHES   (unscoped CSS-in-JS: scope.mode 'global') the styled element is not pinned by a class the
//                     component owns, and the element the combinator starts from renders a child component, a slot or
//                     children: the rule can style elements another component renders
// scope = { mode: 'scoped' | 'global', ancestors?: 'scoped' (every compound is scoped, as in Svelte: an ancestor no
// element matches is an unused selector, not a dependency on the page), owned?: string[] (classes the component's stylesheet generates), firstLine?: the
// first line of the component's CSS (the page CSS before it is not the component's) }. The page around the component
// (its html and body wrapper) is not the component's.
const boundaryText = b => b.kind === 'component' ? `<${b.name ?? 'component'}>` : b.kind === 'slot' ? '<slot> content' : b.kind === 'children' ? '{children}' : 'raw HTML';
const subtreeBoundaries = box => [...(box.boundaries ?? []), ...(box.children ?? []).filter(c => !c.anonymous && !c.pseudo).flatMap(subtreeBoundaries)];

export function selectorScope(rules, boxes, scope) {
  const page = box => box.documentRoot || (box.tag === 'body' && box[PARENT]?.documentRoot);
  const elements = boxes.filter(box => !box.anonymous && !box.pseudo && !page(box));
  const owned = new Set(scope.owned ?? []);
  const warnings = [], seen = new Set();
  for (const rule of rules.filter(rule => !rule.attached && !(scope.firstLine && rule.line < scope.firstLine))) for (const selector of rule.selectors) {
    const key = `${selector.source}\u0000${rule.file}\u0000${rule.line}`;
    if (seen.has(key) || !selector.chain?.length) continue; seen.add(key);
    const at = { selector: selector.source, file: rule.file, line: rule.line };
    const outside = scope.ancestors !== 'scoped' && selector.chain.find(({ compound }) => !elements.some(box => compoundMatches(compound, box)));
    if (outside) {
      warnings.push({ code: 'E_SCOPE_OUTSIDE', severity: 'error', ...at, compound: outside.compound.source,
        message: `${selector.source} relies on ${outside.compound.source}, which no element of this component matches: the rule depends on where the component is placed (an ancestor or sibling outside it). Keep the relation inside the component (a class or prop on its own root), or pass the context in as a custom property` });
      continue;
    }
    if (scope.mode !== 'global') continue;
    // Pinned: the styled element carries a class only this component's stylesheet generates.
    if (selector.parts.some(part => part.kind === 'class' && owned.has(part.value))) continue;
    const { compound, combinator } = selector.chain[0];
    const starts = elements.filter(box => compoundMatches(compound, box));
    const reached = starts.flatMap(box => combinator === '>' ? box.boundaries ?? [] : combinator === ' ' ? subtreeBoundaries(box) : []);
    // + and ~: the styled element is a sibling; a boundary beside the start (in its parent) can render it.
    const siblings = ['+', '~'].includes(combinator) ? [...new Set(starts.flatMap(box => box[PARENT]?.boundaries ?? []))] : [];
    const found = [...reached, ...siblings];
    if (found.length) warnings.push({ code: 'E_SCOPE_REACHES', severity: 'error', ...at, boundaries: [...new Set(found.map(boundaryText))],
      message: `${selector.source} can style elements of ${[...new Set(found.map(boundaryText))].join(', ')}, which another component renders: styles for those elements belong to the component that renders them (give it a class or a variant prop), and this selector should name a class of this component` });
  }
  return { warnings };
}
