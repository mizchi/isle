import { compoundMatches as exactMatches, neighbors } from './selectors.mjs';
// A match that is not known (a dynamic attribute value) counts as a match: such a selector is never reported.
const compoundMatches = (selector, box) => { try { return exactMatches(selector, box); } catch { return true; } };

// Selector usage (opt-in, options.selectors): every stylesheet selector against the elements of the analysed tree.
// A selector is judged on the element it styles: user-action states and pseudo-elements are ignored, since the
// question is whether the template has such an element at all. Reports:
//   W_CSS_SELECTOR_UNMATCHED  no element matches the rightmost compound (a near class name is suggested)
//   W_CSS_SELECTOR_RELATION   elements match each compound, but the combinators never hold together
// One tree is one state of the template; an adapter with several states (branches) intersects the warnings.
const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    // A transposition (itme → item) is one edit (Damerau).
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
};
const relationWords = { '>': ['has a parent matching', 'parents'], ' ': ['is inside an element matching', 'ancestors'], '+': ['directly follows an element matching', 'previous siblings'], '~': ['follows an element matching', 'earlier siblings'] };

export function selectorUsage(rules, boxes) {
  const elements = boxes.filter(box => !box.anonymous && !box.pseudo);
  const classes = new Set(elements.flatMap(box => box.classes));
  const rows = [], warnings = [];
  const seen = new Set();
  for (const rule of rules.filter(rule => !rule.attached)) for (const selector of rule.selectors) {
    const key = `${selector.source}\u0000${rule.file}\u0000${rule.line}`;
    if (seen.has(key)) continue; seen.add(key);
    const subjects = elements.filter(box => compoundMatches(selector, box));
    // Walk the chain outward, keeping the elements still in play at each step.
    let frontier = subjects, broken = null;
    for (let i = 0; i < (selector.chain ?? []).length && frontier.length; i++) {
      const { compound, combinator } = selector.chain[i];
      const next = [...new Set(frontier.flatMap(box => neighbors(box, combinator).filter(n => compoundMatches(compound, n))))];
      if (!next.length) { broken = { i, compound, combinator, from: frontier }; frontier = []; break; }
      frontier = next;
    }
    const holds = (box, i) => i >= (selector.chain ?? []).length || neighbors(box, selector.chain[i].combinator).some(n => compoundMatches(selector.chain[i].compound, n) && holds(n, i + 1));
    const matched = broken ? 0 : subjects.filter(box => holds(box, 0)).length;
    const row = { selector: selector.source, file: rule.file, line: rule.line, matched };
    rows.push(row);
    if (!subjects.length) {
      const missing = selector.parts.filter(part => part.kind === 'class' && !classes.has(part.value)).map(part => part.value);
      const near = missing.flatMap(name => [...classes].filter(c => c !== name && distance(c, name) <= (name.length <= 5 ? 1 : 2)).map(c => `.${c}`));
      warnings.push({ code: 'W_CSS_SELECTOR_UNMATCHED', severity: 'warning', selector: selector.source, file: rule.file, line: rule.line,
        message: `${selector.source} matches no element of the template${missing.length ? ` (no element has class ${missing.map(m => `.${m}`).join(', ')})` : ''}${near.length ? `; did you mean ${[...new Set(near)].join(' or ')}?` : ''}` });
    } else if (broken) {
      const [verb, noun] = relationWords[broken.combinator];
      const actual = [...new Set(broken.from.flatMap(box => neighbors(box, broken.combinator)).map(box => box.label))].slice(0, 6);
      const right = broken.i === 0 ? selector.parts.map(p => p.kind === 'class' ? `.${p.value}` : p.kind === 'id' ? `#${p.value}` : p.kind === 'tag' ? p.value : '').join('') || selector.source : broken.compound.source;
      warnings.push({ code: 'W_CSS_SELECTOR_RELATION', severity: 'warning', selector: selector.source, file: rule.file, line: rule.line, link: { combinator: broken.combinator, compound: broken.compound.source },
        message: `${selector.source}: ${broken.from.length} element(s) match ${broken.i === 0 ? right : `the part right of ${broken.compound.source}`}, but none ${verb} ${broken.compound.source}; ${actual.length ? `their ${noun} are ${actual.join(', ')}` : `they have no ${noun}`}. The selector and the template's structure disagree` });
    }
  }
  return { rows, warnings };
}
