// Font-derived text contracts (build/debug only).
//
// A box contract `{text: {font, content}}` or `{text: {font, characters,
// maxLength}}` is resolved into the core's size contract: `minInlineSize`
// (a sufficient single-line width), `intrinsicBlockSize` (one line box),
// `wrap: 'nowrap'`, plus `font` and `textMetrics` provenance. The core then
// checks the computed CSS font against `font` and proves the geometry.
//
// Measurement uses an injected shaper (the mizchi/font FFI in `text-node.mjs`,
// or a test double). Widths are shaped advances; the bound adds the browser
// layout rounding allowance described in `layoutAllowance`.

import {languageTag, breakingLanguages, breaksModeled} from './layout/text-font.mjs';
const UNIT = 64; // Chromium LayoutUnit: 1/64 CSS px
const contentLanguages = ['ja', 'zh-Hans', 'zh-Hant', 'ko'];
const fail = message => { throw Object.assign(new Error(message), {code: 'U_LAYOUT_TEXT_METRICS'}); };

/**
 * Shaped advances are snapped up to a 1/64 px LayoutUnit, and float error can
 * add one more unit (observed for integral advances). The returned bound is
 * a multiple of 1/64, so it is exact as a decimal with at most 6 digits.
 */
// A domain prices every character at the widest advance; that slack covers per-run snapping.
const domainAllowance = 'ceil to 1/64 px, then + 1/64 px';
export const layoutAllowance = {unit: 1 / UNIT, rule: 'ceil to 1/64 px, then + (2k − 1)/64 px for k script runs'};
// Shaping returns doubles: drop sub-micro-unit float noise before snapping.
const clean = value => Math.round(value * 1e6) / 1e6;
export const upperBound = width => (Math.ceil(clean(width * UNIT)) + 1) / UNIT;
// Chromium shapes and snaps each script run on its own. Runs follow
// Script_Extensions (ICU scx, as Chromium's ScriptRunIterator): a character
// joins the run while the scripts it can belong to intersect the run's;
// spaces, digits and fullwidth forms belong to any run. Shaping each run on
// its own gives no kerning across runs, as in Chromium, and a string of k runs
// gets k − 1 more units for snapping and k − 1 more for float error.
const cjkPunctuation = /[\u3001-\u3003\u3008-\u3011\u3013-\u301F\u30FB]/u;
function scriptSet(c) {
  if (/[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/u.test(c)) return ['Latn'];
  if (/[\u3400-\u4DBF\u4E00-\u9FFF\u3005\u3007]/u.test(c)) return ['Hani'];
  if (c === '\u30FC') return ['Hira', 'Kana'];
  if (/[\u3041-\u3096\u309D\u309E]/u.test(c)) return ['Hira'];
  if (/[\u30A1-\u30FA\u30FD\u30FE]/u.test(c)) return ['Kana'];
  if (cjkPunctuation.test(c)) return ['Bopo', 'Hang', 'Hani', 'Hira', 'Kana', 'Yiii'];
  return null; // Common without extensions: joins any run
}
export function scriptSegments(text) {
  const segments = [];
  let current = null, piece = '';
  for (const c of text) {
    const set = scriptSet(c);
    if (set && current) {
      const shared = current.filter(script => set.includes(script));
      if (shared.length) current = shared;
      else { segments.push(piece); piece = ''; current = set; }
    } else if (set) current = set;
    piece += c;
  }
  if (piece) segments.push(piece);
  return segments;
}
export const scriptRuns = text => Math.max(scriptSegments(text).length, 1);
export const textBound = (text, width) => width ? (Math.ceil(clean(width * UNIT)) + 2 * scriptRuns(text) - 1) / UNIT : 0;

// Line-breaking classes of the modeled subset, measured in Chromium. Between
// two ASCII characters Chromium uses its own pair table (plus the hyphen-digit
// rule below); otherwise ICU's line breaker. Every ordered pair of the classes
// below, and 100 000 random strings (lang en and ja), were rendered at width 0,
// where every break opportunity becomes a line break, and agree with this
// table. A space always gives a break.
const iterationMarks = new Set([...'々ヽヾゝゞ']), closingBrackets = new Set([...'」』）］】〉》〕']), openings = new Set([...'「『（［【〈《〔']), closings = new Set([...'」』）］】〉》〕、。，．・：；！？〜…‥々ヽヾゝゞ']);
const asciiClasses = [
  ['CP', '!),.:;]}'], ['QU', '"'], ['SYM', '#&*=>~'], ['DOLLAR', '$'], ['PO', '%'], ['APOS', "'"], ['OPA', '([{'], ['PR', '+\\'],
  ['HY', '-'], ['SL', '/'], ['NU', '0123456789'], ['LT', '<'], ['QM', '?'], ['AL', '@ABCDEFGHIJKLMNOPQRSTUVWXYZ^_`abcdefghijklmnopqrstuvwxyz'], ['BAR', '|'],
];
const classNames = [...asciiClasses.map(([name]) => name), 'OP', 'CL', 'ID'];
// breakTable[a][b] === '1': a break opportunity between a character of class a and one of class b.
const breakTable = Object.fromEntries([
  '000000100001000101', '000000100001000000', '000000100001000101', '000000000000000100', '000000100001000101', '000000000000000000',
  '000000000000000000', '000000100001000100', '011011111001011101', '000000000000000101', '000000000000000101', '000000000000000101',
  '001110111011011101', '000000000000000101', '000000100001000101', '000000000000000000', '001110110011010101', '001100110011010101',
].map((row, i) => [classNames[i], Object.fromEntries([...row].map((bit, j) => [classNames[j], bit === '1']))]));
const asciiClass = new Map(asciiClasses.flatMap(([name, members]) => [...members].map(c => [c, name])));
const latin1 = c => /[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/u.test(c);
function lineClass(c) {
  if (c === ' ') return 'SP';
  if (asciiClass.has(c)) return asciiClass.get(c);
  if (latin1(c)) return 'AL';
  if (/[\u3400-\u4DBF\u4E00-\u9FFF\u3041-\u3096\u30A1-\u30FA\u30FC]/u.test(c)) return 'ID';
  if (openings.has(c)) return 'OP';
  if (closings.has(c)) return 'CL';
  return null;
}
const ascii = c => c.charCodeAt(0) < 0x80;
const asciiPunctuation = c => ascii(c) && /[^A-Za-z0-9 ]/.test(c);
// ICU's numeric rule (UAX #14 LB25) makes $ % + \ next to CJK depend on the
// surrounding digits; ICU treats Latin-1 letters next to ASCII punctuation
// differently from the ASCII table. Both are rejected.
function unmodeledPair(x, y) {
  const numeric = c => '$%+\\'.includes(c);
  if ((numeric(x) && !ascii(y) && y !== ' ') || (numeric(y) && !ascii(x) && x !== ' ')) return `${x}${y}: ${numeric(x) ? x : y} next to a non-ASCII character follows ICU's numeric rule`;
  if ((latin1(x) && asciiPunctuation(y)) || (asciiPunctuation(x) && latin1(y))) return `${x}${y}: a Latin-1 letter next to ASCII punctuation follows ICU, not the ASCII table`;
  return null;
}
/** A break opportunity before chars[i] (0 < i). */
function breakBefore(chars, classes, i) {
  const a = classes[i - 1], b = classes[i];
  if (b === 'SP') return false;
  if (a === 'SP') return true;
  // Chromium: '-' then a digit breaks only after an ASCII letter or digit (ABCD-1234, not -1).
  if (chars[i - 1] === '-' && b === 'NU') return i >= 2 && /[A-Za-z0-9]/.test(chars[i - 2]);
  return breakTable[a][b];
}
/**
 * Break opportunities of collapsed text (indices i, a break before character
 * i), or a U_LAYOUT_TEXT_METRICS error for characters and pairs outside the model.
 */
export function breakOpportunities(text) {
  const chars = [...text], classes = chars.map(lineClass);
  const bad = chars.findIndex((c, i) => !classes[i]);
  if (bad >= 0) fail(`Line breaking around U+${chars[bad].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} is not modeled`);
  for (let i = 1; i < chars.length; i++) { const reason = unmodeledPair(chars[i - 1], chars[i]); if (reason) fail(`Line breaking at ${reason}, which is not modeled`); }
  const out = [];
  for (let i = 1; i < chars.length; i++) if (breakBefore(chars, classes, i)) out.push(i);
  return out;
}
const collapse = text => text.replace(/[ \t\n\r\f]+/g, ' ').trim();
const codepoints = text => [...text];

/**
 * @param {{fonts: Record<string, {data: Uint8Array, weight?: number, sha256?: string, file?: string}>,
 *   shaper: {load(data: Uint8Array): number, info(handle: number): object, shape(handle: number, text: string, size: number, axes: object): object}}} input
 */
export function createTextMetrics({fonts, shaper, limits = {}}) {
  const maxCharacters = limits.characters ?? 128, maxLength = limits.maxLength ?? 1024;
  const loaded = new Map();
  for (const [family, entry] of Object.entries(fonts ?? {})) {
    if (!entry?.data) fail(`Font ${family} has no data`);
    const handle = shaper.load(entry.data);
    if (handle < 0) fail(`Font ${family} could not be parsed`);
    loaded.set(family.trim().toLowerCase(), {family, entry, handle, info: shaper.info(handle)});
  }
  const lookup = font => {
    const found = loaded.get(String(font?.family ?? '').trim().toLowerCase());
    if (!found) fail(`No font file is mapped to family ${font?.family}`);
    const weight = font.weight ?? 400, axis = found.info.axes.find(a => a.tag === 'wght');
    if (axis) { if (weight < axis.min || weight > axis.max) fail(`font-weight ${weight} is outside the wght axis ${axis.min}..${axis.max}`); }
    else if (weight !== (found.entry.weight ?? 400)) fail(`font-weight ${weight} would be synthesized; map a font file with that weight`);
    // CSS font-weight selects the wght coordinate of a variable font.
    return {...found, axes: axis ? {wght: weight} : {}};
  };
  const shape = (font, text, language = 'und', ligatures = true) => {
    const {handle, axes} = lookup(font);
    const shaped = shaper.shape(handle, text, font.size, axes, language, ligatures);
    if (shaped.error) fail(`Shaping failed: ${shaped.error}`);
    if (shaped.missing_codepoints.length) fail(`Font ${font.family} lacks ${shaped.missing_codepoints.map(c => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}; fallback fonts are not modeled`);
    if (shaped.runs.some(run => run.direction !== 'ltr')) fail('Only left-to-right text is modeled');
    return shaped.bounds.advance_width;
  };
  // A line's advance: each script run shaped on its own (see scriptSegments).
  const shapeLine = (font, text, language) => scriptSegments(text).reduce((total, segment) => total + shape(font, segment, language), 0);
  // The content language selects locl glyphs (Noto Sans JP's apostrophe and
  // quotes differ under ja). The document language is not modeled, so every
  // listed language is measured: bounds take the widest, line profiles keep
  // only counts on which all languages agree. Languages that shape this text
  // exactly like 'und' (every character and adjacent pair) are skipped.
  // A declared content language (`lang`) is measured alone; the core checks the element's lang attribute.
  const checkLang = lang => { if (lang !== undefined && (typeof lang !== 'string' || !languageTag.test(lang))) fail(`Invalid lang ${JSON.stringify(lang)}: use a BCP 47 tag such as ja or en`); };
  const languagesFor = (font, chars, lang) => lang !== undefined ? [lang] : ['und', ...contentLanguages.filter(language => chars.some((c, i) =>
    shape(font, c, language) !== shape(font, c) || (i && shape(font, chars[i - 1] + c, language) !== shape(font, chars[i - 1] + c))))];
  const provenance = font => {
    const {entry, info} = lookup(font);
    return {family: font.family, size: font.size, weight: font.weight ?? 400, unitsPerEm: info.unitsPerEm,
      ...(entry.file ? {file: entry.file} : {}), ...(entry.sha256 ? {sha256: entry.sha256} : {}), shaper: 'mizchi/font@0.8.0 shape_text (kerning, ligatures)'};
  };

  /** Single-line width of a fixed string after white-space collapsing. */
  function measureText({font, text, lang}) {
    checkLang(lang);
    if (typeof text !== 'string') fail('Text content must be a string');
    const collapsed = collapse(text);
    if (!collapsed) return {text: collapsed, width: 0, bound: 0};
    const width = shapeLine(font, collapsed, lang);
    const bound = Math.max(...languagesFor(font, codepoints(collapsed), lang).map(language => textBound(collapsed, shapeLine(font, collapsed, language))));
    return {text: collapsed, width, bound};
  }

  /**
   * Upper bounds for every string of 1..maxLength characters drawn from
   * `characters` (repetition allowed). Each character is shaped alone and in
   * every ordered pair; contextual effects spanning three or more characters
   * are outside the bound.
   */
  function domainBounds({font, characters, maxLength: length, lang}) {
    checkLang(lang);
    if (!Number.isSafeInteger(length) || length < 1 || length > maxLength) fail(`maxLength must be 1..${maxLength}`);
    const set = [...new Set(codepoints(String(characters ?? '')))];
    if (!set.length || set.length > maxCharacters) fail(`Use 1..${maxCharacters} distinct characters`);
    for (const c of set) if (/[\t\n\r\f\p{M}\p{Cf}\p{Cs}]/u.test(c) || /\p{Extended_Pictographic}/u.test(c)) fail(`Character U+${c.codePointAt(0).toString(16).toUpperCase()} forms clusters or line breaks that are not modeled`);
    const languages = languagesFor(font, set, lang);
    const widestAdvance = text => Math.max(...languages.map(language => shape(font, text, language)));
    const advance = new Map(set.map(c => [c, widestAdvance(c)]));
    let widest = set[0], perCharacter = 0, pairAdjustment = 0;
    for (const [c, a] of advance) if (a > perCharacter) { perCharacter = a; widest = c; }
    for (const x of set) for (const y of set) pairAdjustment = Math.max(pairAdjustment, ...languages.map(language => clean(shape(font, x + y, language) - advance.get(x) - advance.get(y))));
    const bounds = Array.from({length: length + 1}, (_, n) => n === 0 ? 0 : upperBound(n * perCharacter + (n - 1) * pairAdjustment));
    return {characters: set.join(''), maxLength: length, perCharacter, pairAdjustment, widest, bounds};
  }

  /**
   * Line breaking of fixed content under white-space: normal, word-break:
   * normal and line-break: auto, for the classes of `lineClass` (spaces,
   * ASCII, Latin-1 letters, CJK ideographs and kana, fullwidth brackets and
   * punctuation). Other characters are rejected.
   *
   * A line fits when the bound of its shaped text (trailing spaces hang) is at
   * most the available width, the same rule as a single line. Bounds are
   * multiples of 1/64 px, so the greedy result is constant on [k/64,
   * (k+1)/64) and the profile is found by stepping down from the widest line:
   * each greedy run fixes its breaks while the width stays at least its widest
   * fitting line. With the bound wider than the advance, a modeled line count
   * is never smaller than the browser's (a larger first line can only fit
   * when the modeled one does).
   */
  /** spacing: extra px per character (letter-spacing) and per space (word-spacing), e.g. WCAG 1.4.12. */
  function breakLines({font, text, overflowWrap = 'normal', lang, spacing}) {
    checkLang(lang);
    if (lang !== undefined && !breaksModeled(lang)) fail(`lang ${lang}: line breaking is verified for ${[...breakingLanguages].join(', ')}`);
    if (typeof text !== 'string') fail('Text content must be a string');
    if (!['normal', 'anywhere', 'break-word'].includes(overflowWrap)) fail(`overflow-wrap ${overflowWrap} is outside the line-breaking model`);
    const collapsed = collapse(text), chars = codepoints(collapsed);
    if (chars.length > maxLength) fail(`Wrapping text is limited to ${maxLength} characters`);
    const opportunities = breakOpportunities(collapsed);
    const n = chars.length;
    // text-spacing-trim (Chromium's default) halves adjacent fullwidth punctuation
    // through the font's halt feature, which the shaper does not apply.
    const punctuation = c => openings.has(c) || (closings.has(c) && !iterationMarks.has(c));
    const adjacent = chars.findIndex((c, i) => i && punctuation(c) && punctuation(chars[i - 1]));
    if (adjacent > 0) fail(`Adjacent fullwidth punctuation ${chars[adjacent - 1]}${chars[adjacent]} is trimmed by text-spacing-trim, which is not modeled`);
    const ends = [...opportunities, n];
    // Chromium segments script runs over the whole paragraph; a line is a
    // slice of those runs, each part shaped and snapped on its own.
    const run = [];
    scriptSegments(collapsed).forEach((segment, k) => { for (const c of segment) run.push(k); });
    const sliced = (start, end, last = end) => {
      const parts = [];
      for (let i = start; i < last; i++) { if (i === start || run[i] !== run[i - 1]) parts.push(''); parts[parts.length - 1] += chars[i]; }
      return parts;
    };
    const sizes = language => {
      const partsBound = (parts, adjust = 0) => {
        const extra = spacing ? parts.reduce((total, part) => total + [...part].length * spacing.letter + (part.match(/ /g) ?? []).length * spacing.word, 0) : 0;
        // Non-zero letter-spacing disables optional ligatures (CSS Text 3 §8.2), as Chromium does.
        const width = parts.reduce((total, part) => total + shape(font, part, language, !spacing?.letter), 0) - adjust + extra;
        return width > 0 ? (Math.ceil(clean(width * UNIT)) + 2 * parts.length - 1) / UNIT : 0;
      };
      const memo = new Map();
      const bound = (start, end) => {
        const key = start * (n + 1) + end;
        if (!memo.has(key)) {
          let last = end; while (last > start && chars[last - 1] === ' ') last--; // trailing spaces hang
          memo.set(key, last > start ? partsBound(sliced(start, end, last)) : 0);
        }
        return memo.get(key);
      };
      // allow-end (text-spacing-trim): a closing bracket ending a line that does
      // not otherwise fit may be set half-width. Chromium does so for some
      // languages and fonts only, so both outcomes are computed and widths where
      // they disagree get no line count (Unknown). A partial trim lies between.
      const trimmed = (start, end) => {
        let i = end - 1; while (i > start && chars[i] === ' ') i--;
        if (!closingBrackets.has(chars[i])) return bound(start, end);
        const key = -(start * (n + 1) + end) - 1;
        if (!memo.has(key)) memo.set(key, partsBound(sliced(start, i + 1), shape(font, chars[i], language) / 2));
        return memo.get(key);
      };
      return chars.some(c => closingBrackets.has(c)) ? [bound, trimmed] : [bound];
    };
    const variants = languagesFor(font, chars, lang).flatMap(sizes);
    const bound = (start, end) => Math.max(...variants.map(size => size(start, end))); // the widest variant
    const emergency = overflowWrap !== 'normal';
    // Greedy lines at width w: the count, and the widest line that fits (0 if every line is forced).
    const greedy = (w, size, breaks) => {
      let start = 0, count = 0, widest = 0;
      while (start < n) {
        let next = ends.findIndex(e => e > start), best = -1;
        for (let k = next; k < ends.length && size(start, ends[k]) <= w; k++) best = k;
        let end;
        if (best >= 0) { end = ends[best]; widest = Math.max(widest, size(start, end)); }
        else if (emergency) {
          // An unbreakable run that does not fit is broken between characters (at least one per line).
          const limit = ends[next];
          end = start + 1;
          for (let c = start + 1; c <= limit && size(start, c) <= w; c++) end = c;
          if (size(start, end) <= w) widest = Math.max(widest, size(start, end));
          if (chars.slice(end, limit).every(c => c === ' ')) end = limit;
        } else end = ends[next];
        start = end; count++; breaks?.push(end);
      }
      return {count, widest};
    };
    const width = n ? bound(0, n) : 0;
    // Line counts as an ascending step function, keeping the smallest width of each count.
    const sweep = size => {
      const runs = [];
      for (let w = Infinity; ;) {
        const {count, widest} = greedy(w, size);
        runs.push({atLeastInlineSize: widest, lines: count});
        if (widest === 0) break;
        w = widest - 1 / UNIT;
      }
      const steps = [];
      for (const run of runs.reverse()) if (!steps.length || steps.at(-1).lines !== run.lines) steps.push(run);
      steps[0] = {atLeastInlineSize: 0, lines: steps[0].lines};
      return steps;
    };
    const at = (steps, w) => steps.filter(entry => entry.atLeastInlineSize <= w).at(-1).lines;
    // Each variant (language × bracket trim) gives a step function; a width keeps a count only where all agree.
    const sweeps = variants.map(sweep);
    const profile = [];
    for (const w of [...new Set(sweeps.flat().map(entry => entry.atLeastInlineSize))].sort((a, b) => a - b)) {
      const counts = new Set(sweeps.map(steps => at(steps, w))), lines = counts.size === 1 ? [...counts][0] : null;
      if (!profile.length || profile.at(-1).lines !== lines) profile.push({atLeastInlineSize: w, lines});
    }
    // Below one character, a browser keeps clusters such as ligatures whole when
    // it breaks a word: emergency-break profiles start at the widest character
    // (narrower boxes are Unknown). Without emergency breaks every width is modeled.
    const widestCharacter = Math.max(0, ...chars.map((c, i) => bound(i, i + 1)));
    const floor = emergency ? widestCharacter : 0;
    const covered = profile.filter(entry => entry.atLeastInlineSize > floor);
    const atFloor = profile.filter(entry => entry.atLeastInlineSize <= floor).at(-1);
    profile.splice(0, profile.length, {atLeastInlineSize: floor, lines: atFloor.lines}, ...covered.filter((entry, i) => entry.lines !== (i ? covered[i - 1].lines : atFloor.lines)));
    if (profile.length > 256) fail('The line profile has more than 256 steps; shorten the text');
    const pieces = ends.map((e, k) => [k ? ends[k - 1] : 0, e]);
    const minContent = overflowWrap === 'anywhere' ? widestCharacter : Math.max(0, ...pieces.map(([a, b]) => bound(a, b)));
    // Line layouts (break positions) per width interval: greedy breaks stay the same on [widest, w].
    // Only one variant (no language or bracket-trim ambiguity) without emergency breaks has a fixed layout.
    // One list per variant (language × bracket trim); with emergency breaks the layouts start at the widest character.
    const layouts = variants.map(size => {
      const list = [];
      for (let w = Infinity; ;) {
        const breaks = [], {widest} = greedy(w, size, breaks);
        list.push({atLeastInlineSize: widest, below: w, breaks});
        if (widest === 0 || list.length > 512) break;
        w = widest - 1 / UNIT;
      }
      list.reverse(); list[0].atLeastInlineSize = 0;
      return list;
    });
    return {text: collapsed, width, minContent, overflowWrap, profile, layouts, floor, chars};
  }

  /**
   * Bounds of inline elements inside one line of fixed text (nowrap). `inline` maps a selector to
   * its text, which occurs once in the content. Offsets come from the prefix advance shaped alone and
   * as the whole minus the rest (kerning across the boundary lies between), widened by the layout
   * allowance; the vertical extent is the font's content area (hhea, or OS/2 typo with USE_TYPO_METRICS)
   * centred in the line, ±1px for Chromium's rounding of ascent and descent.
   */
  /**
   * Inline pieces in wrapping text: per width interval of a fixed line layout, the piece's line and
   * its bounds within that line (as inlineBounds); a piece split across lines has none there.
   */
  function wrappedInlineBounds({font, text, lang, inline, lines}) {
    const collapsed = lines.text, out = {}, cp = [...collapsed];
    const languages = languagesFor(font, codepoints(collapsed), lang);
    // The width axis split at every variant's layout boundary; each piece holds where every variant keeps the element on one line.
    const cuts = [...new Set([lines.floor, ...lines.layouts.flatMap(list => list.map(l => l.atLeastInlineSize))])].filter(w => w >= lines.floor).sort((a, b) => a - b);
    for (const [selector, piece] of Object.entries(inline ?? {})) {
      const part = collapse(piece), at = collapsed.indexOf(part);
      if (!part || at < 0 || collapsed.indexOf(part, at + 1) >= 0) fail(`${selector}: inline text ${JSON.stringify(piece)} must occur exactly once in the content`);
      const start = [...collapsed.slice(0, at)].length, end = start + [...part].length;
      const place = (layout, language) => {
        const line = layout.breaks.findIndex(e => e > start), from = line ? layout.breaks[line - 1] : 0;
        if (end > layout.breaks[line]) return null;
        let to = layout.breaks[line]; while (to > end && cp[to - 1] === ' ') to--;
        const b = inlineBounds({font, text: cp.slice(from, to).join(''), lang: language, inline: {[selector]: part}}, start - from)[selector];
        const shift = line * font.lineHeight;
        return {line, ...b, top: b.top.map(v => v + shift), bottom: b.bottom.map(v => v + shift)};
      };
      const steps = [];
      cuts.forEach((w, k) => {
        const below = k + 1 < cuts.length ? cuts[k + 1] : null;
        // Variant v (languages × trims in breakLines order) at width w.
        const placed = lines.layouts.map((list, v) => place(list.filter(l => l.atLeastInlineSize <= w).at(-1), languages[Math.floor(v / (lines.layouts.length / languages.length))]));
        const counts = lines.layouts.map(list => list.filter(l => l.atLeastInlineSize <= w).at(-1).breaks.length);
        if (placed.some(p => !p) || new Set(placed.map(p => p.line)).size > 1 || new Set(counts).size > 1) { steps.push({atLeastInlineSize: w, below, split: true}); return; }
        const hull = key => [Math.min(...placed.map(p => p[key][0])), Math.max(...placed.map(p => p[key][1]))];
        steps.push({atLeastInlineSize: w, below, line: placed[0].line, lines: counts[0], start: hull('start'), end: hull('end'), top: hull('top'), bottom: hull('bottom')});
      });
      if (lines.floor > 0) steps.unshift({atLeastInlineSize: 0, below: lines.floor, split: true});
      out[selector] = steps;
    }
    return out;
  }
  function inlineBounds({font, text, lang, inline}, offset) {
    const collapsed = collapse(text), out = {};
    const {info} = lookup(font);
    const typo = info.os2 && (info.os2.fsSelection & 128);
    const ascent = typo ? info.os2.typoAscender : info.ascent, descent = Math.abs(typo ? info.os2.typoDescender : info.descent);
    const area = (ascent + descent) / info.unitsPerEm * font.size, top = (font.lineHeight - area) / 2;
    const width = value => value ? shapeLine(font, value, lang) : 0, slack = 2 * scriptRuns(collapsed) / UNIT;
    for (const [selector, piece] of Object.entries(inline ?? {})) {
      const part = collapse(piece);
      const at = offset !== undefined ? [...collapsed].slice(0, offset).join('').length : collapsed.indexOf(part);
      if (!part || at < 0 || (offset === undefined && collapsed.indexOf(part, at + 1) >= 0) || collapsed.slice(at, at + part.length) !== part) fail(`${selector}: inline text ${JSON.stringify(piece)} must occur exactly once in the content`);
      const before = collapsed.slice(0, at), after = collapsed.slice(at + part.length), whole = width(collapsed);
      const starts = [width(before), whole - width(part + after)], ends = [width(before + part), whole - width(after)];
      out[selector] = {start: [Math.min(...starts) - slack, Math.max(...starts) + slack], end: [Math.min(...ends) - slack, Math.max(...ends) + slack],
        top: [top - 1, top + 1], bottom: [top + area - 1, top + area + 1]};
    }
    return out;
  }

  /** Rounded ascent and descent (px) of the font's content area, as Chromium positions a line's baseline. */
  function baselineMetrics(font) {
    const {info} = lookup(font);
    const typo = info.os2 && (info.os2.fsSelection & 128);
    const ascent = typo ? info.os2.typoAscender : info.ascent, descent = Math.abs(typo ? info.os2.typoDescender : info.descent);
    return {ascent: Math.round(ascent / info.unitsPerEm * font.size), descent: Math.round(descent / info.unitsPerEm * font.size)};
  }

  /** Replace `text` box contracts with the core's derived size contracts. */
  function resolveBoxes(boxes = {}) {
    const out = {};
    for (const [selector, contract] of Object.entries(boxes)) {
      // textRuns: one text contract per anonymous text block of a table cell.
      if (contract?.textRuns) { out[selector] = {...contract, textRuns: contract.textRuns.map((run, k) => resolveBoxes({[`${selector} text ${k}`]: run})[`${selector} text ${k}`])}; continue; }
      if (!contract?.text) { out[selector] = contract; continue; }
      const {text, ...rest} = contract;
      if (rest.minInlineSize !== undefined || rest.intrinsicBlockSize !== undefined || rest.minBlockSize !== undefined) fail(`${selector}: a text contract derives its own sizes`);
      if (rest.wrap !== undefined && !['nowrap', 'normal', 'anywhere'].includes(rest.wrap)) fail(`${selector}: wrap must be nowrap, normal or anywhere`);
      const {font} = text;
      const fontContract = {family: font.family, size: font.size, lineHeight: font.lineHeight, ...(font.weight !== undefined ? {weight: font.weight} : {})};
      if (rest.wrap === 'normal' || rest.wrap === 'anywhere') {
        if (text.content === undefined) fail(`${selector}: wrapping is measured for fixed content; a character domain has no fixed line breaks`);
        const overflowWrap = rest.wrap === 'anywhere' ? 'anywhere' : (text.overflowWrap ?? 'normal');
        if (rest.wrap === 'anywhere' && text.overflowWrap !== undefined && text.overflowWrap !== 'anywhere') fail(`${selector}: wrap anywhere measures overflow-wrap: anywhere`);
        const lines = breakLines({font, text: text.content, overflowWrap, lang: text.lang});
        out[selector] = {...rest, minInlineSize: lines.minContent, intrinsicBlockSize: lines.profile.map(entry => ({atLeastInlineSize: entry.atLeastInlineSize, blockSize: entry.lines === null ? null : entry.lines * font.lineHeight})),
          font: fontContract, textMetrics: {kind: 'lines', text: lines.text, width: lines.width, minContent: lines.minContent, overflowWrap, profile: lines.profile, ...(text.lang !== undefined ? {lang: text.lang} : {}),
            ...(text.inline ? {inline: wrappedInlineBounds({font, text: text.content, lang: text.lang, inline: text.inline, lines})} : {}), baseline: baselineMetrics(font),
            // WCAG 1.4.12 text spacing: the same text with letter-spacing 0.12em and word-spacing 0.16em.
            spacedProfile: breakLines({font, text: text.content, overflowWrap, lang: text.lang, spacing: {letter: 0.12 * font.size, word: 0.16 * font.size}}).profile,
            font: provenance(font), allowance: layoutAllowance.rule}};
        continue;
      }
      let metrics, width;
      if (text.inline !== undefined && text.content === undefined) fail(`${selector}: inline bounds need fixed content`);
      if (text.content !== undefined) {
        const measured = measureText({font, text: text.content, lang: text.lang});
        width = measured.bound;
        metrics = {kind: 'content', text: measured.text, width: measured.width, baseline: baselineMetrics(font), ...(text.inline ? {inline: inlineBounds({font, text: text.content, lang: text.lang, inline: text.inline})} : {})};
      } else {
        const domain = domainBounds({font, characters: text.characters, maxLength: text.maxLength, lang: text.lang});
        width = domain.bounds.at(-1);
        metrics = {kind: 'domain', ...domain};
      }
      out[selector] = {...rest, minInlineSize: width, intrinsicBlockSize: font.lineHeight, wrap: 'nowrap', font: fontContract,
        textMetrics: {...metrics, ...(text.lang !== undefined ? {lang: text.lang} : {}), font: provenance(font), allowance: metrics.kind === 'domain' ? domainAllowance : layoutAllowance.rule}};
    }
    return out;
  }

  return {measureText, domainBounds, breakLines, resolveBoxes, resolveOptions: options => ({...options, boxes: resolveBoxes(options.boxes)})};
}

