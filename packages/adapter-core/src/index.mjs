// The shared part of the component adapters (Svelte, Vue, React with StyleX or Linaria). An adapter turns one
// component into its template states — { html, choices } with the conditions each takes — plus its CSS; this module
// analyses every state with the generic core and reports what holds per state. The core knows nothing of components.
import { analyzeHTML, phrasingTags } from '@mizchi/css-verifier/html';
import { parseFragment, serialize } from 'parse5';

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
function measuredContract(facts, textMetrics, fonts) {
  // Dynamic text ({expression}, {{ … }}) is rendered as the placeholder '…': its real string is not known, so it is
  // never measured (a literal '…' in the template stays assumed too).
  // A maximum length (data-text-max-length, with data-text-chars or printable ASCII) measures every string of that
  // many characters instead: dynamic text can be checked that way.
  const domain = facts && !facts.varied && /^\d+$/.test(String(facts.maxLength ?? '')) ? { characters: facts.characters ?? printableASCII, maxLength: Number(facts.maxLength) } : null;
  if (!facts || facts.varied || (!domain && (!facts.text || facts.text.includes('…')))) return null;
  const family = Object.keys(fonts).find(name => name.toLowerCase() === String(facts.family).replace(/["']/g, '').split(',')[0].trim().toLowerCase());
  const px = v => /^\d+(?:\.\d+)?px$/.test(String(v)) ? Number(String(v).slice(0, -2)) : undefined;
  const size = px(facts.size);
  const lineHeight = px(facts.lineHeight) ?? (/^\d+(?:\.\d+)?$/.test(String(facts.lineHeight)) && size ? Number(facts.lineHeight) * size : undefined);
  const weight = facts.weight === 'normal' ? 400 : facts.weight === 'bold' ? 700 : /^\d+$/.test(String(facts.weight)) ? Number(facts.weight) : undefined;
  if (!family || !size || !lineHeight || !weight || facts.style !== 'normal' || facts.letterSpacing !== 'normal') return null;
  // data-text-one-line: expected to fit on one line whatever white-space allows. A length domain has no fixed line
  // breaks, so it needs one line (nowrap CSS or the attribute).
  const nowrap = ['nowrap', 'pre'].includes(facts.whiteSpace);
  const wrap = nowrap ? 'nowrap' : facts.oneLine ? 'one-line' : domain ? null : ['normal', 'pre-line', 'pre-wrap'].includes(facts.whiteSpace) ? (facts.overflowWrap === 'anywhere' ? 'anywhere' : 'normal') : null;
  if (!wrap) return null;
  const contract = { text: { font: { family, size, lineHeight, weight }, ...(domain ?? { content: facts.text }), ...(facts.lang ? { lang: facts.lang } : {}), ...(wrap === 'normal' && facts.overflowWrap !== 'normal' ? { overflowWrap: facts.overflowWrap } : {}) }, wrap };
  try { return textMetrics.resolveBoxes({ x: contract }).x; } catch { return null; }
}

// Overflow-like findings that text resizing can cause (SC 1.4.4 compares them at 1× and 2× the default font size).
const resizeCodes = new Set(['E_LAYOUT_CONTENT', 'E_LAYOUT_ITEM_SIZE', 'E_LAYOUT_TRACKS', 'E_LAYOUT_PAGE_OVERFLOW', 'E_LAYOUT_PROTRUSION', 'E_A11Y_TEXT_OBSCURED', 'E_A11Y_TEXT_START_OBSCURED', 'W_LAYOUT_CLIPPED', 'W_LAYOUT_TRUNCATED']);

export function analyzeStates(component, allOptions = {}) {
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

function analyzeStatesOnce({ states, css, unknowns = [], assumptions = [] }, { pageCSS = '', page: wrap = page, name = 'Component', assumeText, textMetrics, fonts = {}, textResize, ...options } = {}) {
  let assumedTexts = 0, measuredTexts = 0;
  const results = states.map(state => {
    let html = state.html, boxes = options.boxes;
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
        const first = analyzeHTML(wrap(html), { name, ...options, boxes, css: pageCSS + css, reportTextFonts: true });
        const measured = {};
        for (const facts of first.textFonts ?? []) {
          if (facts.placeholder) {
            const ph = (facts.classes ?? []).find(c => /^__ph\d+$/.test(c)), measured_ = ph ? measuredContract({ ...facts, placeholder: undefined }, textMetrics, fonts) : null;
            if (measured_?.minInlineSize !== undefined) measured[`.${ph}`] = { placeholderInlineSize: Math.ceil(Number(measured_.minInlineSize) * 1e6 - 1e-9) / 1e6 };
            continue;
          }
          const marker = (facts.classes ?? []).find(c => /^__text\d+$/.test(c));
          const contract = marker && !options.boxes?.[`.${marker}`] ? measuredContract(facts, textMetrics, fonts) : null;
          if (contract) measured[`.${marker}`] = contract;
        }
        const fresh = Object.keys(measured).filter(key => JSON.stringify(boxes[key]) !== JSON.stringify(measured[key]));
        boxes = { ...boxes, ...measured };
        measuredTexts = Math.max(measuredTexts, Object.keys(boxes).filter(key => boxes[key]?.font || boxes[key]?.placeholderInlineSize !== undefined).length);
        if (!fresh.length) break;
      } catch { break; /* the final analysis below reports the failure */ }
    }
    try { report = analyzeHTML(wrap(html), { name, ...options, ...(boxes ? { boxes } : {}), css: pageCSS + css }); }
    catch (error) { report = { status: 'unknown', diagnostics: [{ code: 'U_ADAPTER_ANALYSIS', severity: 'unknown', message: `the analysis of this state failed: ${error.message}` }], sizes: [] }; }
    return { choices: state.choices, html: state.html, report };
  });
  if (measuredTexts) assumptions = [...assumptions, `${measuredTexts} text box(es) measured with the given font files (${Object.keys(fonts).join(', ')}): their widths and line breaks are derived, not assumed`];
  if (assumedTexts - measuredTexts > 0) assumptions = [...assumptions, `${assumedTexts - measuredTexts} text box(es) sized by assumption (one line, no minimum width): text overflow is not checked`];
  if (options.defaultFontSize) assumptions = [...assumptions, `rem (and a root font-size in %, em or medium) resolved at a ${options.defaultFontSize}px browser default font size; other user settings are not checked`];
  const statuses = results.map(r => r.report.status);
  // Verified only when every state is verified and the adapter itself met nothing unknown.
  const status = statuses.includes('violated') ? 'violated' : unknowns.length || statuses.includes('unknown') || !results.length ? 'unknown' : 'verified';
  // Every error and warning of every state, grouped by code and box, with the states (choices) it holds in.
  const grouped = new Map();
  for (const r of results) for (const d of [...r.report.diagnostics.filter(d => d.severity !== 'unknown'), ...(r.report.layoutWarnings ?? []), ...(r.report.accessibility?.warnings ?? []), ...(r.report.integrity?.warnings ?? [])]) {
    const key = `${d.code}\u0000${d.box ?? ''}`;
    if (!grouped.has(key)) grouped.set(key, { code: d.code, box: d.box, path: d.path, severity: d.severity, message: d.message, rule: d.rule, css: d.css, states: [], html: r.html });
    const entry = grouped.get(key);
    if (!entry.states.includes(r.choices)) entry.states.push(r.choices);
  }
  const out = { status, states: results, unknowns, coverage: { states: states.length, assumptions }, findings: [...grouped.values()] };
  if (options.selectors) {
    // A selector is unused only when it is unused in every state; a row's count is its largest over the states.
    // The code may differ by state (no .item at 0 items: unmatched; with items: a broken relation); the explanation
    // kept is the most specific one, a relation over an unmatched.
    const keyOf = w => `${w.selector}\u0000${w.line}`;
    const everywhere = results.map(r => new Set(r.report.selectors?.warnings.map(keyOf) ?? []));
    const best = new Map();
    for (const w of results.flatMap(r => r.report.selectors?.warnings ?? [])) if (!best.has(keyOf(w)) || (w.code === 'W_CSS_SELECTOR_RELATION' && best.get(keyOf(w)).code !== w.code)) best.set(keyOf(w), w);
    const warnings = [...best.values()].filter(w => everywhere.every(set => set.has(keyOf(w))));
    const rows = (results[0]?.report.selectors?.rows ?? []).map(row => ({ ...row, matched: Math.max(...results.map(r => r.report.selectors?.rows.find(x => x.selector === row.selector && x.line === row.line)?.matched ?? 0)) }));
    out.selectors = { rows, warnings };
  }
  return out;
}
export { lint, formatText, recommended } from './lint.mjs';
