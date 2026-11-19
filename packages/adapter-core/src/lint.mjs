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
  // Component scope: a component's selectors and the parent-child relations they rely on stay inside it.
  E_SCOPE_OUTSIDE: ['error', 'keep the relation inside the component (a class or prop on its own root), or pass the context in as a custom property'],
  E_SCOPE_REACHES: ['error', 'style the child component\'s elements in that component (a class or variant prop it exposes); name this component\'s own class here'],
  E_LAYOUT_ABSOLUTE_CLIPPED: ['error', 'move overflow: hidden off the menu\'s containing block (onto an inner wrapper), render the menu outside it (a portal), or keep it inside'],
  W_LAYOUT_FIXED_TRAPPED: ['warning', 'render the fixed box outside the transformed / backdrop-filtered box (a portal to the end of body), or drop that property'],
  // A CSS authoring error the analysis rejects (a shorthand and another declaration writing one longhand in one rule).
  E_CSS_SHORTHAND_CONFLICT: ['error', 'put the shorthand and the longhand in separate rules (the later rule wins), or write only longhands (font: inherit, then font-size in another rule)'],
  E_SCOPE_CONTRACT: ['error', 'declare data-noshift inside the child component, or wrap it in an element of this component and mark that'],
  // Layout shift: an element the component marks data-noshift moves or resizes between its states.
  E_LAYOUT_NOSHIFT: ['error', 'reserve the space the changing content needs (a fixed track or min-height), overlay it (position: absolute), or limit the contract to the states it should hold in (data-noshift-on)'],
  E_SCOPE_ESCAPE: ['error', 'drop :global/:deep/:slotted: style each element in the component that renders it'],
  E_A11Y_FIXED_HIDES: ['error', 'offset the content by the fixed bar\'s size (padding or margin), as the rest of the page is'],
  E_A11Y_TEXT_RESIZE: ['error', 'let the box grow with its text (no fixed height, min-width: 0, wrapping) so it holds at 200% text size'],
  E_A11Y_PAGE_CLIPPED: ['error', 'let the content fit the viewport (min-width: 0, max-width: 100%, wrapping) instead of hiding the overflow'],
  E_A11Y_TEXT_START_OBSCURED: ['error', 'move the covering box off the text, or give the text room (padding) beside it'],
  E_A11Y_PAGE_START_UNREACHABLE: ['error', 'center tall content safely (safe center, or margin: auto), or use min-height instead of height so the page can grow'],
  E_A11Y_BEHIND_BACKGROUND: ['error', 'give the ancestor isolation: isolate (or position: relative; z-index: 0), or drop the negative z-index'],
  E_A11Y_SCROLL_START_UNREACHABLE: ['error', 'align overflowing content safely (justify-content: safe center, or auto margins) so it never lands before the scroll container\'s start'],
  E_A11Y_SCROLL_END_COVERED: ['error', 'give the scroll container a padding-bottom at least as tall as the box over its end, so its last item scrolls clear of it'],
  E_A11Y_FIXED_HIDES_PART: ['error', 'offset this content by the fixed sidebar\'s width (padding or margin), as the rest of the page is'],
  E_A11Y_IMAGE_ALT: ['error', 'add an alt attribute: the image\'s text equivalent, or alt="" when it is decorative'],
  E_A11Y_ROLE_FOCUS: ['error', 'make the element focusable (tabindex="0") or use the native element (button, input type="checkbox")'],
  W_A11Y_PLACEHOLDER_LABEL: ['warning', 'give the field a visible label (label for=, or aria-labelledby): the placeholder disappears as soon as the user types'],
  E_A11Y_TEXT_LINE_OBSCURED: ['error', 'give the text room beside the covering box (padding on that side, or a grid column for the button)'],
  W_TEXT_DYNAMIC_UNBOUNDED: ['warning', 'bound the text (data-text-max-length), truncate it (overflow: hidden; text-overflow: ellipsis) or let it wrap'],
  W_A11Y_COLOR_ONLY_STATE: ['warning', 'add a cue besides color (font weight, an underline, an icon or a border), or make the two colors contrast 3:1'],
  E_A11Y_FOCUS_OFFSCREEN: ['error', 'take the off-screen element out of the focus order while it is hidden (visibility: hidden, display: none or inert), or bring it into view when it is focused'],
  E_LAYOUT_IMAGE_UNRESERVED: ['error', 'add width and height attributes (or aspect-ratio) so the image reserves its box'],
  E_LAYOUT_IMAGE_RATIO: ['error', 'make the reserved ratio match the file'],
  W_A11Y_PLACEHOLDER_CLIPPED: ['warning', 'shorten the placeholder (or put the hint in a label) or widen the field'],
  W_A11Y_IMAGE_FALLBACK_CONTRAST: ['warning', 'give the image\'s box a background-color that keeps the text readable without the image'],
  W_LAYOUT_DECLARATION_INERT: ['warning', 'remove it, or change the parent display it needs'],
  W_LAYOUT_FOCUS_SHIFT: ['warning', 'draw focus with outline or box-shadow, or keep the size (change border-color, not border-width)'],
  W_LAYOUT_CONTAINER_COLLAPSE: ['warning', 'give the query container a width, flex: 1 or a flex-basis'],
  W_LAYOUT_STICKY_NO_INSET: ['warning', 'add top: 0 (or the edge it should stick to)'],
  W_CSS_FONT_NO_GENERIC: ['warning', 'end the font-family list with a generic family (sans-serif, serif, monospace, system-ui)'],
  W_LAYOUT_MIN_ABOVE_MAX: ['warning', 'swap the min and max values (the max must be at least the min)'],
  W_CSS_KEYFRAMES_MISSING: ['warning', 'fix the animation name (it is case-sensitive) or add the @keyframes rule'],
  W_CSS_ANIMATION_NO_DURATION: ['warning', 'give the animation a duration (animation: name 1s)'],
  W_CSS_VAR_INVALID: ['warning', 'define the custom property, or give var() a fallback (var(--x, value))'],
  W_CSS_DUPLICATE_DECLARATION: ['warning', 'remove the declaration that never applies'],
  W_CSS_TRANSITION_AUTO: ['warning', 'animate a length instead (max-height, or grid-template-rows: 0fr to 1fr)'],
  W_CSS_PSEUDO_NO_CONTENT: ['warning', 'add content: "" (or the text the pseudo-element shows)'],
  W_CSS_TRANSITION_NO_DURATION: ['warning', 'give the transition a duration (transition: opacity .2s)'],
  W_CSS_BORDER_NO_STYLE: ['warning', 'add border-style: solid (or write border: 2px solid)'],
  W_CSS_STATE_UNREACHABLE: ['warning', 'make the element focusable (or drop pointer-events: none), or move the state rule to an element that gets it'],
  W_CSS_VISITED_IGNORED: ['warning', 'change only colors in :visited (color, background-color, border and outline colors)'],
  W_CSS_MARKER_IGNORED: ['warning', 'style the list item, or draw your own marker with ::before'],
  W_A11Y_SUMMARY_INDICATOR: ['warning', 'show the open state: a ::before that turns with details[open], or an icon'],
  W_CSS_SELECTOR_IMPLIED_PARENT: ['warning', 'write the implied element in the selector (table > tbody > tr), or use a descendant combinator'],
  W_HTML_RESTRUCTURED: ['warning', 'fix the nesting: only phrasing content in <p>, no link in a link, no block in a button'],
  W_HTML_ATTRIBUTE_INERT: ['warning', 'set it in CSS (width, height, background-color, border)'],
  W_CSS_EMPTY_WHITESPACE: ['warning', 'remove the whitespace in the element, or use :not(:has(*))'],
  W_CSS_MEDIA_NEVER: ['warning', 'check the order of the bounds: min-width below max-width'],
  W_LAYOUT_SCROLLBAR_SHIFT: ['warning', 'keep the scrollbar gutter with html { scrollbar-gutter: stable }'],
  W_LAYOUT_BALANCE_LINES: ['warning', 'bound the text length (data-text-max-length), or use text-wrap: pretty'],
  W_A11Y_TRANSITION_MOTION: ['warning', 'set transition: none (or a short duration) under @media (prefers-reduced-motion: reduce)'],
  W_CSS_IMPORT_IGNORED: ['warning', 'move @import to the top of the sheet (before every other rule)'],
  W_CSS_KEYFRAME_IMPORTANT: ['warning', 'remove !important from the keyframe (it makes the declaration invalid there)'],
  W_CSS_TRANSITION_DISPLAY: ['warning', 'add transition-behavior: allow-discrete (and @starting-style), or transition opacity and visibility'],
  W_LAYOUT_SCROLL_NEVER: ['warning', 'give the scrolling box a max-height (or height) so it scrolls instead of growing'],
  W_CSS_MEDIA_GAP: ['warning', 'make the breakpoints meet: max-width 0.02px below the min-width, or a range query (width < N)'],
  W_LAYOUT_INLINE_GAP: ['warning', 'lay the items out with display: flex and gap instead of inline-block'],
  W_LAYOUT_IMAGE_BASELINE_GAP: ['warning', 'give the image display: block (or vertical-align: top)'],
  W_LAYOUT_STICKY_SCROLLER: ['warning', 'use overflow-x: clip on the ancestor, or move the sticky box out'],
  W_LAYOUT_STICKY_INERT: ['warning', 'make it a child of the scrolling content'],
  W_LAYOUT_ABSOLUTE_PAGE: ['warning', 'give the box it belongs to position: relative'],
  W_LAYOUT_MARKER_HIDDEN: ['warning', 'give the list padding-inline-start (or list-style-position: inside)'],
  W_LAYOUT_FULL_WIDTH_MARGIN: ['warning', 'drop width: 100% (a grid or flex item stretches) or use calc(100% - the margins)'],
  W_LAYOUT_CONTENT_BOX_FULL: ['warning', 'use box-sizing: border-box'],
  W_LAYOUT_MEDIA_NO_MAX: ['warning', 'add max-width: 100%; height: auto'],
  W_LAYOUT_SOURCE_SHADOWED: ['warning', 'order the picture sources from the most specific media to the least'],
  W_LAYOUT_IMAGE_UPSCALED: ['warning', 'cap the image at its file width (max-width) or add a wider srcset candidate'],
  W_LAYOUT_SVG_UNSIZED: ['warning', 'give the svg width and height (attributes or CSS)'],
  W_LAYOUT_EMBED_NO_RATIO: ['warning', 'add aspect-ratio (e.g. 16 / 9) or a height to the iframe'],
  W_LAYOUT_CONTENT_VISIBILITY_SIZE: ['warning', 'add contain-intrinsic-size: auto <its usual height>'],
  W_LAYOUT_DIALOG_CLOSED_SHOWN: ['warning', 'put the display on dialog[open] so the closed dialog stays hidden'],
  W_LAYOUT_SIZES_MISSING: ['warning', 'add a sizes attribute with the width the image takes at each breakpoint'],
  W_LAYOUT_LONG_WORD: ['warning', 'use overflow-wrap: anywhere for URLs and long words'],
  W_LAYOUT_GRID_AREA_UNKNOWN: ['warning', 'use a name from the parent\'s grid-template-areas'],
  W_LAYOUT_FIXED_TRACKS: ['warning', 'use repeat(N, minmax(0, 1fr)) or fewer columns under a query'],
  W_LAYOUT_VW_SCROLLBAR: ['warning', 'use 100% instead of 100vw'],
  W_LAYOUT_IMAGE_DISTORTED: ['warning', 'use object-fit: cover (or contain), or let one size be auto'],
  W_LAYOUT_CONTROL_FONT: ['warning', 'add button, input, select, textarea { font: inherit }'],
  W_LAYOUT_FONT_ZOOM: ['warning', 'add a rem part that grows with zoom'],
  W_LAYOUT_ROOT_FONT_FIXED: ['warning', 'use a percentage or rem on html/body'],
  W_LAYOUT_LINE_HEIGHT_FIXED: ['warning', 'use a unitless line-height'],
  W_LAYOUT_HEIGHT_FIXED_TEXT: ['warning', 'use min-height (or padding)'],
  W_LAYOUT_PHYSICAL_IN_RTL: ['warning', 'use the inline-start/end sides'],
  W_CSS_CONTAINER_QUERY_NEVER: ['warning', 'give an ancestor container-type (and the container-name), or fix the size'],
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
  W_A11Y_LABEL_POINTER: ['warning', 'remove pointer-events: none from the label'],
  W_A11Y_CARET_HIDDEN: ['warning', 'leave caret-color auto, or give it a visible color'],
  W_A11Y_TABINDEX_REMOVED: ['warning', 'drop the negative tabindex'],
  E_A11Y_ICON_CONTRAST: ['error', 'draw the icon in a color with 3:1 against the control background (fill: currentColor and a contrasting color)'],
  E_A11Y_CONTENTS_FOCUS: ['error', 'give the link or button a box (display: grid/flex/block) instead of display: contents'],
  W_A11Y_LIVE_HIDDEN: ['warning', 'keep the live region rendered'],
  W_A11Y_AUTOFOCUS_HIDDEN: ['warning', 'autofocus an element that is shown at this size'],
  W_A11Y_SELECT_INDICATOR: ['warning', 'draw an arrow for the select'],
};

