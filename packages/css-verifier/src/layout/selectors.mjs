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
// complex: a selector argument of :is() / :where() / :not(), which may hold combinators (each is matched as a whole).
export function compileSelector(source, depth = 0, complex = false) {
  const compounds = splitComplex(String(source));
  if (compounds.length <= 1) return compileCompound(source, depth);
  // Combinators inside :is()/:where() are not modeled.
  if (depth > 0 && !complex) throw new Error(`Unsupported selector: ${source}`);
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
    // :disabled / :enabled (a form control's own disabled attribute, or a disabled fieldset around it: box.disabled).
    const enabledness = rest.match(/^:(disabled|enabled)(?![\w-])/i);
    if (enabledness) { parts.push({ kind: 'disabled', value: enabledness[1].toLowerCase() === 'disabled' }); specificity[1]++; rest = rest.slice(enabledness[0].length); continue; }
    // :any-link and :link: an a or area with href (measured in Chromium, Firefox and WebKit, an empty href too). Links are
    // taken as unvisited, so :link is :any-link; a :link rule that changes the layout is kept Unknown (parseLayoutCSS).
    // :placeholder-shown: a text field or textarea with a placeholder attribute (an empty one too) and no value, in the
    // initial state (typing hides it: a :placeholder-shown rule that changes the layout is kept Unknown, parseLayoutCSS).
    const shown = rest.match(/^:placeholder-shown(?![\w-])/i);
    if (shown) { parts.push({ kind: 'placeholder-shown' }); specificity[1]++; rest = rest.slice(shown[0].length); continue; }
    const link = rest.match(/^:(any-link|link)(?![\w-])/i);
    if (link) { parts.push({ kind: 'link', name: link[1].toLowerCase() }); specificity[1]++; rest = rest.slice(link[0].length); continue; }
    const root = rest.match(/^:root(?![\w-])/i);
    if (root) { parts.push({ kind: 'root' }); specificity[1]++; rest = rest.slice(root[0].length); continue; }
    // A trailing user-action state (paint-only rules; see parseLayoutCSS).
    // (:visited: never set by the analysis — links are taken as unvisited — so its rules only repaint a state not checked.)
    // (:target likewise: the analysis takes the URL to have no fragment.)
    const action = rest.match(/^:(hover|active|focus|focus-visible|focus-within|checked|visited|target)$/i);
    if (action) { state = action[1].toLowerCase(); specificity[1]++; rest = ''; continue; }
    // :checked::before / :checked::after: the generated check mark of a custom checkbox.
    const checkedMark = rest.match(/^:checked::?(before|after)$/i);
    if (checkedMark) { state = 'checked'; pseudoElement = checkedMark[1].toLowerCase(); specificity[1]++; specificity[2]++; rest = ''; continue; }
    const pseudo = rest.match(/^::?(before|after)$/i) ?? rest.match(/^::(placeholder|marker|first-letter|first-line|selection)$/i);
    if (pseudo) { pseudoElement = pseudo[1].toLowerCase(); specificity[2]++; rest = ''; continue; }
    // Attribute selectors: [a], [a=v], [a~=v], [a|=v], [a^=v], [a$=v], [a*=v], with the i/s flags.
    const attribute = rest.match(/^\[\s*([a-zA-Z_][\w:-]*)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]"']+))\s*([iIsS])?\s*)?\]/);
    if (attribute) {
      parts.push({ kind: 'attribute', name: attribute[1].toLowerCase(), ...(attribute[2] ? { operator: attribute[2], value: attribute[3] ?? attribute[4] ?? attribute[5], insensitive: /i/i.test(attribute[6] ?? '') } : {}) });
      specificity[1]++; rest = rest.slice(attribute[0].length); continue;
    }
    // Structural pseudo-classes over the element siblings (class specificity).
    const structural = rest.match(/^:(first-child|last-child|only-child|first-of-type|last-of-type|only-of-type|empty)(?![\w-(])/i);
    if (structural) { parts.push({ kind: 'structural', name: structural[1].toLowerCase() }); specificity[1]++; rest = rest.slice(structural[0].length); continue; }
    const nth = rest.match(/^:(nth-child|nth-last-child|nth-of-type|nth-last-of-type)\(\s*([^()]*?)\s*\)/i);
    if (nth) {
      const formula = parseNth(nth[2]);
      if (!formula) throw new Error(`Unsupported selector: ${source}`);
      parts.push({ kind: 'structural', name: nth[1].toLowerCase(), ...formula }); specificity[1]++; rest = rest.slice(nth[0].length); continue;
    }
    // :has(relative list): an argument is one compound with an optional leading combinator (descendant by default).
    const has = rest.match(/^:has\(/i);
    if (has) {
      let level = 1, end = has[0].length;
      while (end < rest.length && level) { if (rest[end] === '(') level++; if (rest[end] === ')') level--; end++; }
      if (level) throw new Error(`Unclosed selector function: ${source}`);
      const relative = postcss.list.comma(rest.slice(has[0].length, end - 1)).map(arg => {
        const m = arg.trim().match(/^([>+~])?\s*(.*)$/s);
        const compiled = compileSelector(m[2], depth + 1);
        if (compiled.state || compiled.pseudoElement || compiled.chain?.length || compiled.parts.some(p => p.kind === 'has')) throw new Error(`Unsupported selector (:has() takes one compound without states here): ${source}`);
        return { combinator: m[1] ?? ' ', selector: compiled };
      });
      parts.push({ kind: 'has', relative, choices: relative.map(r => r.selector) });
      specificity = combine(specificity, relative.reduce((best, r) => greaterRank(r.selector.specificity, best) ? r.selector.specificity : best, [0, 0, 0]));
      rest = rest.slice(end); continue;
    }
    // :not(list): matches when no argument does; its specificity is its most specific argument's. States and
    // pseudo-elements inside it are not modeled.
    const not = rest.match(/^:not\(/i);
    if (not) {
      let level = 1, end = not[0].length;
      while (end < rest.length && level) { if (rest[end] === '(') level++; if (rest[end] === ')') level--; end++; }
      if (level) throw new Error(`Unclosed selector function: ${source}`);
      const choices = postcss.list.comma(rest.slice(not[0].length, end - 1)).map(s => compileSelector(s, depth + 1, true));
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
      const choices = postcss.list.comma(rest.slice(fn[0].length, end - 1)).map(s => compileSelector(s, depth + 1, true)).filter(s => !s.pseudoElement);
      parts.push({ kind: 'any', choices });
      if (fn[1].toLowerCase() === 'is') specificity = combine(specificity, choices.reduce((best, s) => greaterRank(s.specificity, best) ? s.specificity : best, [0, 0, 0]));
      rest = rest.slice(end); continue;
    }
    throw new Error(`Unsupported selector: ${source}`);
  }
  return { source, parts, specificity, pseudoElement, ...(state ? { state } : {}) };
}
/** `state` is the set of user-action states that hold (e.g. focus): a state selector matches only then. */
/**
 * @scope: the number of generations from box up to the nearest ancestor matching the scope root, or null when none
 * does. Without the whole ancestor chain (a component root whose page is not known) the answer is not known.
 */
export function scopeProximity(selector, box, state) {
  // :scope / & alone: the root itself (matches() has checked box against the root's selector).
  if (selector.scopeMode === 'self') return 0;
  // :scope > x / & > x: the parent is a root, and x is not a limit.
  if (selector.scopeMode === 'child') {
    const p = box[PARENT];
    if (!p) { if (!box.documentRoot) throw Object.assign(new Error(`@scope (${selector.scope.source}): whether the parent of ${box.label ?? box.tag} is a scope root is not known`), { code: 'U_LAYOUT_SELECTOR' }); return null; }
    if (p.anonymous || !matches(selector.scope, p, new Set())) return null;
    return selector.scope.limit && matches(selector.scope.limit, box, new Set()) ? null : 1;
  }
  // The elements from box up to (not including) the candidate root: a limit among them puts box outside that root's
  // scope (and outside every root above it, which the limit is also below).
  const path = [box];
  let distance = 1, p = box[PARENT], last = box;
  const limited = () => selector.scope.limit && path.some(e => !e.anonymous && matches(selector.scope.limit, e, new Set()));
  for (; p; p = p[PARENT], distance++) { if (!p.anonymous && matches(selector.scope, p, new Set())) { if (!limited()) return distance; } path.push(p); last = p; }
  if (!last.documentRoot) throw Object.assign(new Error(`@scope (${selector.scope.source}): whether ${box.label ?? box.tag} is inside a scope root depends on ancestors that are not known`), { code: 'U_LAYOUT_SELECTOR' });
  return null;
}
export function matches(selector, box, state) {
  if (typeof selector === 'string') selector = compileSelector(selector);
  if (box.anonymous) return false; // anonymous boxes are not elements
  if (selector.scope && (!compoundMatches(selector, box) || scopeProximity(selector, box, state) === null)) return false;
  // ::before/::after rules apply only to that pseudo-element (state '::before'), and other rules not to it.
  const pseudo = [...(state ?? [])].find(s => s === '::before' || s === '::after' || s === '::placeholder' || s === '::marker' || s === '::first-letter' || s === '::first-line');
  if (selector.pseudoElement ? `::${selector.pseudoElement}` !== pseudo : pseudo) return false;
  if (selector.state && !state?.has(selector.state)) return false;
  return compoundMatches(selector, box) && (!selector.chain || related(selector.chain, 0, box));
}
// Tags left out of the sibling lists while `ignoringSiblings` runs (F33: would the selector match without them?).
let skippedTags = null;
/** Runs fn with siblings of these tags left out of :nth-child / :first-child / :last-child / + / ~ (a what-if). */
export function ignoringSiblings(tags, fn) { const before = skippedTags; skippedTags = tags; try { return fn(); } finally { skippedTags = before; } }
const kept = child => !child.anonymous && !child.pseudo && !skippedTags?.has(child.tag);
const elementSiblings = box => (box[PARENT]?.children ?? []).filter(kept);
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
const placeholderFieldTypes = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);
export const placeholderField = box => box.tag === 'textarea' || (box.tag === 'input' && placeholderFieldTypes.has(box.inputType));
// The initial value is empty: an input with no value (or value=""), a textarea with no text (its one leading newline is
// dropped by the parser; any other whitespace is a value, and is told apart by the engine).
export const placeholderShown = box => placeholderField(box) && box.placeholderAttr === true && (box.tag === 'input' ? (box.value === undefined || box.value === '') : !box.text && !box.whitespace && !box.textContent && !(box.inline ?? []).length);
export const isLink = box => (box.tag === 'a' && box.href !== undefined) || (box.tag === 'area' && (box.href !== undefined || box.attributes?.href !== undefined));
/** The compound (tag, classes, id, :root, :is/:where) alone, ignoring states, pseudo-elements and combinators. */
export function compoundMatches(selector, box) {
  if (box.anonymous) return false;
  return selector.parts.every(part => part.kind === 'tag' ? part.value === '*' || box.tag === part.value :
    part.kind === 'class' ? box.classes.includes(part.value) : part.kind === 'id' ? box.id === part.value :
    part.kind === 'root' ? box.documentRoot === true : part.kind === 'link' ? isLink(box) : part.kind === 'placeholder-shown' ? placeholderShown(box) : part.kind === 'disabled' ? ['button', 'input', 'select', 'textarea', 'fieldset', 'option', 'optgroup'].includes(box.tag) && (box.disabled === true) === part.value : part.kind === 'path' ? box.path === part.value :
    part.kind === 'attribute' ? attributeMatches(part, box) : part.kind === 'structural' ? structuralMatches(part, box) : part.kind === 'has' ? hasMatches(part, box) : part.kind === 'not' ? !part.choices.some(choice => matches(choice, box)) :
    part.choices.some(choice => matches(choice, box)));
}
// An+B: odd, even, An+B, B (no "of S").
function parseNth(text) {
  const t = text.replace(/\s+/g, '').toLowerCase();
  if (t === 'odd') return { a: 2, b: 1 };
  if (t === 'even') return { a: 2, b: 0 };
  let m = t.match(/^([+-]?\d*)n([+-]\d+)?$/);
  if (m) return { a: m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number(m[1]), b: Number(m[2] ?? 0) };
  m = t.match(/^[+-]?\d+$/);
  return m ? { a: 0, b: Number(t) } : null;
}
const nthHolds = ({ a, b }, index) => a === 0 ? index === b : (index - b) / a >= 0 && Number.isInteger((index - b) / a);
/** The element siblings of a box (with it), or null when its parent is not in the tree (a component root). */
function siblingsOf(box) {
  const parent = box[PARENT];
  if (!parent) return box.documentRoot ? [box] : null;
  const list = (parent.children ?? []).some(c => c === box || c.path === box.path) ? parent.children : (parent.inline ?? []);
  return list.filter(kept);
}
function structuralMatches(part, box) {
  if (part.name === 'empty') return !box.text && !box.whitespace && !(box.children ?? []).some(c => !c.pseudo) && !(box.inline ?? []).length;
  const all = siblingsOf(box);
  if (!all) return false; // reported by unknownMatches
  const list = /of-type/.test(part.name) ? all.filter(s => s.tag === box.tag) : all;
  const at = list.findIndex(s => s === box || s.path === box.path), from = at + 1, fromEnd = list.length - at;
  switch (part.name) {
    case 'first-child': case 'first-of-type': return from === 1;
    case 'last-child': case 'last-of-type': return fromEnd === 1;
    case 'only-child': case 'only-of-type': return list.length === 1;
    case 'nth-child': case 'nth-of-type': return nthHolds(part, from);
    default: return nthHolds(part, fromEnd);
  }
}
const elementChildren = box => [...(box.children ?? []), ...(box.inline ?? [])].filter(child => !child.anonymous && !child.pseudo);
const descendants = box => elementChildren(box).flatMap(child => [child, ...descendants(child)]);
function hasMatches(part, box) {
  return part.relative.some(({ combinator, selector }) => {
    if (combinator === ' ') return descendants(box).some(d => matches(selector, d));
    if (combinator === '>') return elementChildren(box).some(d => matches(selector, d));
    const all = siblingsOf(box);
    if (!all) return false; // reported by dynamicAttributeTests
    const later = all.slice(all.findIndex(s => s === box || s.path === box.path) + 1);
    return (combinator === '+' ? later.slice(0, 1) : later).some(d => matches(selector, d));
  });
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
  const root = !box[PARENT] && !box.documentRoot;
  const attributeTest = part => part.kind === 'attribute' && part.operator && Object.hasOwn(box.attributes ?? {}, part.name) && [undefined, DYNAMIC_VALUE].includes(box.attributes[part.name]);
  // A component root's position among its siblings: tested only where the root is the subject of a selector without
  // combinators (with a combinator, the root matches only through elements outside the tree anyway).
  const structuralTest = (part, subjectOnly) => ((part.kind === 'structural' && part.name !== 'empty') || (part.kind === 'has' && part.relative.some(r => ['+', '~'].includes(r.combinator)))) && root && subjectOnly;
  const out = [];
  const visit = (sel, subjectOnly) => {
    const compounds = [sel, ...(sel.chain ?? []).map(link => link.compound)];
    compounds.forEach((compound, k) => {
      const alone = subjectOnly && k === 0 && !sel.chain?.length;
      for (const part of compound.parts) if (part.choices) part.choices.forEach(choice => visit(choice, alone));
      const unknown = part => attributeTest(part) || structuralTest(part, alone);
      const tests = compound.parts.filter(unknown);
      if (tests.length && compound.parts.filter(part => !unknown(part) && !part.choices && !['structural', 'has'].includes(part.kind)).every(part => compoundMatches({ parts: [part] }, box))) out.push(...tests);
    });
  };
  visit(selector, true);
  return out;
}
