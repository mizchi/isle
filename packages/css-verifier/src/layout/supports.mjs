// @supports conditions (CSS Conditional 3 §6), decided only where the answer is known for every target browser:
// a declaration or selector in the tables below is supported (checked against CSS.supports in Chromium, Firefox and
// WebKit: e2e/layout-supports.spec.mjs). Anything else — an unknown feature, a value outside the table, a malformed
// condition — is undefined, so the rules it guards stay Unknown rather than being guessed.
//
//   supportsCondition('(display: grid) and (gap: 1rem)') → true
//   supportsCondition('not (display: grid)')             → false
//   supportsCondition('(foo: bar)')                      → undefined

const length = /^(?:0|-?\d*\.?\d+(?:px|rem|em|%|vw|vh|ch|svw|lvw|dvw|svh|lvh|dvh|cqi|cqb|cqw|cqh))$/;
// A length, auto, or a math function in the shapes checked against the browsers: min(a, b), max(a, b), clamp(a, b, c)
// of lengths, and calc(a + b) / calc(a - b) with spaces around the operator. Anything looser is not decided.
const L = '(?:0|-?\\d*\\.?\\d+(?:px|rem|em|%|vw|vh|ch|svw|lvw|dvw|svh|lvh|dvh|cqi|cqb|cqw|cqh))';
const math = new RegExp(`^(?:(?:min|max)\\(${L}, ${L}\\)|clamp\\(${L}, ${L}, ${L}\\)|calc\\(${L} [-+] ${L}\\))$`);
const sizeLike = v => v === 'auto' || length.test(v) || math.test(v);
// Named colours: a selection (an unlisted name is not decided); colour functions with numeric arguments only.
const named = new Set(['transparent', 'currentcolor', 'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'gray', 'grey', 'silver', 'navy', 'teal', 'maroon', 'olive', 'lime', 'aqua', 'fuchsia', 'pink', 'brown', 'gold', 'indigo', 'violet', 'crimson', 'tomato', 'coral', 'salmon', 'khaki', 'beige', 'ivory', 'lavender', 'tan', 'plum', 'orchid', 'cyan', 'magenta', 'rebeccapurple']);
const N = '-?\\d*\\.?\\d+%?';
const colourFn = new RegExp(`^(?:rgba?\\(${N}(?:,? ${N}){2}(?: / ${N}|, ${N})?\\)|hsla?\\(${N}(?:deg)?(?:,? ${N}){2}(?: / ${N}|, ${N})?\\)|(?:oklch|oklab|lab|lch)\\(${N}(?: ${N}){2}(?: / ${N})?\\))$`);
const colour = v => /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v) || named.has(v) || colourFn.test(v)
  || (/^color-mix\(in (?:srgb|oklch|oklab|hsl|lab|lch|srgb-linear|display-p3), ([^,()]+|[a-z]+\([^)]*\)), ([^,()]+|[a-z]+\([^)]*\))\)$/.test(v) && (() => { const [, a, b] = /, (.+), (.+)\)$/.exec(v); return [a, b].every(c => colour(c.replace(/ \d+%$/, ''))); })());
