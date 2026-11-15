// Practical lint output on top of an adapter's result: the recommended rule set (rules whose verdicts the Chromium
// e2e and the differential fuzz harnesses check), one message per finding with a source line in the component and
// the template states it holds in, and an info line for everything not checked (Unknown) or assumed.

// The recommended rules: code → severity and a fix. Errors are failures in the browser; warnings are likely bugs.
export const recommended = {
  // Layout: boxes that do not fit (cut off, covered or sticking out — invisible regions).
  E_LAYOUT_ITEM_SIZE: ['error', 'give the box room (a flexible track, max-width: 100%, min-width: 0) or let it shrink'],
  E_LAYOUT_TRACKS: ['error', 'use flexible tracks (minmax(0, 1fr)) or fewer columns at this width'],
  E_LAYOUT_CONTENT: ['error', 'let the content wrap (overflow-wrap: anywhere) or give the box more room'],
  E_LAYOUT_PAGE_OVERFLOW: ['error', 'keep the box inside the viewport width'],
  E_LAYOUT_IMAGE_UNRESERVED: ['error', 'add width and height attributes (or aspect-ratio) so the image reserves its box'],
  E_LAYOUT_IMAGE_RATIO: ['error', 'make the reserved ratio match the file'],
  W_LAYOUT_DECLARATION_INERT: ['warning', 'remove it, or change the parent display it needs'],
  W_LAYOUT_CONTAINER_COLLAPSE: ['warning', 'give the query container a width, flex: 1 or a flex-basis'],
  W_LAYOUT_STICKY_NO_INSET: ['warning', 'add top: 0 (or the edge it should stick to)'],
  W_LAYOUT_STICKY_SCROLLER: ['warning', 'use overflow-x: clip on the ancestor, or move the sticky box out'],
  W_LAYOUT_STICKY_INERT: ['warning', 'make it a child of the scrolling content'],
  W_LAYOUT_ABSOLUTE_PAGE: ['warning', 'give the box it belongs to position: relative'],
  W_LAYOUT_CONTENT_BOX_FULL: ['warning', 'use box-sizing: border-box'],
  W_LAYOUT_MEDIA_NO_MAX: ['warning', 'add max-width: 100%; height: auto'],
  W_LAYOUT_SIZES_MISSING: ['warning', 'add a sizes attribute with the width the image takes at each breakpoint'],
  W_LAYOUT_LONG_WORD: ['warning', 'use overflow-wrap: anywhere for URLs and long words'],
  W_LAYOUT_FIXED_TRACKS: ['warning', 'use repeat(N, minmax(0, 1fr)) or fewer columns under a query'],
  W_LAYOUT_VW_SCROLLBAR: ['warning', 'use 100% instead of 100vw'],
  W_LAYOUT_IMAGE_DISTORTED: ['warning', 'use object-fit: cover (or contain), or let one size be auto'],
  W_LAYOUT_CONTROL_FONT: ['warning', 'add button, input, select, textarea { font: inherit }'],
  W_LAYOUT_FONT_ZOOM: ['warning', 'add a rem part that grows with zoom'],
  W_LAYOUT_ROOT_FONT_FIXED: ['warning', 'use a percentage or rem on html/body'],
  W_LAYOUT_LINE_HEIGHT_FIXED: ['warning', 'use a unitless line-height'],
  W_LAYOUT_HEIGHT_FIXED_TEXT: ['warning', 'use min-height (or padding)'],
  W_LAYOUT_PHYSICAL_IN_RTL: ['warning', 'use the inline-start/end sides'],
  W_CSS_SELECTOR_UNMATCHED: ['warning', 'remove the selector or fix its class name'],
  W_CSS_SELECTOR_RELATION: ['warning', 'make the selector match the template structure'],
  // Accessibility.
  E_A11Y_NAME: ['error', 'give the control a name (text, aria-label or aria-labelledby)'],
  E_A11Y_CONTRAST: ['error', 'raise the contrast of the text against its background'],
  E_A11Y_OCCLUDED: ['error', 'keep the control uncovered, or give the cover pointer-events: none'],
  E_A11Y_LABEL: ['error', 'label the field'],
  E_A11Y_CONTROL_HIDDEN: ['error', 'hide the field visually (opacity: 0 or a clip), not with display: none'],
  E_A11Y_FOCUS_VISIBLE: ['error', 'keep a visible focus indicator'],
  E_A11Y_TARGET_SIZE: ['error', 'make the target at least 24×24 px'],
  W_A11Y_BAR_COVERED: ['warning', 'give the bar a z-index'],
  W_A11Y_BAR_TRANSPARENT: ['warning', 'give the bar an opaque background'],
  W_A11Y_TABINDEX_REMOVED: ['warning', 'drop the negative tabindex'],
  E_A11Y_CONTENTS_FOCUS: ['error', 'give the link or button a box (display: grid/flex/block) instead of display: contents'],
  W_A11Y_LIVE_HIDDEN: ['warning', 'keep the live region rendered'],
  W_A11Y_AUTOFOCUS_HIDDEN: ['warning', 'autofocus an element that is shown at this size'],
  W_A11Y_SELECT_INDICATOR: ['warning', 'draw an arrow for the select'],
};

