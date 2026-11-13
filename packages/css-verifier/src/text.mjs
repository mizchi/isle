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

  /** Replace `text` box contracts with the core's derived size contracts. */
  function resolveBoxes(boxes = {}) {
    const out = {};
    for (const [selector, contract] of Object.entries(boxes)) {
      if (!contract?.text) { out[selector] = contract; continue; }
      const {text, ...rest} = contract;
      if (rest.minInlineSize !== undefined || rest.intrinsicBlockSize !== undefined || rest.minBlockSize !== undefined) fail(`${selector}: a text contract derives its own sizes`);
      if (rest.wrap !== undefined && rest.wrap !== 'nowrap') fail(`${selector}: font-derived text is measured on one line; wrapping needs a line-breaking model`);
      const {font} = text;
      const fontContract = {family: font.family, size: font.size, lineHeight: font.lineHeight, ...(font.weight !== undefined ? {weight: font.weight} : {})};
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

  return {measureText, domainBounds, resolveBoxes, resolveOptions: options => ({...options, boxes: resolveBoxes(options.boxes)})};
}