const cleanLabel = label => String(label ?? '').replace(/\.__(?:text|ph)\d+/g, '');
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
const nodeAt = (html, path) => {
  if (!html || !path) return undefined;
  const steps = path.split('/').slice(2).map(Number);
  let node = parseFragment(html);
  for (const i of steps) { node = (node.childNodes ?? []).filter(c => c.tagName)[i]; if (!node) return undefined; }
  return node;
};
const lineAt = (html, path) => { const line = nodeAt(html, path)?.attrs?.find(a => a.name === 'data-src-line')?.value; return line ? Number(line) : undefined; };
// A fix that depends on the element: a table's columns are sized by its cells, not by grid tracks.
// The spec tier: WAI-ARIA / HTML conformance errors in the markup alone. No rendering shows them (Chromium draws a
// switch without aria-checked like any other), so no browser oracle confirms them: they are warnings tagged
// tier: 'spec', separate from the recommended rules' errors, and their message says so.
export const specRules = {
  E_A11Y_ROLE: 'use a WAI-ARIA role (or remove the role attribute)',
  E_A11Y_ROLE_ATTR: 'add the attribute the role requires (a switch needs aria-checked, a slider aria-valuenow)',
  E_A11Y_ARIA_ATTR: 'fix the attribute name (it is not an ARIA attribute)',
  E_A11Y_ARIA_VALUE: 'use one of the attribute\'s allowed values',
  E_A11Y_REFERENCE: 'point the reference at an id that exists in the document',
  E_A11Y_DUPLICATE_ID: 'give each element a unique id',
  E_A11Y_ROLE_CHILDREN: 'put only the children the role allows inside it (a list holds listitems)',
  E_A11Y_ROLE_PARENT: 'put the element inside the parent its role requires',
  E_A11Y_NESTED_INTERACTIVE: 'do not nest a control inside another (move it out of the link or button)',
  E_A11Y_PRESENTATION_CONFLICT: 'drop role="presentation"/"none" from a focusable element or one with global ARIA attributes',
  E_A11Y_LIST: 'put only li (and script/template) directly inside ul/ol',
  E_A11Y_DL: 'put only dt/dd groups (or div wrapping them) directly inside dl',
  E_A11Y_SCOPE: 'use scope only on th, with row, col, rowgroup or colgroup',
  E_A11Y_EMPTY_TH: 'give the header cell text (or make it a td)',
  E_A11Y_TABLE_HEADERS_REF: 'point headers at th ids in the same table',
  E_A11Y_LABEL_FOR: 'point the label\'s for at a labelable element\'s id',
  E_A11Y_AUTOCOMPLETE: 'use a valid autocomplete token for the field',
  E_A11Y_LANG_VALID: 'use a valid BCP 47 language tag',
  E_A11Y_INPUT_BUTTON_NAME: 'give the input button a value (its visible text and name)',
  E_A11Y_INPUT_IMAGE_ALT: 'give the image input an alt',
  E_A11Y_HIDDEN_FOCUSABLE: 'make the focusable element inside aria-hidden unfocusable (tabindex="-1", inert) or unhide it',
};
// A flex row's items are not tracks.
const fixFor = (code, fix, html, path, layout) => code !== 'E_LAYOUT_TRACKS' ? fix
  : nodeAt(html, path)?.tagName === 'table' ? 'let the cells wrap (no white-space: nowrap, shorter headers), or scroll the table inside a wrapper with overflow-x: auto'
  : layout === 'flex' ? 'let the items shrink (flex-shrink: 1 with min-width: 0 and a flexible width), wrap them (flex-wrap: wrap), or scroll the row (overflow-x: auto)' : fix;
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
// Rules about a whole page (its h1, main landmark, skip link, text outside landmarks): a component is not a page, so
// they are left out unless page: true.
const pageRules = new Set(['W_A11Y_PAGE_H1', 'W_A11Y_NO_MAIN', 'W_A11Y_MULTIPLE_MAIN', 'W_A11Y_REGION', 'W_A11Y_BYPASS', 'W_A11Y_LANDMARK_TOP_LEVEL', 'W_A11Y_DUPLICATE_LANDMARK']);
// Messages as an author reads them: the adapter's internal text markers removed, exact fractions as px decimals.
const readable = message => message.replace(/\.__(?:text|ph)\d+/g, '').replace(/(\d+)\/(\d+)(?=px)/g, (m, a, b) => String(Math.round(Number(a) / Number(b) * 100) / 100));
export function lint(result, { file = '<component>', source = '', profile = 'recommended', page = false } = {}) {
  const total = result.states.length, out = [];
  // Checked with several UA profiles: a finding that holds in some browsers only says which.
  const inBrowsers = f => result.browsers && f.browsers && f.browsers.length < result.browsers.length ? ` (in ${f.browsers.join(', ')}; not in ${result.browsers.filter(b => !f.browsers.includes(b)).join(', ')})` : '';
  const rules = profile === 'all' ? null : recommended;
  // One element under different class combinations (cx(a, cond && b)) is one finding: merge by code and element.
  const merged = new Map();
  for (const f of result.findings) {
    const key = `${f.code}\u0000${f.path ?? f.box}`;
    if (!merged.has(key)) merged.set(key, { ...f, states: [...f.states] });
    else merged.get(key).states.push(...f.states);
  }
  // One root cause, one finding: a box reaching past the viewport inside a box whose overflow is already reported (its
  // tracks, its size, its own page overflow) is folded into that outermost finding, and a fixed bar hiding part of a
  // text (E_A11Y_FIXED_HIDES_PART) already says its start is hidden.
  const overflowRoots = new Set(['E_LAYOUT_TRACKS', 'E_LAYOUT_ITEM_SIZE', 'E_LAYOUT_PAGE_OVERFLOW', 'E_LAYOUT_CONTENT']);
  const roots = [...merged.values()].filter(f => overflowRoots.has(f.code) && f.path && f.severity !== 'unknown');
  for (const [key, f] of merged) {
    if (f.code === 'E_LAYOUT_PAGE_OVERFLOW' && f.path) {
      const root = roots.filter(r => f.path.startsWith(`${r.path}/`)).sort((a, b) => a.path.length - b.path.length)[0];
      if (root) { root.folded = (root.folded ?? 0) + 1; merged.delete(key); }
    }
    if (f.code === 'E_A11Y_TEXT_START_OBSCURED' && [...merged.values()].some(g => g.code === 'E_A11Y_FIXED_HIDES_PART' && g.path === f.path)) merged.delete(key);
  }
  for (const f of merged.values()) if (f.folded) f.message = `${f.message} (also: ${f.folded} ${f.folded > 1 ? 'boxes' : 'box'} inside it reach${f.folded > 1 ? '' : 'es'} past the viewport)`;
  // Codes that mean the analysis did not go into a box: what is under it is not checked (never a silent pass).
  const refusals = new Set(['E_LAYOUT_CONTAINER']);
  for (const f of merged.values()) {
    if (f.severity === 'unknown' || (!page && pageRules.has(f.code))) continue;
    if (rules && !rules[f.code] && specRules[f.code] && f.severity === 'error') {
      const box = cleanLabel(f.box), firstClass = /\.([\w-]+)/.exec(box)?.[1];
      out.push({ file, line: lineAt(f.html, f.path) ?? lineOf(source, firstClass ? firstClass : box), severity: 'warning', tier: 'spec', code: f.code,
        message: `spec: ${readable(f.message)} (a markup conformance error; the rendering does not show it)`, fix: specRules[f.code], states: describe(f.states, total) });
      continue;
    }
    if (rules && !rules[f.code]) {
      // Outside the rule set: still listed (as info), so nothing found disappears from the output.
      const box = cleanLabel(f.box), firstClass = /\.([\w-]+)/.exec(box)?.[1];
      out.push({ file, line: lineAt(f.html, f.path) ?? lineOf(source, firstClass ? firstClass : box), severity: 'info', code: f.code,
        message: refusals.has(f.code) ? `not checked: ${box} and what is inside it (${readable(f.message)}; the analysis models grid and flex containers)` : `outside the ${profile} rules: ${readable(f.message)}`, states: describe(f.states, total) });
      continue;
    }
    const [severity, fix] = rules?.[f.code] ?? [f.severity === 'error' ? 'error' : 'warning'];
    const box = cleanLabel(f.box), firstClass = /\.([\w-]+)/.exec(box)?.[1];
    out.push({ file, line: lineAt(f.html, f.path) ?? lineOf(source, firstClass ? firstClass : box), severity, code: f.code, message: readable(f.message) + inBrowsers(f), ...(f.browsers && result.browsers ? { browsers: f.browsers } : {}), ...(fix ? { fix: fixFor(f.code, fix, f.html, f.path, f.layout) } : {}), states: describe(f.states, total) });
  }
  for (const w of result.selectors?.warnings ?? []) {
    if (rules && !rules[w.code]) continue;
    if (/^(?:html|body|\*)/.test(w.selector)) continue;
    out.push({ file, line: lineOf(source, w.selector) ?? lineOf(source, /\.([\w-]+)/.exec(w.selector)?.[1]), severity: rules?.[w.code]?.[0] ?? 'warning', code: w.code, message: w.message, fix: rules?.[w.code]?.[1], states: 'every state' });
  }
  // Not checked: the adapter's Unknowns, each state's Unknowns, and the assumptions made.
  for (const u of result.unknowns) out.push({ file, severity: 'info', code: u.code, message: `not checked: ${readable(u.message)}` });
  const seen = new Set();
  for (const s of result.states) for (const d of s.report.diagnostics.filter(d => d.severity === 'unknown')) {
    const key = `${d.code} ${d.box}`; if (seen.has(key)) continue; seen.add(key);
    // An exception inside the analysis is the checker's failure, not a property of the component: a warning, so a
    // regression in the checker cannot hide among the not-checked lines.
    if (d.code === 'U_ADAPTER_ANALYSIS') { out.push({ file, severity: 'warning', code: 'W_LINT_ANALYSIS_FAILED', message: `the checker failed on this state, so nothing in it was checked: ${readable(d.message).replace(/^the analysis of this state failed: /, '')}`, fix: 'report it with the component (a bug in the checker, not in the component)', states: 'some states' }); continue; }
    out.push({ file, line: lineOf(source, /\.([\w-]+)/.exec(cleanLabel(d.box))?.[1]), severity: 'info', code: d.code, message: `not checked: ${readable(d.message)}` });
  }
  // States whose CSS errors stopped the layout analysis (no box was laid out): everything else in them is not checked.
  const blocked = result.states.filter(s => (s.report.diagnostics ?? []).some(d => /^E_CSS_/.test(d.code)) && !(s.report.sizes ?? []).length);
  if (blocked.length) out.push({ file, severity: 'info', code: 'U_LAYOUT_NOT_ANALYZED', message: `not checked: the layout of ${blocked.length === total ? 'every state' : `${blocked.length} of ${total} states`} was not analyzed, because the CSS errors above stop the analysis; fix them and lint again` });
  for (const a of result.coverage?.assumptions ?? []) out.push({ file, severity: 'info', code: 'ASSUMPTION', message: a });
  return out.sort((a, b) => ({ error: 0, warning: 1, info: 2 })[a.severity] - ({ error: 0, warning: 1, info: 2 })[b.severity] || (a.line ?? 1e9) - (b.line ?? 1e9));
}

/** Text output: file:line  severity  code  message  (states) and the fix. */
export const formatText = messages => messages.map(m => `${m.file}${m.line ? `:${m.line}` : ''}  ${m.severity.padEnd(7)}  ${m.code}  ${m.message}${m.states && m.states !== 'every state' ? `  [${m.states}]` : ''}${m.fix ? `\n    fix: ${m.fix}` : ''}`).join('\n');