const cleanLabel = label => String(label ?? '').replace(/\.__text\d+/g, '');
const describe = (states, total) => {
  if (!states || states.length === total) return 'every state';
  const keys = new Set(states.flatMap(s => Object.keys(s)));
  // A key whose value is the same in every listed state is the condition; list those.
  const fixed = [...keys].filter(k => states.every(s => s[k] === states[0][k])).map(k => `${k.replace(/^#(?:each|for|map) /, '')}${k.startsWith('#') ? ` ×${states[0][k]}` : `=${JSON.stringify(states[0][k])}`}`);
  return fixed.length ? fixed.join(', ') : `${states.length} of ${total} states`;
};
import { parseFragment } from 'parse5';
// The source line of a finding's box: adapters given sourceLines mark each element with data-src-line; the box path
// (name/0/… : html, body, then the component's elements) leads to it in the state's markup.
const lineAt = (html, path) => {
  if (!html || !path) return undefined;
  const steps = path.split('/').slice(2).map(Number);
  let node = parseFragment(html);
  for (const i of steps) { node = (node.childNodes ?? []).filter(c => c.tagName)[i]; if (!node) return undefined; }
  const line = node.attrs?.find(a => a.name === 'data-src-line')?.value;
  return line ? Number(line) : undefined;
};
// The source line of a box or selector: the first line that mentions its first class, or the selector text.
const lineOf = (source, needle) => {
  if (!needle) return undefined;
  const index = source.indexOf(needle);
  return index < 0 ? undefined : source.slice(0, index).split('\n').length;
};

/**
 * Lint messages for an adapter result.
 * @returns {{file, line?, severity: 'error'|'warning'|'info', code, message, fix?, states?}[]}
 */
export function lint(result, { file = '<component>', source = '', profile = 'recommended' } = {}) {
  const total = result.states.length, out = [];
  const rules = profile === 'all' ? null : recommended;
  // One element under different class combinations (cx(a, cond && b)) is one finding: merge by code and element.
  const merged = new Map();
  for (const f of result.findings) {
    const key = `${f.code}\u0000${f.path ?? f.box}`;
    if (!merged.has(key)) merged.set(key, { ...f, states: [...f.states] });
    else merged.get(key).states.push(...f.states);
  }
  for (const f of merged.values()) {
    if (f.severity === 'unknown') continue;
    if (rules && !rules[f.code]) continue;
    const [severity, fix] = rules?.[f.code] ?? [f.severity === 'error' ? 'error' : 'warning'];
    const box = cleanLabel(f.box), firstClass = /\.([\w-]+)/.exec(box)?.[1];
    out.push({ file, line: lineAt(f.html, f.path) ?? lineOf(source, firstClass ? firstClass : box), severity, code: f.code, message: f.message.replace(/\.__text\d+/g, ''), ...(fix ? { fix } : {}), states: describe(f.states, total) });
  }
  for (const w of result.selectors?.warnings ?? []) {
    if (rules && !rules[w.code]) continue;
    if (/^(?:html|body|\*)/.test(w.selector)) continue;
    out.push({ file, line: lineOf(source, w.selector) ?? lineOf(source, /\.([\w-]+)/.exec(w.selector)?.[1]), severity: rules?.[w.code]?.[0] ?? 'warning', code: w.code, message: w.message, fix: rules?.[w.code]?.[1], states: 'every state' });
  }
  // Not checked: the adapter's Unknowns, each state's Unknowns, and the assumptions made.
  for (const u of result.unknowns) out.push({ file, severity: 'info', code: u.code, message: `not checked: ${u.message}` });
  const seen = new Set();
  for (const s of result.states) for (const d of s.report.diagnostics.filter(d => d.severity === 'unknown')) {
    const key = `${d.code} ${d.box}`; if (seen.has(key)) continue; seen.add(key);
    out.push({ file, line: lineOf(source, /\.([\w-]+)/.exec(cleanLabel(d.box))?.[1]), severity: 'info', code: d.code, message: `not checked: ${d.message.replace(/\.__text\d+/g, '')}` });
  }
  for (const a of result.coverage?.assumptions ?? []) out.push({ file, severity: 'info', code: 'ASSUMPTION', message: a });
  return out.sort((a, b) => ({ error: 0, warning: 1, info: 2 })[a.severity] - ({ error: 0, warning: 1, info: 2 })[b.severity] || (a.line ?? 1e9) - (b.line ?? 1e9));
}

/** Text output: file:line  severity  code  message  (states) and the fix. */
export const formatText = messages => messages.map(m => `${m.file}${m.line ? `:${m.line}` : ''}  ${m.severity.padEnd(7)}  ${m.code}  ${m.message}${m.states && m.states !== 'every state' ? `  [${m.states}]` : ''}${m.fix ? `\n    fix: ${m.fix}` : ''}`).join('\n');
