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

const UNIT = 64; // Chromium LayoutUnit: 1/64 CSS px
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

// Line-breaking classes of the modeled subset (null: not modeled). The rules
// were checked against Chromium on every ordered pair and across a space:
// a space always gives a break; fullwidth opening brackets (OP) never end a
// line; fullwidth closing marks, 、。，．・：；！？〜…‥ and iteration marks
// (CL) never start one; ideographs and kana, small kana and ー included (ID),
// break on both sides; Latin letters and digits (AL/NU) only break next to
// ID, OP (before) or CL (after). ASCII punctuation follows context rules
// (numbers, quotes, prefixes) that are not modeled.
const iterationMarks = new Set([...'々ヽヾゝゞ']), closingBrackets = new Set([...'」』）］】〉》〕']), openings = new Set([...'「『（［【〈《〔']), closings = new Set([...'」』）］】〉》〕、。，．・：；！？〜…‥々ヽヾゝゞ']);
function lineClass(c) {
  if (c === ' ') return 'SP';
  if (/[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/u.test(c)) return 'AL';
  if (/[0-9]/.test(c)) return 'NU';
  if (/[\u3400-\u4DBF\u4E00-\u9FFF\u3041-\u3096\u30A1-\u30FA\u30FC]/u.test(c)) return 'ID';
  if (openings.has(c)) return 'OP';
  if (closings.has(c)) return 'CL';
  return null;
}
function breakBefore(a, b) {
  if (b === 'SP') return false;
  if (a === 'SP') return true;
  if (b === 'CL' || a === 'OP') return false;
  return a === 'ID' || b === 'ID' || b === 'OP' || a === 'CL';
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
  const shape = (font, text) => {
    const {handle, axes} = lookup(font);
    const shaped = shaper.shape(handle, text, font.size, axes);
    if (shaped.error) fail(`Shaping failed: ${shaped.error}`);
    if (shaped.missing_codepoints.length) fail(`Font ${font.family} lacks ${shaped.missing_codepoints.map(c => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}; fallback fonts are not modeled`);
    if (shaped.runs.some(run => run.direction !== 'ltr')) fail('Only left-to-right text is modeled');
    return shaped.bounds.advance_width;
  };
  // A line's advance: each script run shaped on its own (see scriptSegments).
  const shapeLine = (font, text) => scriptSegments(text).reduce((total, segment) => total + shape(font, segment), 0);
  const provenance = font => {
    const {entry, info} = lookup(font);
    return {family: font.family, size: font.size, weight: font.weight ?? 400, unitsPerEm: info.unitsPerEm,
      ...(entry.file ? {file: entry.file} : {}), ...(entry.sha256 ? {sha256: entry.sha256} : {}), shaper: 'mizchi/font@0.8.0 shape_text (kerning, ligatures)'};
  };

  /** Single-line width of a fixed string after white-space collapsing. */
  function measureText({font, text}) {
    if (typeof text !== 'string') fail('Text content must be a string');
    const collapsed = collapse(text);
    if (!collapsed) return {text: collapsed, width: 0, bound: 0};
    const width = shapeLine(font, collapsed);
    return {text: collapsed, width, bound: textBound(collapsed, width)};
  }

  /**
   * Upper bounds for every string of 1..maxLength characters drawn from
   * `characters` (repetition allowed). Each character is shaped alone and in
   * every ordered pair; contextual effects spanning three or more characters
   * are outside the bound.
   */
  function domainBounds({font, characters, maxLength: length}) {
    if (!Number.isSafeInteger(length) || length < 1 || length > maxLength) fail(`maxLength must be 1..${maxLength}`);
    const set = [...new Set(codepoints(String(characters ?? '')))];
    if (!set.length || set.length > maxCharacters) fail(`Use 1..${maxCharacters} distinct characters`);
    for (const c of set) if (/[\t\n\r\f\p{M}\p{Cf}\p{Cs}]/u.test(c) || /\p{Extended_Pictographic}/u.test(c)) fail(`Character U+${c.codePointAt(0).toString(16).toUpperCase()} forms clusters or line breaks that are not modeled`);
    const advance = new Map(set.map(c => [c, shape(font, c)]));
    let widest = set[0], perCharacter = 0, pairAdjustment = 0;
    for (const [c, a] of advance) if (a > perCharacter) { perCharacter = a; widest = c; }
    for (const x of set) for (const y of set) pairAdjustment = Math.max(pairAdjustment, clean(shape(font, x + y) - advance.get(x) - advance.get(y)));
    const bounds = Array.from({length: length + 1}, (_, n) => n === 0 ? 0 : upperBound(n * perCharacter + (n - 1) * pairAdjustment));
    return {characters: set.join(''), maxLength: length, perCharacter, pairAdjustment, widest, bounds};
  }

  /**
   * Line breaking of fixed content under white-space: normal, word-break:
   * normal and line-break: auto, for the classes of `lineClass` (spaces,
   * Latin letters and digits, CJK ideographs and kana, fullwidth brackets and
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
  function breakLines({font, text, overflowWrap = 'normal'}) {
    if (typeof text !== 'string') fail('Text content must be a string');
    if (!['normal', 'anywhere', 'break-word'].includes(overflowWrap)) fail(`overflow-wrap ${overflowWrap} is outside the line-breaking model`);
    const collapsed = collapse(text), chars = codepoints(collapsed);
    if (chars.length > maxLength) fail(`Wrapping text is limited to ${maxLength} characters`);
    const classes = chars.map(lineClass);
    const bad = chars.findIndex((c, i) => !classes[i]);
    if (bad >= 0) fail(`Line breaking around U+${chars[bad].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} is not modeled`);
    const n = chars.length;
    // text-spacing-trim (Chromium's default) halves adjacent fullwidth punctuation
    // through the font's halt feature, which the shaper does not apply.
    const punctuation = c => openings.has(c) || (closings.has(c) && !iterationMarks.has(c));
    const adjacent = chars.findIndex((c, i) => i && punctuation(c) && punctuation(chars[i - 1]));
    if (adjacent > 0) fail(`Adjacent fullwidth punctuation ${chars[adjacent - 1]}${chars[adjacent]} is trimmed by text-spacing-trim, which is not modeled`);
    // Break opportunities: before character i (0 < i < n).
    const opportunity = i => breakBefore(classes[i - 1], classes[i]);
    const ends = [];
    for (let i = 1; i < n; i++) if (opportunity(i)) ends.push(i);
    ends.push(n);
    const memo = new Map();
    const bound = (start, end) => {
      const key = start * (n + 1) + end;
      if (!memo.has(key)) { const line = chars.slice(start, end).join('').trimEnd(); memo.set(key, line ? textBound(line, shapeLine(font, line)) : 0); }
      return memo.get(key);
    };
    const emergency = overflowWrap !== 'normal';
    // Greedy lines at width w: the count, and the widest line that fits (0 if every line is forced).
    // allow-end (text-spacing-trim): a closing bracket ending a line that does
    // not otherwise fit may be set half-width. Chromium does so for some
    // languages and fonts only, so both outcomes are computed and widths where
    // they disagree get no line count (Unknown). A partial trim lies between.
    const lastChar = (start, end) => { let i = end - 1; while (i > start && chars[i] === ' ') i--; return i; };
    const trimmedBound = (start, end) => {
      const plain = bound(start, end), i = lastChar(start, end);
      if (!closingBrackets.has(chars[i])) return plain;
      const key = -(start * (n + 1) + end) - 1;
      if (!memo.has(key)) { const line = chars.slice(start, i + 1).join(''); memo.set(key, textBound(line, shapeLine(font, line) - shape(font, chars[i]) / 2)); }
      return memo.get(key);
    };
    // Greedy lines at width w: the count, and the widest line that fits (0 if every line is forced).
    const greedy = (w, size) => {
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
        start = end; count++;
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
    const plain = sweep(bound), trimmed = chars.some(c => closingBrackets.has(c)) ? sweep(trimmedBound) : plain;
    const profile = [];
    for (const w of [...new Set([...plain, ...trimmed].map(entry => entry.atLeastInlineSize))].sort((a, b) => a - b)) {
      const a = at(plain, w), b = at(trimmed, w), lines = a === b ? a : null;
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
    return {text: collapsed, width, minContent, overflowWrap, profile};
  }

  /** Replace `text` box contracts with the core's derived size contracts. */
  function resolveBoxes(boxes = {}) {
    const out = {};
    for (const [selector, contract] of Object.entries(boxes)) {
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
        const lines = breakLines({font, text: text.content, overflowWrap});
        out[selector] = {...rest, minInlineSize: lines.minContent, intrinsicBlockSize: lines.profile.map(entry => ({atLeastInlineSize: entry.atLeastInlineSize, blockSize: entry.lines === null ? null : entry.lines * font.lineHeight})),
          font: fontContract, textMetrics: {kind: 'lines', text: lines.text, width: lines.width, minContent: lines.minContent, overflowWrap, profile: lines.profile, font: provenance(font), allowance: layoutAllowance.rule}};
        continue;
      }
      let metrics, width;
      if (text.content !== undefined) {
        const measured = measureText({font, text: text.content});
        width = measured.bound;
        metrics = {kind: 'content', text: measured.text, width: measured.width};
      } else {
        const domain = domainBounds({font, characters: text.characters, maxLength: text.maxLength});
        width = domain.bounds.at(-1);
        metrics = {kind: 'domain', ...domain};
      }
      out[selector] = {...rest, minInlineSize: width, intrinsicBlockSize: font.lineHeight, wrap: 'nowrap', font: fontContract,
        textMetrics: {...metrics, font: provenance(font), allowance: metrics.kind === 'domain' ? domainAllowance : layoutAllowance.rule}};
    }
    return out;
  }

  return {measureText, domainBounds, breakLines, resolveBoxes, resolveOptions: options => ({...options, boxes: resolveBoxes(options.boxes)})};
}

