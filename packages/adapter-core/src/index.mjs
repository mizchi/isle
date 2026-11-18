// The shared part of the component adapters (Svelte, Vue, React with StyleX or Linaria). An adapter turns one
// component into its template states — { html, choices } with the conditions each takes — plus its CSS; this module
// analyses every state with the generic core and reports what holds per state. The core knows nothing of components.
import { analyzeHTML, phrasingTags } from '@mizchi/css-verifier/html';
import { parseFragment, serialize } from 'parse5';
import { noShift } from './noshift.mjs';

/** Choices of two variants merge unless they take one condition both ways (that combination cannot happen). */
export const merge = (a, b) => { const out = { ...a }; for (const [k, v] of Object.entries(b)) { if (k in out && out[k] !== v) return null; out[k] = v; } return out; };
export const choose = (key, value) => ({ [key]: value });

/**
 * Every combination of the variant lists (concatenating their html), dropping contradictory ones; more than
 * `maxStates` combinations call `onLimit` and keep the first ones (the adapter reports that as Unknown).
 */
export function product(lists, { maxStates = 64, onLimit = () => {} } = {}) {
  let acc = [{ html: '', choices: {} }];
  for (const list of lists) {
    const next = [];
    for (const left of acc) for (const right of list) { const choices = merge(left.choices, right.choices); if (choices) next.push({ html: left.html + right.html, choices }); }
    acc = next;
    if (acc.length > maxStates) { onLimit(maxStates); return acc.slice(0, maxStates); }
  }
  return acc;
}

/** The condition key of an expression's source text: a leading ! is a negation of the same condition. */
// The selectors of a stylesheet (rule preludes, also inside @media/@supports/@layer), comments and strings skipped.
export function selectorsOf(css) {
  const out = [], text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let start = 0, depth = 0, quote = null, inDecl = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') { const prelude = text.slice(start, i).trim(); inDecl[depth] = !prelude.startsWith('@'); if (prelude && !prelude.startsWith('@')) out.push(prelude.split(';').pop().trim()); depth++; start = i + 1; }
    else if (c === '}') { depth = Math.max(0, depth - 1); start = i + 1; }
    else if (c === ';') start = i + 1;
  }
  return out.filter(Boolean);
}
// Scope escapes in a component stylesheet: the pseudo-classes (global, deep, slotted) that reach past its own elements.
export const scopeEscapes = (css, kinds) => selectorsOf(css).flatMap(selector => {
  const found = kinds.filter(kind => new RegExp(`:${kind}(?:\\(|\\s|$)`).test(selector));
  return found.length ? [{ selector, kind: found.map(k => `:${k}`).join(', ') }] : [];
});
// A boundary marker in a state's markup: content another component (or the caller) renders here.
export const boundary = (kind, name, contract) => `<!--isle-boundary:${kind}${name ? ` ${String(name).replace(/[^\w.$-]/g, '')}` : ''}${contract ? ` contract=${contract}` : ''}-->`;

