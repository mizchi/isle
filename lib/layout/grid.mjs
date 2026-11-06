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
function placement(value, axis) {
  if (value === 'auto') return { span: 1 };
  const automatic = value.match(/^span\s+([1-9]\d*)$/);
  if (automatic) return { span: Number(automatic[1]) };
  const m = value.match(/^([1-9]\d*)(?:\s*\/\s*(?:span\s+([1-9]\d*)|([1-9]\d*)))?$/);
  if (!m) throw new Error(`Use numeric grid-${axis}, start / end, or start / span N`);
  const start = Number(m[1]) - 1, span = m[2] ? Number(m[2]) : m[3] ? Number(m[3]) - start - 1 : 1;
  return { start, span };
}
export function place(children, columns, { rows, subgridColumns = false } = {}) {
  const occupied = new Set(), result = [];
  let cursor = 0;
  const violation = (code, message, box, axis) => { throw Object.assign(new Error(message), { code, box, axis }); };
  const ordered = children.map(item => ({ ...item, column: placement(item.style['grid-column'], 'column'), line: placement(item.style['grid-row'], 'row') }))
    .toSorted((a, b) => Number(a.line.start === undefined) - Number(b.line.start === undefined));
  for (const { box, style, column: columnPlacement, line } of ordered) {
    const column = columnPlacement.start, span = columnPlacement.span, rowSpan = line.span;
    if (!Number.isSafeInteger(span) || span < 1 || (column ?? 0) + span > columns) violation(subgridColumns ? 'E_LAYOUT_SUBGRID_PLACEMENT' : 'E_LAYOUT_PLACEMENT', 'Child placement is outside the explicit columns', box, 'inline');
    if (!Number.isSafeInteger(rowSpan) || rowSpan < 1 || rowSpan > 2048 || (line.start ?? 0) + rowSpan > 2048) throw new Error('Use grid rows within 1..2048');
    if (line.start !== undefined && column === undefined) throw new Error('An explicit row requires an explicit column');
    let row = line.start === undefined ? Math.floor(cursor / columns) : line.start;
    let start = column ?? cursor % columns;
    if (start + span > columns) { start = 0; row++; }
    const busy = () => {
      for (let r = row; r < row + rowSpan; r++) for (let c = start; c < start + span; c++) if (occupied.has(`${r}:${c}`)) return true;
      return false;
    };
    if (column === undefined) while (busy()) { start++; if (start + span > columns) { start = 0; row++; } }
    else if (line.start === undefined) { if (start < cursor % columns) row++; while (busy()) row++; }
    else if (busy()) violation('E_LAYOUT_OVERLAP', 'Grid items overlap without an overlay contract', box);
    if (rows !== undefined && row + rowSpan > rows) violation('E_LAYOUT_SUBGRID_PLACEMENT', 'Subgrid cannot create implicit rows or clamp items beyond its inherited rows', box, 'block');
    if (row + rowSpan > 2048) throw new Error('Grid row limit exceeded');
    for (let r = row; r < row + rowSpan; r++) for (let c = start; c < start + span; c++) occupied.add(`${r}:${c}`);
    if (line.start === undefined) cursor = row * columns + start + span;
    result.push({ box, style, start, span, row, rowSpan });
  }
  return result;
}
