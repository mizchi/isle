import postcss from 'postcss';

// Contracts remain simple; stylesheet selectors additionally support reset idioms.
export {simpleSelector} from './simple-selector.mjs';
export const greaterRank = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return true; };
const combine = (a, b) => a.map((value, i) => value + b[i]);
/** The parent element of a box (set by the tree builder; a symbol, so spread copies keep it and JSON skips it). */
export const PARENT = Symbol('parent');
// Split a complex selector at its top-level combinators: [{ combinator, text }], combinator joining it to the left.
function splitComplex(source) {
  const out = []; let depth = 0, current = '', pending = null, i = 0;
  const push = () => { if (current.trim()) { out.push({ combinator: out.length ? (pending ?? ' ') : null, text: current.trim() }); current = ''; pending = null; } };
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (depth === 0 && (c === '>' || c === '+' || c === '~')) { if (!current.trim() && !out.length) throw new Error(`Unsupported selector: ${source}`); push(); if (pending) throw new Error(`Unsupported selector: ${source}`); pending = c; continue; }
    if (depth === 0 && /\s/.test(c)) { push(); continue; }
    current += c;
  }
  push();
  if (pending) throw new Error(`Unsupported selector: ${source}`);
  return out;
}
export function compileSelector(source, depth = 0) {
  const compounds = splitComplex(String(source));
  if (compounds.length <= 1) return compileCompound(source, depth);
  // Combinators inside :is()/:where() are not modeled.
  if (depth > 0) throw new Error(`Unsupported selector: ${source}`);
  const compiled = compounds.map(c => ({ ...compileCompound(c.text, depth), combinator: c.combinator }));
  for (const c of compiled.slice(0, -1)) if (c.state || c.pseudoElement) throw new Error(`Unsupported selector (a state or pseudo-element before a combinator): ${source}`);
  const subject = compiled.at(-1);
  // chain: from the compound left of the subject outward, each with the combinator that joins it to its right.
  const chain = compiled.slice(0, -1).map((c, i) => ({ compound: c, combinator: compiled[i + 1].combinator })).reverse();
  return { ...subject, source, specificity: compiled.reduce((a, c) => combine(a, c.specificity), [0, 0, 0]), chain, combinator: undefined };
}
function compileCompound(source, depth = 0) {
  if (depth > 8 || !source.trim()) throw new Error('Selector nesting limit or empty selector');
  let rest = source.trim(), specificity = [0, 0, 0], pseudoElement, state;
  const parts = [];
  const tag = rest.match(/^(?:[a-zA-Z][\w-]*|\*)/);
  if (tag) {
    parts.push({ kind: 'tag', value: tag[0].toLowerCase() });
    if (tag[0] !== '*') specificity[2]++;
    rest = rest.slice(tag[0].length);
  }
  while (rest) {
    const token = rest.match(/^([.#])([a-zA-Z_][\w-]*)/);
    if (token) {
      parts.push({ kind: token[1] === '.' ? 'class' : 'id', value: token[2] });
      specificity[token[1] === '.' ? 1 : 0]++; rest = rest.slice(token[0].length); continue;
    }
    const root = rest.match(/^:root(?![\w-])/i);
    if (root) { parts.push({ kind: 'root' }); specificity[1]++; rest = rest.slice(root[0].length); continue; }
    // A trailing user-action state (paint-only rules; see parseLayoutCSS).
    const action = rest.match(/^:(hover|active|focus|focus-visible|focus-within|checked)$/i);
    if (action) { state = action[1].toLowerCase(); specificity[1]++; rest = ''; continue; }
    // :checked::before / :checked::after: the generated check mark of a custom checkbox.
    const checkedMark = rest.match(/^:checked::?(before|after)$/i);
    if (checkedMark) { state = 'checked'; pseudoElement = checkedMark[1].toLowerCase(); specificity[1]++; specificity[2]++; rest = ''; continue; }
    const pseudo = rest.match(/^::?(before|after)$/i) ?? rest.match(/^::(placeholder)$/i);
    if (pseudo) { pseudoElement = pseudo[1].toLowerCase(); specificity[2]++; rest = ''; continue; }
    // Attribute selectors: [a], [a=v], [a~=v], [a|=v], [a^=v], [a$=v], [a*=v], with the i/s flags.
    const attribute = rest.match(/^\[\s*([a-zA-Z_][\w:-]*)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]"']+))\s*([iIsS])?\s*)?\]/);
    if (attribute) {
      parts.push({ kind: 'attribute', name: attribute[1].toLowerCase(), ...(attribute[2] ? { operator: attribute[2], value: attribute[3] ?? attribute[4] ?? attribute[5], insensitive: /i/i.test(attribute[6] ?? '') } : {}) });
      specificity[1]++; rest = rest.slice(attribute[0].length); continue;
    }
    // :not(list): matches when no argument does; its specificity is its most specific argument's. States and
    // pseudo-elements inside it are not modeled.
    const not = rest.match(/^:not\(/i);
    if (not) {
      let level = 1, end = not[0].length;
      while (end < rest.length && level) { if (rest[end] === '(') level++; if (rest[end] === ')') level--; end++; }
      if (level) throw new Error(`Unclosed selector function: ${source}`);
      const choices = postcss.list.comma(rest.slice(not[0].length, end - 1)).map(s => compileSelector(s, depth + 1));
      if (choices.some(c => c.state || c.pseudoElement)) throw new Error(`Unsupported selector (a state or pseudo-element inside :not()): ${source}`);
      parts.push({ kind: 'not', choices });
      specificity = combine(specificity, choices.reduce((best, c) => greaterRank(c.specificity, best) ? c.specificity : best, [0, 0, 0]));
      rest = rest.slice(end); continue;
    }
    const fn = rest.match(/^:(where|is)\(/i);
    if (fn) {
      let level = 1, end = fn[0].length;
      while (end < rest.length && level) { if (rest[end] === '(') level++; if (rest[end] === ')') level--; end++; }
      if (level) throw new Error(`Unclosed selector function: ${source}`);
      // Pseudo-elements are invalid in these forgiving lists, so those branches cannot match.
      const choices = postcss.list.comma(rest.slice(fn[0].length, end - 1)).map(s => compileSelector(s, depth + 1)).filter(s => !s.pseudoElement);
      parts.push({ kind: 'any', choices });
      if (fn[1].toLowerCase() === 'is') specificity = combine(specificity, choices.reduce((best, s) => greaterRank(s.specificity, best) ? s.specificity : best, [0, 0, 0]));
      rest = rest.slice(end); continue;
    }
    throw new Error(`Unsupported selector: ${source}`);
  }
  return { source, parts, specificity, pseudoElement, ...(state ? { state } : {}) };
}
/** `state` is the set of user-action states that hold (e.g. focus): a state selector matches only then. */
export function matches(selector, box, state) {
  if (typeof selector === 'string') selector = compileSelector(selector);
  if (box.anonymous) return false; // anonymous boxes are not elements
  // ::before/::after rules apply only to that pseudo-element (state '::before'), and other rules not to it.
  const pseudo = [...(state ?? [])].find(s => s === '::before' || s === '::after' || s === '::placeholder');
  if (selector.pseudoElement ? `::${selector.pseudoElement}` !== pseudo : pseudo) return false;
  if (selector.state && !state?.has(selector.state)) return false;
  return compoundMatches(selector, box) && (!selector.chain || related(selector.chain, 0, box));
}
const elementSiblings = box => (box[PARENT]?.children ?? []).filter(child => !child.anonymous && !child.pseudo);
function related(chain, i, box) {
  if (i >= chain.length) return true;
  const { compound, combinator } = chain[i];
  return neighbors(box, combinator).some(c => compoundMatches(compound, c) && related(chain, i + 1, c));
}
/** The elements a combinator reaches from a box: its parent (>), ancestors (descendant), previous sibling (+) or earlier siblings (~). */
export function neighbors(box, combinator) {
  if (combinator === '>') return box[PARENT] ? [box[PARENT]] : [];
  if (combinator === ' ') { const out = []; for (let p = box[PARENT]; p; p = p[PARENT]) out.push(p); return out; }
  const siblings = elementSiblings(box), at = siblings.findIndex(s => s === box || s.path === box.path);
  const before = at > 0 ? siblings.slice(0, at) : [];
  return combinator === '+' ? before.slice(-1) : before.reverse();
}
/** The compound (tag, classes, id, :root, :is/:where) alone, ignoring states, pseudo-elements and combinators. */
export function compoundMatches(selector, box) {
  if (box.anonymous) return false;
  return selector.parts.every(part => part.kind === 'tag' ? part.value === '*' || box.tag === part.value :
    part.kind === 'class' ? box.classes.includes(part.value) : part.kind === 'id' ? box.id === part.value :
    part.kind === 'root' ? box.documentRoot === true : part.kind === 'path' ? box.path === part.value :
    part.kind === 'attribute' ? attributeMatches(part, box) : part.kind === 'not' ? !part.choices.some(choice => matches(choice, box)) :
    part.choices.some(choice => matches(choice, box)));
}
// An adapter renders a dynamic attribute value as this placeholder: a value test against it is not known.
const DYNAMIC_VALUE = 'dynamic';
function attributeMatches(part, box) {
  const attributes = box.attributes ?? {};
  if (!Object.hasOwn(attributes, part.name)) return false;
  if (!part.operator) return true;
  const raw = attributes[part.name];
  // Not known: treated as no match here; dynamicAttributeTests reports it (the analysis is Unknown).
  if (raw === undefined || raw === DYNAMIC_VALUE) return false;
  const fold = v => part.insensitive ? v.toLowerCase() : v, have = fold(String(raw)), want = fold(part.value);
  switch (part.operator) {
    case '=': return have === want;
    case '~=': return want !== '' && !/\s/.test(want) && have.split(/\s+/).includes(want);
    case '|=': return have === want || have.startsWith(`${want}-`);
    case '^=': return want !== '' && have.startsWith(want);
    case '$=': return want !== '' && have.endsWith(want);
    case '*=': return want !== '' && have.includes(want);
  }
  return false;
}

/** The value tests of a selector (any compound, :is/:where/:not arguments) on an attribute that is dynamic on this
 * box, where the compound's other parts match it: whether the rule applies is not known. */
export function dynamicAttributeTests(selector, box) {
  const dynamic = part => part.kind === 'attribute' && part.operator && Object.hasOwn(box.attributes ?? {}, part.name) && [undefined, DYNAMIC_VALUE].includes(box.attributes[part.name]);
  const compounds = sel => [sel, ...(sel.chain ?? []).map(link => link.compound)];
  const out = [];
  const visit = sel => {
    for (const compound of compounds(sel)) {
      for (const part of compound.parts) if (part.choices) part.choices.forEach(visit);
      const tests = compound.parts.filter(dynamic);
      if (tests.length && compound.parts.filter(part => !dynamic(part) && !part.choices).every(part => compoundMatches({ parts: [part] }, box))) out.push(...tests);
    }
  };
  visit(selector);
  return out;
}
