// @supports conditions (CSS Conditional 3 §6), decided only where the answer is known for every target browser:
// a declaration or selector in the tables below is supported (checked against CSS.supports in Chromium, Firefox and
// WebKit: e2e/layout-supports.spec.mjs). Anything else — an unknown feature, a value outside the table, a malformed
// condition — is undefined, so the rules it guards stay Unknown rather than being guessed.
//
//   supportsCondition('(display: grid) and (gap: 1rem)') → true
//   supportsCondition('not (display: grid)')             → false
//   supportsCondition('(foo: bar)')                      → undefined

const length = /^(?:0|-?\d*\.?\d+(?:px|rem|em|%|vw|vh|ch))$/;
// property → the values (a test on the trimmed, lowercased value) every target browser supports.
export const supportedDeclarations = {
  display: v => ['grid', 'inline-grid', 'flex', 'inline-flex', 'contents', 'flow-root', 'block', 'inline-block', 'none'].includes(v),
  gap: v => length.test(v), 'row-gap': v => length.test(v), 'column-gap': v => length.test(v),
  'aspect-ratio': v => /^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/.test(v),
  position: v => ['sticky', 'relative', 'absolute', 'fixed'].includes(v),
  inset: v => length.test(v),
  'object-fit': v => ['cover', 'contain', 'fill', 'none', 'scale-down'].includes(v),
  'container-type': v => ['inline-size', 'size', 'normal'].includes(v),
  overflow: v => ['clip', 'hidden', 'auto', 'scroll', 'visible'].includes(v),
  width: v => ['fit-content', 'min-content', 'max-content'].includes(v),
  height: v => /^\d+(?:\.\d+)?(?:dvh|svh|lvh)$/.test(v),
  'grid-template-columns': v => v === 'subgrid',
  'grid-template-rows': v => v === 'subgrid',
  translate: v => /^(?:-?\d*\.?\d+px)(?:\s+-?\d*\.?\d+px)?$/.test(v),
  'text-wrap': v => ['balance', 'wrap', 'nowrap'].includes(v),
  'accent-color': v => /^(?:auto|#[0-9a-f]{3,8}|[a-z]+)$/.test(v),
};
// selector() arguments every target browser supports.
export const supportedSelectors = [':has(a)', ':focus-visible', ':is(a)', ':where(a)', ':not(a, b)', ':focus-within', '::backdrop', ':user-invalid'];

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
    if (s.slice(i, i + 9).toLowerCase() === 'selector(') { i += 9; const arg = group().trim().toLowerCase().replace(/\s+/g, ' '); return supportedSelectors.includes(arg) ? true : undefined; }
    if (s[i] !== '(') fail();
    i++;
    const inner = group().trim();
    // A nested condition, or a declaration.
    if (/^\s*(?:not\b|\(|selector\()/i.test(inner)) return supportsCondition(inner);
    const m = /^([a-z-]+)\s*:\s*(.+)$/is.exec(inner);
    if (!m) return undefined;
    const test = supportedDeclarations[m[1].toLowerCase()];
    return test && test(m[2].trim().toLowerCase().replace(/\s+/g, ' ')) ? true : undefined;
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
