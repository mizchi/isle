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
export const layoutAllowance = {unit: 1 / UNIT, rule: 'ceil to 1/64 px, then + 1/64 px'};
// Shaping returns doubles: drop sub-micro-unit float noise before snapping.
const clean = value => Math.round(value * 1e6) / 1e6;
export const upperBound = width => (Math.ceil(clean(width * UNIT)) + 1) / UNIT;

// UAX #14 classes of the modeled subset (null: not modeled).
const smallKana = /[ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ]/u;
function lineClass(c) {
  if (c === ' ') return 'SP';
  if (/[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/u.test(c)) return 'AL';
  if (/[0-9]/.test(c)) return 'NU';
  if (/[\u3400-\u4DBF\u4E00-\u9FFF]/u.test(c) || (/[\u3041-\u3096\u30A1-\u30FA]/u.test(c) && !smallKana.test(c))) return 'ID';
  if (c === '。' || c === '、') return 'CL';
  return null;
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
    const width = shape(font, collapsed);
    return {text: collapsed, width, bound: upperBound(width)};
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
   * normal and line-break: auto, for a UAX #14 subset: spaces (SP), Latin
   * letters (AL), digits (NU), CJK ideographs and non-small kana (ID), and
   * 。、 (CL, never at a line start). Other characters are rejected.
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
    // Break opportunities: before character i (0 < i < n).
    const opportunity = i => classes[i] !== 'SP' && classes[i] !== 'CL' && (classes[i - 1] === 'SP' || !(['AL', 'NU'].includes(classes[i - 1]) && ['AL', 'NU'].includes(classes[i])));
    const ends = [];
    for (let i = 1; i < n; i++) if (opportunity(i)) ends.push(i);
    ends.push(n);
    const memo = new Map();
    const bound = (start, end) => {
      const key = start * (n + 1) + end;
      if (!memo.has(key)) { const line = chars.slice(start, end).join('').trimEnd(); memo.set(key, line ? upperBound(shape(font, line)) : 0); }
      return memo.get(key);
    };
    const emergency = overflowWrap !== 'normal';
    // Greedy lines at width w: the count, and the widest line that fits (0 if every line is forced).
    const greedy = w => {
      let start = 0, count = 0, widest = 0;
      while (start < n) {
        let next = ends.findIndex(e => e > start), best = -1;
        for (let k = next; k < ends.length && bound(start, ends[k]) <= w; k++) best = k;
        let end;
        if (best >= 0) { end = ends[best]; widest = Math.max(widest, bound(start, end)); }
        else if (emergency) {
          // An unbreakable run that does not fit is broken between characters (at least one per line).
          const limit = ends[next];
          end = start + 1;
          for (let c = start + 1; c <= limit && bound(start, c) <= w; c++) end = c;
          if (bound(start, end) <= w) widest = Math.max(widest, bound(start, end));
          if (chars.slice(end, limit).every(c => c === ' ')) end = limit;
        } else end = ends[next];
        start = end; count++;
      }
      return {count, widest};
    };
    const width = n ? bound(0, n) : 0;
    const runs = [];
    for (let w = Infinity; ;) {
      const {count, widest} = greedy(w);
      runs.push({atLeastInlineSize: widest, lines: count});
      if (widest === 0) break;
      w = widest - 1 / UNIT;
    }
    // Ascending widths; keep the smallest width of each line count.
    const profile = [];
    for (const run of runs.reverse()) if (!profile.length || profile.at(-1).lines !== run.lines) profile.push(run);
    // Below one character, a browser keeps clusters such as ligatures whole when
    // it breaks a word: emergency-break profiles start at the widest character
    // (narrower boxes are Unknown). Without emergency breaks every width is modeled.
    const widestCharacter = Math.max(0, ...chars.map((c, i) => bound(i, i + 1)));
    const floor = emergency ? widestCharacter : 0;
    const covered = profile.filter(entry => entry.atLeastInlineSize > floor);
    const atFloor = profile.filter(entry => entry.atLeastInlineSize <= floor).at(-1);
    profile.splice(0, profile.length, {atLeastInlineSize: floor, lines: atFloor.lines}, ...covered);
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
        out[selector] = {...rest, minInlineSize: lines.minContent, intrinsicBlockSize: lines.profile.map(entry => ({atLeastInlineSize: entry.atLeastInlineSize, blockSize: entry.lines * font.lineHeight})),
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
        textMetrics: {...metrics, font: provenance(font), allowance: layoutAllowance.rule}};
    }
    return out;
  }

  return {measureText, domainBounds, breakLines, resolveBoxes, resolveOptions: options => ({...options, boxes: resolveBoxes(options.boxes)})};
}