// Props typed as a union of string or number literals ('Active' | 'Pending review'; Babel and ESTree literal nodes):
// name → values, from a props type's members (a type literal, or a local alias / interface). Optional props are left
// out (an absent prop renders nothing). `declared(name)` says whether the component reads the prop by that name.
const literalValue = t => t?.type === 'TSLiteralType' && (['StringLiteral', 'NumericLiteral'].includes(t.literal.type) || (t.literal.type === 'Literal' && ['string', 'number'].includes(typeof t.literal.value))) ? [t.literal.value] : null;
export function literalUnionProps(members, declared = () => true) {
  const out = new Map();
  for (const m of members ?? []) {
    if (m.type !== 'TSPropertySignature' || m.key?.type !== 'Identifier' || m.optional || !declared(m.key.name)) continue;
    const type = m.typeAnnotation?.typeAnnotation;
    const values = literalValue(type) ?? (type?.type === 'TSUnionType' && type.types.every(literalValue) ? type.types.flatMap(literalValue) : null);
    if (values) out.set(m.key.name, values);
  }
  return out;
}
// Type members of a props annotation: an inline type literal or a reference to an alias / interface in `body`.
export function propsMembers(annotation, body) {
  if (annotation?.type === 'TSTypeLiteral') return annotation.members;
  if (annotation?.type !== 'TSTypeReference' || annotation.typeName.type !== 'Identifier') return null;
  for (const stmt of body ?? []) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (decl?.type === 'TSTypeAliasDeclaration' && decl.id.name === annotation.typeName.name && decl.typeAnnotation.type === 'TSTypeLiteral') return decl.typeAnnotation.members;
    if (decl?.type === 'TSInterfaceDeclaration' && decl.id.name === annotation.typeName.name) return decl.body.body;
  }
  return null;
}
// A state's comparisons of literal props (status === 'Active', props.status !== 'x') agree with their chosen values.
export const literalChoicesAgree = (choices, literalProps) => Object.entries(choices).every(([key, held]) => {
  const m = /^(?:props\.)?(\w+)\s*(===?|!==?)\s*(['"])(.*)\3$/.exec(key);
  if (!m || !literalProps.has(m[1]) || !(m[1] in choices)) return true;
  return ((String(choices[m[1]]) === m[4]) === m[2].startsWith('=')) === held;
});

export function conditionKey(text) {
  let key = String(text).trim(), negate = false;
  while (key.startsWith('!') && !key.startsWith('!=')) { negate = !negate; key = key.slice(1).trim(); }
  while (/^\(.*\)$/.test(key)) key = key.slice(1, -1).trim();
  return { key, negate };
}

const page = html => `<html lang="en"><body>${html}</body></html>`;

// Text without a size contract makes the layout Unknown. assumeText gives every element with direct text a contract
// of one line (lineHeight px, default 24) and no minimum width — an assumption the lint output states: text overflow
// is then not checked, and heights hold only for one-line text. Elements are marked with a class no CSS matches.
// Text beside child elements (a button, a div, an icon span): in a flex or grid container each run of it is
// an anonymous item, which lays out like an unstyled span there (blockified, the parent's inherited text styles,
// flex: 0 1 auto, min-width: auto). Each run is wrapped in a marked span so it is measured as a text box; elsewhere
// (block flow) the result is Unknown either way. Skipped when a selector could match the added span (*, span, a
// structural pseudo-class, a sibling combinator): then the wrapper would change what the CSS selects.
const wrapsSafely = css => !selectorsOf(css).some(sel => /(?:^|[\s,>(])\*|(?:^|[\s,>(])span\b|:(?:first|last|nth|only)-|:empty|:has\(|[+~]/.test(sel));
function wrapTextRuns(html) {
  const fragment = parseFragment(html);
  let n = 0;
  const walk = node => {
    const kids = node.childNodes ?? [];
    const texts = kids.filter(c => c.nodeName === '#text' && c.value.trim()), elements = kids.filter(c => c.tagName);
    // Also beside a phrasing child without text (an icon span: in a flex or grid container it is an item, and the text
    // beside it an anonymous one). Runs whose phrasing children all have text (Posted <strong>today</strong>) stay one
    // text leaf, as before.
    const textOf = c => (c.childNodes ?? []).some(k => (k.nodeName === '#text' && k.value.trim()) || (k.tagName && textOf(k)));
    if (node.tagName && texts.length && elements.some(c => !phrasingTags.has(c.tagName) || !textOf(c))) {
      node.childNodes = kids.map(c => {
        if (!(c.nodeName === '#text' && c.value.trim())) return c;
        const span = parseFragment(`<span class="__anon${n++}"></span>`).childNodes[0];
        span.childNodes = [{ ...c, value: c.value.trim(), parentNode: span }]; span.parentNode = node;
        return span;
      }).filter(c => !(c.nodeName === '#text' && !c.value.trim()));
    }
    for (const child of node.childNodes ?? []) if (child.tagName !== 'svg') walk(child);
  };
  for (const child of fragment.childNodes) walk(child);
  return { html: serialize(fragment), count: n };
}

function markText(html, start = 0) {
  const fragment = parseFragment(html);
  let n = start;
  // Phrasing elements (a, span, strong, …) inside an element with text of its own are its inline content (the box tree
  // folds them into it): only that element is a text box.
  const phrasing = node => phrasingTags.has(node.tagName) && (node.childNodes ?? []).filter(c => c.tagName).every(phrasing);
  const walk = node => {
    // An inline svg is one replaced box: its <title>/<text> are not CSS text boxes.
    if (node.tagName === 'svg') return;
    const ownText = (node.childNodes ?? []).some(c => c.nodeName === '#text' && c.value.trim());
    const folds = node.tagName && ownText && (node.childNodes ?? []).filter(c => c.tagName).every(phrasing);
    if (!folds) for (const child of node.childNodes ?? []) walk(child);
    // An element without text of its own whose children are two or more phrasing elements with text is, in block
    // flow, one text leaf of them (the engine folds it): it gets the text box too (harmless where it is not folded).
    const elements = (node.childNodes ?? []).filter(c => c.tagName), hasText = c => (c.childNodes ?? []).some(k => (k.nodeName === '#text' && k.value.trim()) || (k.tagName && hasText(k)));
    const inlineRun = node.tagName && !ownText && elements.length >= 2 && elements.every(c => phrasing(c) && c.tagName !== 'img') && elements.some(hasText);
    if (node.tagName && (ownText || inlineRun)) {
      const id = `__text${n++}`, cls = node.attrs.find(a => a.name === 'class');
      if (cls) cls.value = `${cls.value} ${id}`.trim(); else node.attrs.push({ name: 'class', value: id });
    }
    // A text field with a placeholder: marked so its measured placeholder width can be given to it.
    if (node.tagName === 'input' && node.attrs.some(a => a.name === 'placeholder' && a.value.trim() && !a.value.includes('…') && a.value !== 'dynamic')) {
      const id = `__ph${placeholders++}`, cls = node.attrs.find(a => a.name === 'class');
      if (cls) cls.value = `${cls.value} ${id}`.trim(); else node.attrs.push({ name: 'class', value: id });
    }
  };
  let placeholders = 0;
  walk(fragment);
  return { html: serialize(fragment), count: n - start };
}

/**
 * Analyse the states of one component.
 * @param {{states: {html: string, choices: object}[], css: string, unknowns?: {code, message}[], assumptions?: string[]}} component
 * @param {object} options css-verifier options plus pageCSS (CSS of the page around the component) and page(html).
 */
const printableASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
// A text leaf's computed font (reportTextFonts) as a text contract measured with the given font files, or null when
// the font is not one of them or is not measurable (a non-px size, line-height: normal, letter-spacing).
function measuredContract(facts, textMetrics, fonts, defaultFontSize) {
  // Dynamic text ({expression}, {{ … }}) is rendered as the placeholder '…': its real string is not known, so it is
  // never measured (a literal '…' in the template stays assumed too).
  // A maximum length (data-text-max-length, with data-text-chars or printable ASCII) measures every string of that
  // many characters instead: dynamic text can be checked that way.
  const domain = facts && !facts.varied && /^\d+$/.test(String(facts.maxLength ?? '')) ? { characters: facts.characters ?? printableASCII, maxLength: Number(facts.maxLength) } : null;
  if (!facts || facts.varied || (!domain && (!facts.text || facts.text.includes('…')))) return null;
  const family = Object.keys(fonts).find(name => name.toLowerCase() === String(facts.family).replace(/["']/g, '').split(',')[0].trim().toLowerCase());
  const px = v => /^\d+(?:\.\d+)?px$/.test(String(v)) ? Number(String(v).slice(0, -2)) : undefined;
  // font-size: medium (the user's default, from html or font: inherit) is the default font size the analysis assumes.
  const size = px(facts.size) ?? (facts.size === 'medium' && defaultFontSize ? defaultFontSize : undefined);
  const lineHeight = px(facts.lineHeight) ?? (/^\d+(?:\.\d+)?$/.test(String(facts.lineHeight)) && size ? Number(facts.lineHeight) * size : undefined);
  const weight = facts.weight === 'normal' ? 400 : facts.weight === 'bold' ? 700 : /^\d+$/.test(String(facts.weight)) ? Number(facts.weight) : undefined;
  if (!family || !size || !lineHeight || !weight || facts.style !== 'normal' || facts.letterSpacing !== 'normal') return null;
  // data-text-one-line: expected to fit on one line whatever white-space allows. A length domain has no fixed line
  // breaks, so it needs one line (nowrap CSS or the attribute).
  const nowrap = ['nowrap', 'pre'].includes(facts.whiteSpace);
  const wrap = nowrap ? 'nowrap' : facts.oneLine ? 'one-line' : domain ? null : ['normal', 'pre-line', 'pre-wrap'].includes(facts.whiteSpace) ? (facts.overflowWrap === 'anywhere' ? 'anywhere' : 'normal') : null;
  if (!wrap) return null;
  const contract = { text: { font: { family, size, lineHeight, weight }, ...(domain ?? { content: facts.text }), ...(facts.lang ? { lang: facts.lang } : {}), ...(wrap === 'normal' && facts.overflowWrap !== 'normal' ? { overflowWrap: facts.overflowWrap } : {}) }, wrap };
  // A text the font file cannot measure (a character it lacks, a feature not modeled): not a size, but a reason the
  // caller reports as Unknown (its text is then only assumed to fit).
  try { return textMetrics.resolveBoxes({ x: contract }).x; } catch (error) { return { unmeasurable: error.message }; }
}

// Overflow-like findings that text resizing can cause (SC 1.4.4 compares them at 1× and 2× the default font size).
const resizeCodes = new Set(['E_LAYOUT_CONTENT', 'E_LAYOUT_ITEM_SIZE', 'E_LAYOUT_TRACKS', 'E_LAYOUT_PAGE_OVERFLOW', 'E_LAYOUT_PROTRUSION', 'E_A11Y_TEXT_OBSCURED', 'E_A11Y_TEXT_START_OBSCURED', 'W_LAYOUT_CLIPPED', 'W_LAYOUT_TRUNCATED']);

// uas: ['chromium', 'firefox', 'webkit'] analyses the component with each browser's form-control UA profile (the ua
// layout option) and merges the results: a finding lists the browsers it holds in (browsers), so what breaks in one
// browser only is told apart from what breaks everywhere.
export function analyzeStates(component, allOptions = {}) {
  const { uas, ...rest } = allOptions;
  if (!Array.isArray(uas) || !uas.length) return analyzeOneProfile(component, rest);
  const results = uas.map(ua => ({ ua, result: analyzeOneProfile(component, { ...rest, ua }) }));
  const base = results[0].result;
  const keyOf = f => `${f.code}\u0000${f.path ?? f.box}`;
  const merged = new Map();
  for (const { ua, result } of results) for (const f of result.findings) {
    if (!merged.has(keyOf(f))) merged.set(keyOf(f), { ...f, states: [...f.states], browsers: [] });
    const m = merged.get(keyOf(f));
    if (!m.browsers.includes(ua)) m.browsers.push(ua);
  }
  const unknowns = [];
  for (const { ua, result } of results) for (const u of result.unknowns) if (!unknowns.some(x => x.message === u.message)) unknowns.push(uas.length > 1 && !results.every(r => r.result.unknowns.some(x => x.message === u.message)) ? { ...u, message: `${u.message} (with the ${ua} UA profile)` } : u);
  const order = { violated: 2, unknown: 1, verified: 0 };
  const status = results.map(r => r.result.status).reduce((a, b) => order[b] > order[a] ? b : a, 'verified');
  return { ...base, status, unknowns, findings: [...merged.values()], browsers: uas,
    coverage: { ...base.coverage, assumptions: [...base.coverage.assumptions, `form controls checked with the UA profiles of ${uas.join(', ')}`] } };
}

function analyzeOneProfile(component, allOptions = {}) {
  const result = analyzeStatesOnce(component, allOptions);
  // textResize (with defaultFontSize and measured fonts): the component analysed again with the default font size
  // doubled (rem, em, % and keyword font sizes follow it); what breaks only then is E_A11Y_TEXT_RESIZE.
  if (allOptions.textResize && allOptions.defaultFontSize && allOptions.textMetrics) {
    const doubled = analyzeStatesOnce(component, { ...allOptions, defaultFontSize: allOptions.defaultFontSize * 2 });
    const before = new Set(result.findings.map(f => `${f.code}\u0000${f.box}`));
    for (const f of doubled.findings) {
      if (!resizeCodes.has(f.code) || before.has(`${f.code}\u0000${f.box}`) || result.findings.some(g => g.code === 'E_A11Y_TEXT_RESIZE' && g.box === f.box)) continue;
      result.findings.push({ ...f, code: 'E_A11Y_TEXT_RESIZE', severity: 'error', resized: f.code, message: `at 200% text size (a ${allOptions.defaultFontSize * 2}px default font size) ${f.message}` });
    }
    if (doubled.status === 'violated' && result.status === 'verified') result.status = 'violated';
    result.coverage.assumptions = [...result.coverage.assumptions, `text resized to 200% (a ${allOptions.defaultFontSize * 2}px default font size) analysed too (SC 1.4.4)`];
  }
  return result;
}

function analyzeStatesOnce({ states, css, unknowns = [], assumptions = [], scope }, { pageCSS = '', page: wrap = page, name = 'Component', assumeText, textMetrics, fonts = {}, textResize, ...options } = {}) {
  // unmeasured: text boxes (markers the analysis laid out as text) left at the assumed size; null until fonts were reported.
  let assumedTexts = 0, measuredTexts = 0, unmeasured = null;
  // The font files given to the lint are known to be there (the font-family fallback rule does not report them).
  const knownFonts = Object.keys(fonts).length ? { knownFonts: Object.keys(fonts) } : {};
  const unbounded = new Map(), unmeasurable = new Map();
  // Component scope: the component's own CSS starts on its own line after the page CSS, so the scope check can tell
  // the component's selectors from the page's.
  const allCSS = scope ? `${pageCSS}\n${css}` : pageCSS + css;
  const scopeOption = scope ? { mode: scope.mode, ...(scope.ancestors ? { ancestors: scope.ancestors } : {}), ...(scope.owned ? { owned: scope.owned } : {}), firstLine: pageCSS.split('\n').length + 1 } : null;
  const results = states.map(state => {
    let html = state.html, boxes = options.boxes;
    if (wrapsSafely(css)) html = wrapTextRuns(html).html;
    if (assumeText) {
      const marked = markText(html);
      html = marked.html; assumedTexts = Math.max(assumedTexts, marked.count);
      const lineHeight = typeof assumeText === 'object' && assumeText.lineHeight ? assumeText.lineHeight : 24;
      boxes = { ...Object.fromEntries(Array.from({ length: marked.count }, (_, i) => [`.__text${i}`, { minInlineSize: 0, intrinsicBlockSize: lineHeight }])), ...(options.boxes ?? {}) };
    }
    // An analysis that throws (an input the core rejects outright) is that state's Unknown, never a crash of the run.
    let report;
    // With font files (textMetrics), the assumed texts whose computed font is one of them are measured instead: a
    // first pass reports each text's font, a second analyses with the measured contracts.
    if (assumeText && textMetrics && boxes) {
      // (A pass can stop at the first text it cannot size, before the next is styled: passes repeat while they find
      // new texts to measure.)
      for (let pass = 0; pass < 6; pass++) try {
        const first = analyzeHTML(wrap(html), { name, ...options, ...knownFonts, boxes, css: allCSS, reportTextFonts: true });
        // The markers that became text boxes (a marked inline run laid out as a grid or flex container is not one).
        // Dynamic text ('…', the adapters' rendering of {expression}) kept on one line (nowrap or data-text-one-line) with no
        // length bound (data-text-max-length) and no truncation (ellipsis): a long value runs past its box.
        for (const facts of first.textFonts ?? []) if (facts && facts !== 'varied' && !facts.placeholder && String(facts.text).includes('…') && facts.maxLength === undefined
          && (['nowrap', 'pre'].includes(facts.whiteSpace) || facts.oneLine) && !(facts.textOverflow === 'ellipsis' && ['hidden', 'clip'].includes(facts.overflowX)))
          unbounded.set(facts.path, { code: 'W_TEXT_DYNAMIC_UNBOUNDED', box: facts.label, path: facts.path, severity: 'warning', message: `${facts.label} shows dynamic text on one line (white-space: ${facts.whiteSpace}${facts.oneLine ? ', data-text-one-line' : ''}) with no length bound: a long value runs past the box, and its width is not checked. Bound it (data-text-max-length), truncate it (overflow: hidden; text-overflow: ellipsis) or let it wrap`, states: [state.choices], html: state.html });
        var textLeaves = new Set((first.textFonts ?? []).filter(facts => !facts.placeholder).flatMap(facts => (facts.classes ?? []).filter(c => /^__text\d+$/.test(c))));
        const measured = {};
        for (const facts of first.textFonts ?? []) {
          if (facts.placeholder) {
            const ph = (facts.classes ?? []).find(c => /^__ph\d+$/.test(c)), measured_ = ph ? measuredContract({ ...facts, placeholder: undefined }, textMetrics, fonts, options.defaultFontSize) : null;
            if (measured_?.minInlineSize !== undefined) measured[`.${ph}`] = { placeholderInlineSize: Math.ceil(Number(measured_.minInlineSize) * 1e6 - 1e-9) / 1e6 };
            continue;
          }
          const marker = (facts.classes ?? []).find(c => /^__text\d+$/.test(c));
          let contract = marker && !options.boxes?.[`.${marker}`] ? measuredContract(facts, textMetrics, fonts, options.defaultFontSize) : null;
          if (contract?.unmeasurable) { unmeasurable.set(facts.label.replace(/\.__(?:text|anon)\d+/g, ''), contract.unmeasurable); contract = null; }
          if (contract) measured[`.${marker}`] = contract;
          // Not measurable (no font file for its family, or the UA control font): still one assumed line, but of its own
          // computed line height when that is known, not the default.
          else if (marker && !options.boxes?.[`.${marker}`]) {
            const size = /^(\d+(?:\.\d+)?)px$/.exec(String(facts.size))?.[1], lh = String(facts.lineHeight ?? '');
            const line = /^\d+(?:\.\d+)?px$/.test(lh) ? Number(lh.slice(0, -2)) : /^\d+(?:\.\d+)?$/.test(lh) && size ? Number(lh) * Number(size) : null;
            if (line && Number.isFinite(line) && boxes[`.${marker}`]?.intrinsicBlockSize !== Math.round(line * 64) / 64) measured[`.${marker}`] = { minInlineSize: 0, intrinsicBlockSize: Math.round(line * 64) / 64 };
          }
        }
        const fresh = Object.keys(measured).filter(key => JSON.stringify(boxes[key]) !== JSON.stringify(measured[key]));
        boxes = { ...boxes, ...measured };
        measuredTexts = Math.max(measuredTexts, Object.keys(boxes).filter(key => boxes[key]?.font || boxes[key]?.placeholderInlineSize !== undefined).length);
        if (!fresh.length) { unmeasured = Math.max(unmeasured ?? 0, [...textLeaves].filter(m => !boxes[`.${m}`]?.font).length); break; }
      } catch { break; /* the final analysis below reports the failure */ }
    }
    try { report = analyzeHTML(wrap(html), { name, ...options, ...knownFonts, ...(boxes ? { boxes } : {}), css: allCSS, ...(scopeOption ? { scope: scopeOption } : {}) }); }
    catch (error) { report = { status: 'unknown', diagnostics: [{ code: 'U_ADAPTER_ANALYSIS', severity: 'unknown', message: `the analysis of this state failed: ${error.message}` }], sizes: [] }; }
    return { choices: state.choices, html: state.html, report };
  });
  if (measuredTexts) assumptions = [...assumptions, `${measuredTexts} text box(es) measured with the given font files (${Object.keys(fonts).join(', ')}): their widths and line breaks are derived, not assumed`];
  const assumedLeft = unmeasured ?? assumedTexts - measuredTexts;
  if (assumedLeft > 0) assumptions = [...assumptions, `${assumedLeft} text box(es) sized by assumption (one line, no minimum width): text overflow is not checked`];
  if (options.defaultColors) assumptions = [...assumptions, 'the user-agent default colors (canvastext black on a white canvas) under the light preference, where the page declares no dark color-scheme; a user\'s own default colors and forced colors are not checked'];
  if (options.defaultFontSize) assumptions = [...assumptions, `rem (and a root font-size in %, em or medium) resolved at a ${options.defaultFontSize}px browser default font size; other user settings are not checked`];
  const statuses = results.map(r => r.report.status);
  // Verified only when every state is verified and the adapter itself met nothing unknown.
  const status = statuses.includes('violated') ? 'violated' : unknowns.length || statuses.includes('unknown') || !results.length ? 'unknown' : 'verified';
  // Every error and warning of every state, grouped by code and box, with the states (choices) it holds in.
  const grouped = new Map();
  for (const r of results) for (const d of [...r.report.diagnostics.filter(d => d.severity !== 'unknown'), ...(r.report.layoutWarnings ?? []), ...(r.report.accessibility?.warnings ?? []), ...(r.report.integrity?.warnings ?? [])]) {
    const key = `${d.code}\u0000${d.box ?? ''}`;
    if (!grouped.has(key)) grouped.set(key, { code: d.code, box: d.box, path: d.path, severity: d.severity, message: d.message, rule: d.rule, css: d.css, ...(d.layout ? { layout: d.layout } : {}), states: [], html: r.html });
    const entry = grouped.get(key);
    if (!entry.states.includes(r.choices)) entry.states.push(r.choices);
  }
  for (const u of unbounded.values()) if (!grouped.has(`${u.code}\u0000${u.box}`)) grouped.set(`${u.code}\u0000${u.box}`, u);
  // Component scope findings. E_SCOPE_OUTSIDE holds when no state closes the relation (a class a state toggles may);
  // E_SCOPE_REACHES when any state renders another component's content where the selector reaches. The escapes
  // (:global, :deep, :slotted) the adapter found are E_SCOPE_ESCAPE.
  if (scope) {
    const per = results.map(r => (r.report.selectors?.warnings ?? []).filter(w => /^E_SCOPE_/.test(w.code)));
    const keyOf = w => `${w.code}\u0000${w.selector}\u0000${w.line}`;
    const seen = new Map();
    results.forEach((r, i) => { for (const w of per[i]) { if (!seen.has(keyOf(w))) seen.set(keyOf(w), { w, states: [], html: r.html }); seen.get(keyOf(w)).states.push(r.choices); } });
    for (const { w, states: held, html } of seen.values()) {
      if (w.code === 'E_SCOPE_OUTSIDE' && held.length < results.length) continue;
      grouped.set(`${w.code}\u0000${w.selector}`, { code: w.code, box: w.selector, severity: 'error', message: w.message, rule: 'component-scope', states: held, html, selector: w.selector });
    }
    for (const e of scope.escapes ?? []) grouped.set(`E_SCOPE_ESCAPE\u0000${e.selector}`, { code: 'E_SCOPE_ESCAPE', box: e.selector, severity: 'error', rule: 'component-scope', selector: e.selector, states: results.map(r => r.choices),
      message: `${e.selector} uses ${e.kind}, which reaches outside the component's own elements (the page, a parent or a child component): style those elements in the component that renders them, and pass context in as a custom property or a prop` });
  }
  // Checklist F8: a size transitioned between a keyword (auto, none, …) in one state and a length in another (a class
  // toggle) does not interpolate: the box jumps between the states.
  {
    const keyword = v => /^(?:auto|none|fit-content|max-content|min-content|stretch)$/.test(String(v));
    const byPath = new Map();
    for (const r of results) for (const t of r.report.transitionSizes ?? []) { if (!byPath.has(t.path)) byPath.set(t.path, []); byPath.get(t.path).push({ t, r }); }
    for (const [path, list] of byPath) for (const key of new Set(list.flatMap(x => x.t.properties))) {
      const kw = list.find(x => keyword(x.t.values[key])), len = list.find(x => x.t.values[key] !== undefined && !keyword(x.t.values[key]));
      if (!kw || !len) continue;
      // (Already reported by a state's own analysis — a class toggle the stylesheet names: it holds between these states.)
      const existing = grouped.get(`W_CSS_TRANSITION_AUTO\u0000${kw.t.box}`);
      if (existing) { for (const c of [kw.r.choices, len.r.choices]) if (!existing.states.includes(c)) existing.states.push(c); continue; }
      grouped.set(`W_CSS_TRANSITION_AUTO\u0000${kw.t.box}`, { code: 'W_CSS_TRANSITION_AUTO', box: kw.t.box, path, severity: 'warning', rule: 'transition', states: [kw.r.choices, len.r.choices], html: kw.r.html, property: key,
        message: `${kw.t.box} transitions ${key} between ${kw.t.values[key]} and ${len.t.values[key]} (between its states), but a keyword size does not interpolate: the box jumps instead of animating (only Chromium animates it, with interpolate-size: allow-keywords). Animate a length (max-height, or grid-template-rows: 0fr → 1fr)` });
    }
  }
  // Checklist E1: a state change that makes the page overflow the viewport (or fit it again) shows or hides a classic
  // scrollbar, which narrows the page and shifts everything in it, unless html keeps the gutter (scrollbar-gutter: stable,
  // overflow-y: scroll). Overlay-scrollbar platforms do not shift.
  {
    const scrolls = results.map(r => r.report.pageScroll).filter(Boolean);
    const fitting = results.filter(r => r.report.pageScroll?.fits), overflowing = results.filter(r => r.report.pageScroll?.overflows);
    if (results.length > 1 && fitting.length && overflowing.length && !scrolls.every(s => s.stable) && (fitting.some(r => !overflowing.includes(r)) || overflowing.some(r => !fitting.includes(r))))
      grouped.set('W_LAYOUT_SCROLLBAR_SHIFT\u0000html', { code: 'W_LAYOUT_SCROLLBAR_SHIFT', box: 'html', severity: 'warning', rule: 'layout-shift', states: [...new Set([...fitting, ...overflowing])].map(r => r.choices), html: overflowing[0].html,
        message: `the page fits the viewport in some states and overflows it in others: on platforms with classic scrollbars, switching between them shows or hides the page scrollbar, which narrows the page and shifts its content. Keep the gutter with html { scrollbar-gutter: stable }` });
  }
  // Texts the given font files could not measure: their size is only assumed, so what depends on it is not checked.
  for (const [label, reason] of unmeasurable) { const message = `${label}: ${reason}; its text is only assumed to fit, so its overflow is not checked`; if (!unknowns.some(u => u.message === message)) unknowns.push({ code: 'U_TEXT_NOT_MEASURED', message }); }
  // data-noshift contracts the component declares on its own elements, compared between its states.
  let finalStatus = [...grouped.values()].some(f => /^E_SCOPE_/.test(f.code)) ? 'violated' : unmeasurable.size && status === 'verified' ? 'unknown' : status, allUnknowns = unknowns;
  if (results.some(r => /data-noshift/.test(r.html))) {
    const shift = noShift(results, { wrap, name, viewport: options.viewport });
    for (const f of shift.findings) grouped.set(`${f.code}\u0000${f.box}`, f);
    if (shift.findings.length) finalStatus = 'violated';
    else if (shift.unknowns.length && finalStatus === 'verified') finalStatus = 'unknown';
    allUnknowns = [...unknowns, ...shift.unknowns];
  }
  const out = { status: finalStatus, states: results, unknowns: allUnknowns, coverage: { states: states.length, assumptions }, findings: [...grouped.values()] };
  if (options.selectors) {
    // A selector is unused only when it is unused in every state; a row's count is its largest over the states.
    // The code may differ by state (no .item at 0 items: unmatched; with items: a broken relation); the explanation
    // kept is the most specific one, a relation over an unmatched.
    const keyOf = w => `${w.selector}\u0000${w.line}`;
    const everywhere = results.map(r => new Set(r.report.selectors?.warnings.map(keyOf) ?? []));
    const best = new Map();
    for (const w of results.flatMap(r => r.report.selectors?.warnings ?? []).filter(w => !/^E_SCOPE_/.test(w.code))) if (!best.has(keyOf(w)) || (w.code === 'W_CSS_SELECTOR_RELATION' && best.get(keyOf(w)).code !== w.code)) best.set(keyOf(w), w);
    const warnings = [...best.values()].filter(w => everywhere.every(set => set.has(keyOf(w))));
    const rows = (results[0]?.report.selectors?.rows ?? []).map(row => ({ ...row, matched: Math.max(...results.map(r => r.report.selectors?.rows.find(x => x.selector === row.selector && x.line === row.line)?.matched ?? 0)) }));
    out.selectors = { rows, warnings };
  }
  return out;
}
export { lint, formatText, recommended } from './lint.mjs';
