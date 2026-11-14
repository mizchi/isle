import postcss from 'postcss';

// Contracts remain simple; stylesheet selectors additionally support reset idioms.
export {simpleSelector} from './simple-selector.mjs';
export const greaterRank = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return true; };
const combine = (a, b) => a.map((value, i) => value + b[i]);
export function compileSelector(source, depth = 0) {
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
    const action = rest.match(/^:(hover|active|focus|focus-visible|focus-within)$/i);
    if (action) { state = action[1].toLowerCase(); specificity[1]++; rest = ''; continue; }
    const pseudo = rest.match(/^::?(before|after)$/i);
    if (pseudo) { pseudoElement = pseudo[1].toLowerCase(); specificity[2]++; rest = ''; continue; }
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
  // ::before/::after rules apply only to that pseudo-element (state '::before'), and other rules not to it.
  const pseudo = [...(state ?? [])].find(s => s === '::before' || s === '::after');
  if (selector.pseudoElement ? `::${selector.pseudoElement}` !== pseudo : pseudo) return false;
  if (selector.state && !state?.has(selector.state)) return false;
  return selector.parts.every(part => part.kind === 'tag' ? part.value === '*' || box.tag === part.value :
    part.kind === 'class' ? box.classes.includes(part.value) : part.kind === 'id' ? box.id === part.value :
    part.kind === 'root' ? box.documentRoot === true : part.kind === 'path' ? box.path === part.value : part.choices.some(choice => matches(choice, box)));
}
