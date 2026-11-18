// Font contracts for text boxes whose size bounds were derived from a font
// (see `/text`). The core never measures text: it checks that the computed
// CSS uses exactly the declared font settings, and reports how much of a
// declared text domain fits at a counterexample. Pure and framework-free.
import {q, cmp} from './linear.mjs';
import {fontShorthand} from './css.mjs';

const fontKeys = new Set(['family', 'size', 'lineHeight', 'weight', 'style', 'letterSpacing']);
const metricKeys = new Set(['kind', 'text', 'width', 'characters', 'maxLength', 'perCharacter', 'pairAdjustment', 'bounds', 'widest', 'font', 'allowance', 'minContent', 'overflowWrap', 'profile', 'lang', 'spacedProfile', 'inline', 'baseline', 'lineWidth', 'inlineEdges']);
export const languageTag = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
// Languages whose break opportunities were compared with Chromium (e2e). Chinese differs (e.g. !〜).
// he: Hebrew letters break at spaces only (measured against Chromium with right-to-left text).
export const breakingLanguages = new Set(['en', 'ja', 'ko', 'he']);
export const breaksModeled = lang => breakingLanguages.has(lang.toLowerCase().split('-')[0]) && !/^(?:ja|ko|en)-(?:hans|hant)/i.test(lang);
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function validateFontContract(font) {
  if (!font || typeof font !== 'object' || Object.keys(font).some(key => !fontKeys.has(key))) throw new Error('Invalid font contract');
  if (typeof font.family !== 'string' || !font.family.trim() || font.family.length > 256) throw new Error('Invalid font family');
  if (!finite(font.size, 1, 4096) || !finite(font.lineHeight, 0, 1_000_000) || (font.weight !== undefined && !finite(font.weight, 1, 1000))) throw new Error('Invalid font metrics contract');
  if (font.style !== undefined && font.style !== 'normal') throw new Error('Only normal font-style is modeled');
  if (font.letterSpacing !== undefined && !(typeof font.letterSpacing === 'number' && Number.isFinite(font.letterSpacing) && Math.abs(font.letterSpacing) <= 100)) throw new Error('Invalid font letterSpacing');
}

export function validateTextMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object' || Object.keys(metrics).some(key => !metricKeys.has(key)) || !['content', 'domain', 'lines'].includes(metrics.kind)) throw new Error('Invalid text metrics');
  if (metrics.lang !== undefined && (typeof metrics.lang !== 'string' || !languageTag.test(metrics.lang))) throw new Error('Invalid text metrics lang');
  if (metrics.kind === 'lines') {
    const {profile} = metrics;
    if (!['normal', 'anywhere', 'break-word'].includes(metrics.overflowWrap) || !Array.isArray(profile) || !profile.length || profile.length > 256) throw new Error('Invalid text line profile');
    for (let i = 0; i < profile.length; i++) {
      const entry = profile[i];
      // lines: null marks widths where the count depends on text-spacing-trim (Unknown).
      if (!entry || Object.keys(entry).some(key => !['atLeastInlineSize', 'lines'].includes(key)) || !finite(entry.atLeastInlineSize, 0, 1_000_000) || (entry.lines !== null && (!Number.isSafeInteger(entry.lines) || entry.lines < 1))
        || (i && entry.atLeastInlineSize <= profile[i - 1].atLeastInlineSize)) throw new Error('A text line profile must have increasing widths');
    }
    const known = profile.filter(entry => entry.lines !== null);
    if (profile.at(-1).lines === null || known.some((entry, i) => i && entry.lines >= known[i - 1].lines)) throw new Error('A text line profile must have decreasing line counts and end with a known count');
  }
  if (metrics.baseline !== undefined && (!metrics.baseline || Object.keys(metrics.baseline).some(k => !['ascent', 'descent'].includes(k)) || !['ascent', 'descent'].every(k => Number.isSafeInteger(metrics.baseline[k]) && metrics.baseline[k] >= 0))) throw new Error('Invalid text baseline metrics');
  if (metrics.inlineEdges !== undefined && !(metrics.kind === 'content' && metrics.inline && typeof metrics.inlineEdges === 'object' && Object.entries(metrics.inlineEdges).every(([k, e]) => k in metrics.inline && Array.isArray(e) && e.length === 4 && e.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10_000)))) throw new Error('Invalid inline edges');
  // lineWidth (checklist D3): the width range of the one line of content text, for text-align.
  if (metrics.lineWidth !== undefined && !(metrics.kind === 'content' && Array.isArray(metrics.lineWidth) && metrics.lineWidth.length === 2 && metrics.lineWidth.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1_000_000) && metrics.lineWidth[0] <= metrics.lineWidth[1])) throw new Error('Invalid text line width');
  if (metrics.inline !== undefined) {
    const pair = v => Array.isArray(v) && v.length === 2 && v.every(n => finite(n, -1_000_000, 1_000_000)) && v[0] <= v[1];
    const box = b => b && Object.keys(b).every(k => ['start', 'end', 'top', 'bottom'].includes(k)) && ['start', 'end', 'top', 'bottom'].every(k => pair(b[k]));
    // lines: per width interval [atLeastInlineSize, below) the bounds on one line, or split across lines.
    const step = (b, i, all) => b && finite(b.atLeastInlineSize, 0, 1_000_000) && (b.below === null ? i === all.length - 1 : finite(b.below, b.atLeastInlineSize, 1_000_000) && i < all.length - 1 && all[i + 1].atLeastInlineSize >= b.below - 1e-9)
      && (b.split === true ? Object.keys(b).every(k => ['atLeastInlineSize', 'below', 'split'].includes(k)) : Number.isSafeInteger(b.line) && b.line >= 0 && (b.lines === undefined || (Number.isSafeInteger(b.lines) && b.lines > b.line)) && (b.lineWidth === undefined || pair(b.lineWidth)) && (b.alignBelow === undefined || (b.below !== null && finite(b.alignBelow, b.atLeastInlineSize, b.below))) && box(Object.fromEntries(Object.entries(b).filter(([k]) => !['atLeastInlineSize', 'below', 'line', 'lines', 'lineWidth', 'alignBelow'].includes(k)))));
    if (!['content', 'lines'].includes(metrics.kind) || !metrics.inline || typeof metrics.inline !== 'object' || Array.isArray(metrics.inline) || Object.keys(metrics.inline).length > 32
      || Object.values(metrics.inline).some(b => metrics.kind === 'content' ? !box(b) : !(Array.isArray(b) && b.length && b.length <= 257 && b[0].atLeastInlineSize === 0 && b.every(step)))) throw new Error('Invalid inline bounds');
  }
  if (metrics.kind === 'domain') {
    const {bounds, maxLength} = metrics;
    if (!Number.isSafeInteger(maxLength) || maxLength < 1 || !Array.isArray(bounds) || bounds.length !== maxLength + 1 || bounds[0] !== 0) throw new Error('Invalid text domain bounds');
    for (let i = 1; i < bounds.length; i++) if (!finite(bounds[i], bounds[i - 1], 1_000_000)) throw new Error('Text domain bounds must be finite and non-decreasing');
  }
}