const lengths = (v, n) => { const parts = v.split(' '); return parts.length <= n && parts.every(sizeLike); };
// property → the values (a test on the trimmed, lowercased value) every target browser supports.
export const supportedDeclarations = {
  display: v => ['grid', 'inline-grid', 'flex', 'inline-flex', 'contents', 'flow-root', 'block', 'inline-block', 'none', 'inline flex', 'inline grid', 'block flex', 'block grid', 'block flow', 'inline flow-root'].includes(v),
  gap: v => lengths(v, 2), 'row-gap': v => length.test(v), 'column-gap': v => length.test(v),
  'aspect-ratio': v => /^(?:auto )?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/.test(v),
  position: v => ['sticky', 'relative', 'absolute', 'fixed'].includes(v),
  inset: v => lengths(v, 4),
  'object-fit': v => ['cover', 'contain', 'fill', 'none', 'scale-down'].includes(v),
  'container-type': v => ['inline-size', 'size', 'normal'].includes(v),
  overflow: v => ['clip', 'hidden', 'auto', 'scroll', 'visible'].includes(v),
  width: v => ['fit-content', 'min-content', 'max-content'].includes(v) || sizeLike(v),
  height: v => sizeLike(v),
  'grid-template-columns': v => v === 'subgrid',
  'grid-template-rows': v => v === 'subgrid',
  translate: v => /^(?:-?\d*\.?\d+px)(?:\s+-?\d*\.?\d+px)?$/.test(v),
  'text-wrap': v => ['balance', 'wrap', 'nowrap'].includes(v),
  'accent-color': v => v === 'auto' || colour(v),
  // Checklist C1: more features, each checked against CSS.supports in Chromium, Firefox and WebKit (the Playwright
  // builds; an older browser may lack some).
  color: v => colour(v),
  'inset-inline': v => lengths(v, 2), 'inset-block': v => lengths(v, 2), 'margin-inline': v => lengths(v, 2), 'margin-block': v => lengths(v, 2),
  'padding-inline': v => lengths(v, 2), 'padding-block': v => lengths(v, 2), 'border-radius': v => lengths(v, 4),
  contain: v => ['none', 'strict', 'content'].includes(v) || (() => { const p = v.split(' '); return p.every(k => ['size', 'inline-size', 'layout', 'style', 'paint'].includes(k)) && new Set(p).size === p.length && !(p.includes('size') && p.includes('inline-size')); })(),
  'overscroll-behavior': v => /^(?:auto|contain|none)(?: (?:auto|contain|none))?$/.test(v),
  'scroll-snap-type': v => /^(?:none|(?:x|y|block|inline|both)(?: (?:mandatory|proximity))?)$/.test(v),
  'scrollbar-gutter': v => ['auto', 'stable', 'stable both-edges'].includes(v), 'scrollbar-width': v => ['auto', 'thin', 'none'].includes(v),
  'backdrop-filter': v => v === 'none' || /^(?:(?:blur\((?:0|\d*\.?\d+px)\)|(?:brightness|contrast|grayscale|saturate|sepia|invert|opacity)\(\d*\.?\d+%?\)|hue-rotate\(-?\d*\.?\d+deg\))(?: |$))+$/.test(v),
  rotate: v => /^-?\d*\.?\d+(?:deg|turn|rad|grad)$/.test(v), scale: v => /^\d*\.?\d+(?: \d*\.?\d+){0,2}$/.test(v),
  'font-size': v => sizeLike(v), 'max-width': v => sizeLike(v), 'min-width': v => sizeLike(v), 'max-height': v => sizeLike(v), 'min-height': v => sizeLike(v),
  'color-scheme': v => ['normal', 'light', 'dark', 'light dark', 'dark light', 'only light', 'only dark'].includes(v),
  'field-sizing': v => ['content', 'fixed'].includes(v), 'font-size-adjust': v => v === 'none' || /^\d*\.?\d+$/.test(v),
  hyphens: v => ['none', 'manual', 'auto'].includes(v), 'place-items': v => /^(?:center|start|end|stretch|baseline)(?: (?:center|start|end|stretch|baseline))?$/.test(v),
  'text-underline-offset': v => v === 'auto' || length.test(v), '-webkit-line-clamp': v => v === 'none' || /^\d+$/.test(v),
  appearance: v => ['none', 'auto'].includes(v), 'touch-action': v => ['auto', 'none', 'manipulation', 'pan-x', 'pan-y', 'pinch-zoom', 'pan-x pan-y', 'pan-x pinch-zoom', 'pan-y pinch-zoom', 'pan-x pan-y pinch-zoom'].includes(v),
  'content-visibility': v => ['visible', 'auto', 'hidden'].includes(v),
  transform: v => v === 'none' || (() => {
    const fns = v.match(/[a-z0-9]+\([^)]*\)/g) ?? [];
    if (!fns.length || v.replace(/[a-z0-9]+\([^)]*\)/g, '').trim()) return false;
    const names = new Set(['translate', 'translatex', 'translatey', 'translatez', 'translate3d', 'scale', 'scalex', 'scaley', 'scalez', 'scale3d', 'rotate', 'rotatex', 'rotatey', 'rotatez', 'skew', 'skewx', 'skewy']);
    // Each function's arguments by kind (found by the fuzz test: rotate(45) without a unit is not a transform).
    const lengthArg = a => /^(?:0|-?\d*\.?\d+(?:px|%|em|rem))$/.test(a), numberArg = a => /^-?\d*\.?\d+$/.test(a), angleArg = a => /^(?:0|-?\d*\.?\d+(?:deg|turn|rad|grad))$/.test(a);
    const kinds = { translate: [lengthArg, 2], translatex: [lengthArg, 1], translatey: [lengthArg, 1], translatez: [a => /^(?:0|-?\d*\.?\d+(?:px|em|rem))$/.test(a), 1], translate3d: [null, 3], scale: [numberArg, 2], scalex: [numberArg, 1], scaley: [numberArg, 1], scalez: [numberArg, 1], scale3d: [numberArg, 3], rotate: [angleArg, 1], rotatex: [angleArg, 1], rotatey: [angleArg, 1], rotatez: [angleArg, 1], skew: [angleArg, 2], skewx: [angleArg, 1], skewy: [angleArg, 1] };
    return fns.every(f => {
      const [, n, list] = /^([a-z0-9]+)\((.*)\)$/.exec(f), args = list.split(',').map(a => a.trim());
      if (!names.has(n)) return false;
      const [check, most] = kinds[n];
      if (n === 'translate3d') return args.length === 3 && lengthArg(args[0]) && lengthArg(args[1]) && /^(?:0|-?\d*\.?\d+(?:px|em|rem))$/.test(args[2]);
      return args.length >= 1 && args.length <= most && (n !== 'scale3d' || args.length === 3) && args.every(check);
    });
  })(),
  'view-transition-name': v => /^(?:none|[a-z_][\w-]*)$/.test(v), 'anchor-name': v => /^(?:none|--[\w-]+)$/.test(v),
  isolation: v => ['auto', 'isolate'].includes(v), 'mix-blend-mode': v => ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'exclusion'].includes(v),
  'object-position': v => { const p = v.split(' '), x = ['left', 'right'], y = ['top', 'bottom'], any = k => k === 'center' || /^(?:0|\d*\.?\d+(?:%|px))$/.test(k);
    return (p.length === 1 && (any(p[0]) || x.includes(p[0]) || y.includes(p[0]))) || (p.length === 2 && (((x.includes(p[0]) || any(p[0])) && (y.includes(p[1]) || any(p[1]))) || (y.includes(p[0]) && (x.includes(p[1]) || p[1] === 'center')))); },
};
// Declarations no target browser supports (CSS.supports is false in all three): a condition on them is false.
export const unsupportedDeclarations = { 'grid-template-rows': v => v === 'masonry', 'grid-template-columns': v => v === 'masonry', 'line-clamp': v => /^\d+$/.test(v) };
// selector() arguments every target browser supports.
export const supportedSelectors = [':has(a)', ':focus-visible', ':is(a)', ':where(a)', ':not(a, b)', ':focus-within', '::backdrop', ':user-invalid'];
// The pseudo-classes and pseudo-elements every target browser supports (checklist C1): a selector() made of them and of
// simple selectors and combinators is supported.
const knownPseudo = new Set(['has', 'is', 'where', 'not', 'focus-visible', 'focus-within', 'focus', 'hover', 'active', 'user-valid', 'user-invalid', 'nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type', 'first-child', 'last-child', 'only-child', 'first-of-type', 'last-of-type', 'empty', 'checked', 'disabled', 'enabled', 'placeholder-shown', 'popover-open', 'modal', 'dir', 'lang', 'root', 'target', 'link', 'visited', 'any-link', 'required', 'optional', 'read-only', 'read-write', 'default', 'indeterminate', 'valid', 'invalid', 'before', 'after', 'marker', 'backdrop', 'placeholder', 'file-selector-button', 'selection', 'first-line', 'first-letter']);
const selectorSupported = arg => {
  if (supportedSelectors.includes(arg) || arg === '&') return true;
  const names = [...arg.matchAll(/::?([a-z-]+)/g)].map(m => m[1]);
  // Only simple selectors, combinators, nth arguments and the known pseudo names.
  const rest = arg.replace(/::?[a-z-]+/g, '').replace(/[\s>+~(),*.#\[\]="'\w-]/g, '');
  return names.length > 0 && !rest && names.every(n => knownPseudo.has(n)) ? true : undefined;
};

// The condition's text → true, false or undefined (not decided).
export function supportsCondition(text) {
  let i = 0;
  const s = String(text).trim();
  const ws = () => { while (/\s/.test(s[i] ?? '')) i++; };
  const fail = () => { throw new Error('undecided'); };
  // The text inside the parentheses that start at i (i is just past '('); leaves i past the matching ')'.
  const group = () => { const start = i; let depth = 1; while (i < s.length && depth) { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; i++; } if (depth) fail(); return s.slice(start, i - 1); };
  const word = w => { ws(); if (s.slice(i, i + w.length).toLowerCase() === w && !/[a-z0-9-]/i.test(s[i + w.length] ?? '') && /[\s(]/.test(s[i + w.length] ?? '(')) { i += w.length; return true; } return false; };
  const inParens = () => {
    ws();
    if (s.slice(i, i + 9).toLowerCase() === 'selector(') { i += 9; const arg = group().trim().toLowerCase().replace(/\s+/g, ' '); return selectorSupported(arg); }
    if (s[i] !== '(') fail();
    i++;
    const inner = group().trim();
    // A nested condition, or a declaration.
    if (/^\s*(?:not\b|\(|selector\()/i.test(inner)) return supportsCondition(inner);
    const m = /^([a-z-]+)\s*:\s*(.+)$/is.exec(inner);
    if (!m) return undefined;
    const property = m[1].toLowerCase(), v = m[2].trim().toLowerCase().replace(/\s+/g, ' ');
    if (unsupportedDeclarations[property]?.(v)) return false;
    const test = supportedDeclarations[property];
    return test && test(v) ? true : undefined;
  };
  try {
    ws();
    let result;
    if (word('not')) { const v = inParens(); result = v === undefined ? undefined : !v; }
    else {
      result = inParens();
      let op = null;
      for (;;) {
        ws(); if (i >= s.length) break;
        const next = word('and') ? 'and' : word('or') ? 'or' : fail();
        if (op && op !== next) fail();
        op = next;
        const v = inParens();
        // Three-valued: and is false if either is false, true if both are true; or is true if either is true.
        result = op === 'and' ? (result === false || v === false ? false : result && v ? true : undefined)
          : (result === true || v === true ? true : result === false && v === false ? false : undefined);
      }
    }
    ws();
    if (i < s.length) fail();
    return result;
  } catch { return undefined; }
}
