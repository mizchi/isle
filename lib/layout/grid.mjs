import postcss from 'postcss';
import { q, cmp } from './linear.mjs';
import { px } from './css.mjs';

export function tracks(value, automatic = false) {
  const result = postcss.list.space(value).map(token => {
    if (automatic && token === 'auto') return { auto: true };
    const flexible = token.match(/^minmax\(\s*0(?:px)?\s*,\s*(\d+(?:\.\d+)?)fr\s*\)$/);
    if (!flexible) return { fixed: px(token) };
    const weight = q(flexible[1]);
    if (cmp(weight, q(0)) <= 0) throw new Error('Grid fr weight must be positive');
    return { weight };
  });
  if (!result.length || result.length > 64) throw new Error('Use 1..64 explicit supported tracks');
  return result;
}
export function place(children, columns) {
  const occupied = new Set(), result = [];
  let cursor = 0;
  const violation = (code, message, box) => { throw Object.assign(new Error(message), { code, box }); };
  const ordered = children.toSorted((a, b) => Number(a.style['grid-row'] === 'auto') - Number(b.style['grid-row'] === 'auto'));
  for (const { box, style } of ordered) {
    const m = style['grid-column'] === 'auto' ? null : style['grid-column'].match(/^(\d+)(?:\s*\/\s*(?:span\s+(\d+)|(\d+)))?$/);
    if (!m && style['grid-column'] !== 'auto') throw new Error('Use numeric grid-column or start / span N');
    const column = m ? Number(m[1]) - 1 : undefined;
    const span = m?.[2] ? Number(m[2]) : m?.[3] ? Number(m[3]) - column - 1 : 1;
    if (column < 0 || span < 1 || (column ?? 0) + span > columns) violation('E_LAYOUT_PLACEMENT', 'Child placement is outside the explicit columns', box);
    const rowText = style['grid-row'];
    if (rowText !== 'auto' && (!/^[1-9]\d*$/.test(rowText) || Number(rowText) > 2048)) throw new Error('Use grid-row auto or an integer in 1..2048');
    if (rowText !== 'auto' && column === undefined) throw new Error('An explicit row requires an explicit column');
    let row = rowText === 'auto' ? Math.floor(cursor / columns) : Number(rowText) - 1;
    let start = column ?? cursor % columns;
    if (start + span > columns) { start = 0; row++; }
    const busy = () => Array.from({ length: span }, (_, i) => `${row}:${start + i}`).some(key => occupied.has(key));
    if (column === undefined) while (busy()) { start++; if (start + span > columns) { start = 0; row++; } }
    else if (rowText === 'auto') { if (start < cursor % columns) row++; while (busy()) row++; }
    else if (busy()) violation('E_LAYOUT_OVERLAP', 'Grid items overlap without an overlay contract', box);
    for (let i = 0; i < span; i++) occupied.add(`${row}:${start + i}`);
    if (rowText === 'auto') cursor = row * columns + start + span;
    if (row >= 2048) throw new Error('Grid row limit exceeded');
    result.push({ box, style, start, span, row });
  }
  return result;
}