const family = value => value.split(',')[0].trim().replace(/^(['"])(.*)\1$/, '$2').toLowerCase();
const pxValue = value => { const m = /^(\d+(?:\.\d+)?)px$/.exec(value); return m ? Number(m[1]) : undefined; };
const weightValue = value => value === 'normal' ? 400 : value === 'bold' ? 700 : /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : undefined;

/**
 * The computed font of `style` must equal the contract. Returns a reason when
 * the derived metrics cannot apply (the caller reports Unknown), else null.
 */
export function textFontMismatch(style, font, defaultFontSize) {
  for (const key of ['font-family', 'font-size', 'line-height', 'font-weight', 'font-style', 'font-stretch', 'font-variant']) {
    if (style[key] === fontShorthand) return 'The font shorthand is not modeled; use font-family/font-size/line-height/font-weight longhands';
  }
  if (style['font-family'] === 'ua-control') return 'a form control keeps the user-agent control font (Arial, or monospace in a textarea), not the page font; set font: inherit (or font-family) on it';
  if (style['font-family'] === 'ua-default') return 'font-family is the user-agent default; declare the measured family';
  if (family(style['font-family']) !== font.family.trim().toLowerCase()) return `font-family ${style['font-family']} differs from the measured family ${font.family}; fallback fonts are not modeled`;
  // medium: the user's default font size, which the analysis assumes (defaultFontSize).
  const size = pxValue(style['font-size']) ?? (style['font-size'] === 'medium' && defaultFontSize ? defaultFontSize : undefined);
  if (size === undefined) return `font-size ${style['font-size']} must be a px length`;
  if (size !== font.size) return `font-size ${style['font-size']} differs from the measured ${font.size}px`;
  const lineHeight = pxValue(style['line-height']) ?? (/^\d+(?:\.\d+)?$/.test(style['line-height']) ? Number(style['line-height']) * size : undefined);
  if (lineHeight === undefined) return `line-height ${style['line-height']} must be a px length or a number; normal depends on font and platform metrics`;
  if (Math.abs(lineHeight - font.lineHeight) > 1e-9) return `line-height ${style['line-height']} differs from the measured ${font.lineHeight}px`;
  const weight = weightValue(style['font-weight']);
  if (weight === undefined) return `font-weight ${style['font-weight']} must be absolute`;
  if (weight !== (font.weight ?? 400)) return `font-weight ${weight} differs from the measured ${font.weight ?? 400}`;
  if (style['font-style'] !== (font.style ?? 'normal')) return `font-style ${style['font-style']} differs from the measured ${font.style ?? 'normal'}`;
  if (style['font-stretch'] !== 'normal' || style['font-variant'] !== 'normal') return 'font-stretch and font-variant must be normal';
  if (style['text-transform'] !== 'none') return `text-transform ${style['text-transform']} changes the measured characters`;
  if (!['normal', '0', '0px'].includes(style['word-spacing'])) return 'word-spacing must be normal';
  // letter-spacing: the measured spacing (font.letterSpacing, px) must be the computed one.
  const spacing = ['normal', '0', '0px'].includes(style['letter-spacing']) ? 0 : /^-?\d+(?:\.\d{1,6})?px$/.test(style['letter-spacing']) ? Number(style['letter-spacing'].slice(0, -2)) : null;
  if (spacing === null) return `letter-spacing ${style['letter-spacing']} must resolve to px (an em value needs a px font-size)`;
  if (Math.abs(spacing - (font.letterSpacing ?? 0)) > 1e-6) return `letter-spacing ${style['letter-spacing']} differs from the measured ${font.letterSpacing ?? 0}px`;
  return null;
}

/**
 * Text measured for Chromium, laid out by another engine (the ua option): Firefox and WebKit break lines differently
 * (UAX #14, CJK punctuation), keep a closing CJK punctuation mark full width at a line end where Chromium trims it
 * (text-spacing-trim), and shape spacing and right-to-left text differently (measured with tools/css-baseline.mjs and the
 * layout e2e in each browser). Returns a reason (the caller reports Unknown), or null where the shaped advance is the
 * same in every browser (one line of left-to-right text without spacing).
 */
const rightToLeft = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
const cjkPunctuation = /[\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65\u30FB]/u;
export function textBrowserMismatch(engine, style, contract) {
  if (!engine || engine === 'chromium') return null;
  const metrics = contract.textMetrics, text = metrics?.text ?? '';
  const about = `text is modeled as Chromium lays it out; ${engine} differs`;
  if (metrics?.kind === 'lines') return `${about} in line breaking (UAX #14, CJK punctuation), so the line count is not known for ${engine}`;
  if (metrics?.inline) return `${about} in where inline elements fall on the line (inline bounds are measured in Chromium)`;
  if ((contract.font?.letterSpacing ?? 0) !== 0 || (contract.font?.wordSpacing ?? 0) !== 0) return `${about} in letter and word spacing`;
  if (style.direction === 'rtl' || rightToLeft.test(text)) return `${about} in shaping right-to-left text`;
  if (cjkPunctuation.test(text)) return `${about} at CJK punctuation (Chromium trims a closing mark at a line end, text-spacing-trim)`;
  return null;
}

/**
 * A line profile was measured for one white-space/overflow-wrap pair and must
 * be the box's block contract (line count × line height). Returns a reason.
 */
export function textLinesMismatch(style, contract) {
  const metrics = contract.textMetrics;
  if (style['white-space'] !== 'normal') return `white-space ${style['white-space']} differs from the measured normal line breaking`;
  // Unmeasured lang: the element's declared language must use the modeled break rules.
  if (metrics.lang === undefined && style.$lang && style.$lang !== '<dynamic>' && !breaksModeled(style.$lang)) return `lang ${style.$lang}: line breaking is modeled for ${[...breakingLanguages].join(', ')}`;
  if (metrics.lang === undefined && style.$lang === '<dynamic>') return 'lang is dynamic; line breaking depends on the language';
  if (style['overflow-wrap'] !== metrics.overflowWrap) return `overflow-wrap ${style['overflow-wrap']} differs from the measured ${metrics.overflowWrap}`;
  const heights = contract.intrinsicBlockSize;
  if (!Array.isArray(heights) || heights.length !== metrics.profile.length || heights.some((entry, i) => entry.atLeastInlineSize !== metrics.profile[i].atLeastInlineSize || (metrics.profile[i].lines === null ? entry.blockSize !== null : entry.blockSize === null || Math.abs(entry.blockSize - metrics.profile[i].lines * contract.font.lineHeight) > 1e-9))) return 'intrinsicBlockSize must be the line profile times the line height';
  return null;
}

/**
 * Metrics measured for one content language apply where the element's
 * language (the inherited lang attribute) is that tag, compared without case.
 */
export function textLangMismatch(lang, measured) {
  if (measured === undefined) return null;
  if (lang === '<dynamic>') return `lang is dynamic; the text was measured for ${measured}`;
  if (!lang) return `lang is not declared on the element or an ancestor; the text was measured for ${measured}`;
  return lang.toLowerCase() === measured.toLowerCase() ? null : `lang ${lang} differs from the measured ${measured}`;
}

/** Line boxes of `lineHeight` that fit `offered` (an exact rational), at most `limit`. */
export function fittingLines(lineHeight, offered, limit) {
  let n = 0;
  while (n < limit && cmp(q(lineHeight * (n + 1)), offered) <= 0) n++;
  return n;
}

/** Largest domain length whose bound fits `offered` (an exact rational). */
export function fittingLength(metrics, offered) {
  let n = 0;
  for (let i = 1; i < metrics.bounds.length; i++) if (cmp(q(metrics.bounds[i]), offered) <= 0) n = i;
  return n;
}
