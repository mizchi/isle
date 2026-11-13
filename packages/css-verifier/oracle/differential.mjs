// Development-only differential check: the CSS verifier's cascade/computed
// subset versus mizchi/css (an independent MoonBit CSS engine). A difference is
// a lead for either implementation, never a proof that one side is correct.
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseLayoutCSS, computeStyle} from '../src/layout/css.mjs';
import {matches, greaterRank} from '../src/layout/selectors.mjs';
import {tracks} from '../src/layout/grid.mjs';
import {normalizeTree} from '../src/tree.mjs';
import {cmp, q} from '../src/layout/linear.mjs';

export const oraclePath = fileURLToPath(new URL('./_build/js/release/build/computed_oracle/computed_oracle.js', import.meta.url));

export async function loadOracle() {
  if (!existsSync(oraclePath)) throw new Error(`mizchi/css oracle is not built: run "just css-oracle-build" (${oraclePath})`);
  const {compute_tree} = await import(oraclePath);
  return (input, name) => JSON.parse(compute_tree(JSON.stringify(input), name));
}

/** Properties both engines model, in the verifier's logical names. */
export const comparedProperties = [
  'display', 'position', 'box-sizing', 'overflow-x', 'overflow-y',
  'inline-size', 'min-inline-size', 'max-inline-size', 'block-size', 'min-block-size', 'max-block-size',
  ...['left', 'right', 'top', 'bottom'].flatMap(side => [`padding-${side}`, `border-${side}`, `margin-${side}`]),
  'column-gap', 'row-gap', 'grid-template-columns', 'grid-template-rows',
];

const length = value => {
  if (value === '0' || value === '0px') return '0px';
  const m = /^(-?\d+(?:\.\d+)?)(px|%)$/.exec(value);
  return m ? `${Number(m[1])}${m[2]}` : value;
};
const trackText = value => {
  if (value === 'none') return [];
  return tracks(value).map(track => track.weight ? `fr:0px:${Number(track.weight.n) / Number(track.weight.d)}` : `fixed:${Number(track.fixed.n) / Number(track.fixed.d)}`);
};

export function normalizeVerifier(property, value) {
  if (typeof value !== 'string') return {unsupported: `non-string ${typeof value}`};
  if (value === 'ua') return {unsupported: 'user-agent value'};
  if (property.startsWith('grid-template-')) {
    try { return {value: trackText(value)}; } catch (error) { return {unsupported: error.message}; }
  }
  if (property === 'row-gap' && value === 'normal') return {value: '0px'};
  if (['display', 'position', 'box-sizing', 'overflow-x', 'overflow-y', 'column-gap'].includes(property)) return {value};
  return {value: length(value)};
}

const kebab = text => text.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
export function normalizeOracle(property, value) {
  if (Array.isArray(value)) return value.map(String);
  if (['display', 'position', 'box-sizing', 'overflow-x', 'overflow-y'].includes(property)) return kebab(value);
  if (property.startsWith('max-') && value === 'auto') return 'none';
  return length(value);
}

function activeAt(width, height) {
  const ok = (size, relation, value) => {
    const c = cmp(q(size), value);
    return relation === '>=' ? c >= 0 : relation === '>' ? c > 0 : relation === '<=' ? c <= 0 : relation === '<' ? c < 0 : c === 0;
  };
  return rule => rule.contexts.every(condition => condition.kind === 'media' &&
    condition.groups.some(group => group.every(atom => ok(atom.feature === 'width' ? width : height, atom.relation, atom.value))));
}

/**
 * Compare both engines for one concrete viewport. Returns per-property rows.
 * `status`: same | different | verifier-unsupported (CSS rejected, computeStyle
 * threw, or the value is outside the shared vocabulary).
 */
export function compareCase(oracle, {css, tree, width, height = 768, name = 'Doc'}, {mutate} = {}) {
  const diagnostics = [];
  let {rules} = parseLayoutCSS([{css, file: '<css>'}], (code, message, line) => diagnostics.push({code, message, line}));
  // Mutation testing only: a deliberately broken cascade must be reported.
  if (mutate) rules = mutate(structuredClone(rules));
  const oracleRows = new Map(oracle({css, tree, width, height}, name).map(row => [row.path, row]));
  if (diagnostics.length) return {status: 'verifier-unsupported', reason: diagnostics.map(d => `${d.code}: ${d.message}`).join('; '), rows: []};
  const {root} = normalizeTree(tree, name);
  const active = mutate?.active ?? activeAt(width, height), rows = [];
  let failure;
  const visit = (box, inherited, parent) => {
    let style;
    try { style = computeStyle(rules, box, active, inherited); }
    catch (error) { failure = `${box.path}: ${error.message}`; return; }
    const theirs = oracleRows.get(box.path);
    for (const property of comparedProperties) {
      const ours = normalizeVerifier(property, style[property]);
      if (ours.unsupported) { rows.push({path: box.path, property, status: 'verifier-unsupported', reason: ours.unsupported}); continue; }
      const other = normalizeOracle(property, theirs?.[property]);
      const same = JSON.stringify(ours.value) === JSON.stringify(other);
      const row = {path: box.path, property, status: same ? 'same' : 'different', verifier: ours.value, oracle: other, ...(style.$sources[property] ? {source: style.$sources[property]} : {})};
      if (!same) {
        const known = classifyOracleDivergence(row, {style, theirs, rules, box, active, parent});
        if (known) Object.assign(row, {status: 'known-oracle-divergence', divergence: known});
      }
      rows.push(row);
    }
    for (const child of box.children) visit(child, style, {style, theirs});
  };
  visit(root, undefined, undefined);
  if (failure) return {status: 'verifier-unsupported', reason: failure, rows};
  return {status: rows.some(row => row.status === 'different') ? 'different' : rows.some(row => row.status === 'known-oracle-divergence') ? 'known-oracle-divergence' : 'same', rows};
}

// ---- Known mizchi/css 0.8.0 divergences ----------------------------------
// Each rule matches one reproducible upstream behavior and is deliberately
// narrow: anything it does not explain stays a `different` row and fails the
// eval. Verifier-side CSS semantics are cited from the CSS specifications.

const wideKeywords = new Set(['initial', 'unset', 'revert']);
/** The value mizchi/css 0.8.0 produces for initial/unset on these properties. */
const oracleInitial = property => property === 'display' ? 'block' : property === 'box-sizing' ? 'content-box' : 'auto';
const scrollable = value => !['visible', 'clip'].includes(value);

/** Declarations of `property` that apply to `box`, with verifier cascade rank. */
function applicable(rules, box, active, property) {
  const out = [];
  let order = 0;
  for (const rule of rules) {
    if (!active(rule)) continue;
    for (const selector of rule.selectors) {
      if (!matches(selector, box)) continue;
      for (const declaration of rule.declarations) {
        order++;
        if (declaration.property !== property) continue;
        const layer = rule.layer === null ? (declaration.important ? -Infinity : Infinity) : declaration.important ? -rule.layer : rule.layer;
        out.push({declaration, order, rank: [declaration.important, layer, ...selector.specificity]});
      }
    }
  }
  return out;
}

export const divergenceKinds = {
  'overflow-not-coerced': 'CSS Overflow 3: visible/clip compute to auto/hidden when the other axis scrolls; mizchi/css keeps visible/clip.',
  'source-order-over-precedence': 'Shorthands and longhands are cascaded under different keys and then applied in source order, so a later lower-precedence (specificity/!important) shorthand or longhand overwrites the winner.',
  'wide-keyword-initial': 'mizchi/css initial values for padding/gap/display differ from CSS (0, normal, inline).',
  'explicit-normal-gap': 'An explicit column-gap: normal computes to auto in mizchi/css.',
  'inherit-non-inherited': 'Explicit inherit on a non-inherited property (padding, min-width, display, gaps) does not take the parent value in mizchi/css.',
  'var-fallback': 'The verifier proved the reference guaranteed-invalid and used the fallback; mizchi/css drops the fallback in shorthands or re-resolves inherited custom properties against the child.',
  'inherited-var-rebinding': 'A custom property defined as var(--other) on an ancestor is inherited as its computed value (CSS Variables 1 section 3); mizchi/css re-resolves var(--other) against the child.',
};

export function classifyOracleDivergence(row, {style, theirs, rules, box, active, parent}) {
  const {property, verifier, oracle} = row;
  if (property.startsWith('overflow-')) {
    const otherAxis = property === 'overflow-x' ? 'overflow-y' : 'overflow-x';
    const coerced = {visible: 'auto', clip: 'hidden'}[oracle];
    if (coerced === verifier && scrollable(style[otherAxis]) && theirs?.[otherAxis] && scrollable(normalizeOracle(otherAxis, theirs[otherAxis]))) return 'overflow-not-coerced';
  }
  const specified = row.source?.specified?.trim().toLowerCase();
  if (specified && wideKeywords.has(specified) && ((oracle === 'auto' && /^(?:padding-|column-gap|row-gap)/.test(property)) || (property === 'display' && verifier === 'inline' && oracle === 'block'))) return 'wide-keyword-initial';
  if (specified === 'normal' && property === 'column-gap' && verifier === 'normal' && oracle === 'auto') return 'explicit-normal-gap';
  // mizchi/css falls back to its own initial value instead of the parent's.
  if (specified === 'inherit' && parent && JSON.stringify(normalizeVerifier(property, parent.style[property]).value) === JSON.stringify(verifier) &&
    oracle === oracleInitial(property)) return 'inherit-non-inherited';
  if (specified === 'inherit' && !parent && oracle === oracleInitial(property)) return 'wide-keyword-initial';
  const fallback = specified && /^var\(\s*--[\w-]+\s*,\s*([^()]+)\)$/.exec(specified);
  if (fallback && JSON.stringify(normalizeVerifier(property, fallback[1].trim()).value) === JSON.stringify(verifier)) return 'var-fallback';
  if (specified && /var\(/.test(specified) && property.endsWith('-gap') && oracle === 'auto') return 'var-fallback';
  const aliases = new Set(rules.flatMap(rule => rule.declarations.filter(d => d.expression?.references.length).map(d => d.property)));
  if (specified && [...specified.matchAll(/var\(\s*(--[\w-]+)/g)].some(m => aliases.has(m[1]))) return 'inherited-var-rebinding';
  const all = applicable(rules, box, active, property);
  const winner = all.reduce((best, entry) => !best || greaterRank(entry.rank, best.rank) ? entry : best, undefined);
  if (winner && all.some(entry => entry !== winner && entry.order > winner.order &&
    !greaterRank(entry.rank, winner.rank) && (entry.declaration.pending || ['inherit', ...wideKeywords].includes(entry.declaration.value) || (entry.declaration.value === 'normal' && oracle === 'auto') ||
      JSON.stringify(normalizeVerifier(property, entry.declaration.value).value) === JSON.stringify(oracle)))) return 'source-order-over-precedence';
  return undefined;
}

// ---- Deterministic corpus -------------------------------------------------

export function random(seed) {
  let state = seed >>> 0 || 1;
  const next = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 2 ** 32; };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = values => values[int(0, values.length - 1)];
  return {next, int, pick, chance: p => next() < p};
}

const selectors = ['div', 'section', '.a', '.b', '.a.b', '#x', 'div.a', 'section.b', ':where(.a)', ':is(.a, #x)', ':where(#x)', ':is(div, section)', '*', 'main', ':root', 'html'];
function declaration(r) {
  const px = () => `${r.pick([0, 1, 2, 4, 8, 12.5, 16, 40])}px`;
  const wideKeyword = () => r.pick(['inherit', 'initial', 'unset']);
  const choices = [
    () => `padding: ${Array.from({length: r.int(1, 4)}, px).join(' ')}`,
    () => `padding-${r.pick(['left', 'right', 'top', 'bottom', 'inline-start', 'block-end'])}: ${px()}`,
    () => `padding-${r.pick(['inline', 'block'])}: ${Array.from({length: r.int(1, 2)}, px).join(' ')}`,
    () => `border: ${r.chance(0.2) ? '0' : `${px()} solid red`}`,
    () => `min-width: ${px()}`,
    () => `width: ${r.chance(0.3) ? `${r.pick([25, 50, 100])}%` : px()}`,
    () => `height: ${px()}`,
    () => `max-width: ${r.chance(0.5) ? 'none' : px()}`,
    () => `gap: ${Array.from({length: r.int(1, 2)}, px).join(' ')}`,
    () => `column-gap: ${r.chance(0.2) ? 'normal' : px()}`,
    () => `row-gap: ${px()}`,
    () => `display: ${r.pick(['block', 'grid', 'none', 'block', 'grid'])}`,
    () => `box-sizing: ${r.pick(['border-box', 'content-box'])}`,
    () => `grid-template-columns: ${r.pick(['repeat(2, minmax(0, 1fr))', 'repeat(3, minmax(0,1fr))', '40px 1px', 'minmax(0, 2fr) 10px', 'none'])}`,
    () => 'margin: 0',
    () => `overflow: ${r.pick(['visible', 'hidden', 'auto', 'clip', 'visible auto', 'hidden visible'])}`,
    () => `position: ${r.pick(['static', 'relative'])}`,
    () => `--g: ${px()}`,
    () => `gap: var(--g${r.chance(0.5) ? `, ${px()}` : ''})`,
    () => `padding-left: var(--${r.pick(['g', 'h', 'missing'])}, ${px()})`,
    () => `--h: var(--g)`,
    () => `${r.pick(['padding-left', 'min-width', 'display', 'box-sizing', 'column-gap'])}: ${wideKeyword()}`,
  ];
  return r.pick(choices)() + (r.chance(0.1) ? ' !important' : '');
}

export function generateCase(seed) {
  const r = random(seed);
  const node = depth => {
    const classes = ['a', 'b', 'c'].filter(() => r.chance(0.4));
    return {tag: r.pick(['div', 'section', 'div']), ...(r.chance(0.15) ? {id: 'x'} : {}), classes,
      children: depth < 2 ? Array.from({length: r.int(0, 2)}, () => node(depth + 1)) : []};
  };
  const tree = {tag: 'html', children: [{tag: 'main', classes: r.chance(0.5) ? ['a'] : [], children: Array.from({length: r.int(1, 3)}, () => node(1))}]};
  const rules = Array.from({length: r.int(2, 7)}, () => {
    const selector = r.chance(0.2) ? `${r.pick(selectors)}, ${r.pick(selectors)}` : r.pick(selectors);
    // The verifier rejects overlapping shorthand/longhand writes in one rule
    // (E_CSS_SHORTHAND_CONFLICT); keep one declaration per family per rule.
    const family = text => /^padding/.test(text) ? 'padding' : /^(?:gap|column-gap|row-gap)\b/.test(text) ? 'gap' : text.split(':')[0];
    const seen = new Set(), list = [];
    for (const text of Array.from({length: r.int(1, 3)}, () => declaration(r))) if (!seen.has(family(text))) { seen.add(family(text)); list.push(text); }
    const body = `${selector} { ${list.join('; ')} }`;
    if (!r.chance(0.3)) return body;
    const n = r.pick([320, 480, 600, 800]);
    return `@media ${r.pick([`(min-width: ${n}px)`, `(max-width: ${n}px)`, `(width >= ${n}px)`, `(width < ${n}px)`, `screen and (min-width: ${n}px)`])} { ${body} }`;
  });
  return {seed, css: rules.join('\n'), tree, width: r.pick([320, 480, 479, 600, 601, 800, 1024])};
}
