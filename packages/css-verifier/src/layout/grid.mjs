import postcss from 'postcss';
import { q, cmp } from './linear.mjs';
import { px } from './css.mjs';

/** The track tokens of a track list with integer repeat() expanded (at most 64). */
export function expandTracks(value) { return tracks(value, false, true); }
export function tracks(value, automatic = false, tokensOnly = false) {
  const expand=(text,depth=0)=>{
    if(depth>8) throw new Error('Grid repeat nesting limit exceeded');
    const values=[];
    for(const token of postcss.list.space(text)) {
      if(/^repeat\(/.test(token) && token.endsWith(')')) {
        const args=postcss.list.comma(token.slice(7,-1));
        if(args.length!==2 || !/^[1-9]\d?$/.test(args[0])) throw new Error('Use a bounded integer grid repeat');
        const count=Number(args[0]),inner=expand(args[1],depth+1);
        if(values.length+count*inner.length>64) throw new Error('Grid repeat exceeds 64 tracks');
        for(let i=0;i<count;i++) values.push(...inner);
      } else values.push(token);
      if(values.length>64) throw new Error('Grid track limit exceeded');
    }
    return values;
  };
  if (tokensOnly) return expand(value);
  const result = expand(value).map(token => {
    if (automatic && token === 'auto') return { auto: true };
    // A content-sized column (internal, from auto / fit-content(): the engine computes its items' contributions):
    // base B, growth limit G, and whether it stretches into leftover space (auto with justify-content: normal).
    const content = token.match(/^-isle-content\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?),([01])\)$/);
    if (content) return { content: { base: q(content[1]), limit: q(content[2]), stretch: content[3] === '1' } };
    // An automatic table column (internal): sized between its min- and max-content widths by the table's width.
    const column = token.match(/^-isle-auto-table\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\)$/);
    if (column) return { autoTable: { min: q(column[1]), max: q(column[2]) } };
    const fixedColumn = token.match(/^-isle-auto-table-fixed\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\)$/);
    if (fixedColumn) return { autoTable: { min: q(fixedColumn[1]), max: q(fixedColumn[2]), fixed: true } };
    // minmax(Lpx, Nfr): at least L, else its share of the free space; minmax(min(Lpx, 100%), Nfr) caps L at the
    // container's width (the responsive-grid idiom).
    const floored = token.match(/^minmax\(\s*(?:(\d+(?:\.\d+)?)px|min\(\s*(\d+(?:\.\d+)?)px\s*,\s*100%\s*\))\s*,\s*(\d+(?:\.\d+)?)fr\s*\)$/);
    if (floored && cmp(q(floored[1] ?? floored[2]), q(0)) > 0) {
      const weight = q(floored[3]);
      if (cmp(weight, q(0)) <= 0) throw new Error('Grid fr weight must be positive');
      return { weight, min: q(floored[1] ?? floored[2]), ...(floored[2] ? { minCap: true } : {}) };
    }
    // minmax(Apx, Bpx) with A ≤ B: base A, growth limit B, grown by the free space (Grid §12.6, maximize tracks) before
    // fr tracks take the rest; it does not stretch past B. The same track as a content column with fixed bounds.
    const bounded = token.match(/^minmax\(\s*(\d+(?:\.\d+)?)(?:px)?\s*,\s*(\d+(?:\.\d+)?)px\s*\)$/);
    if (bounded && (bounded[1] === '0' || /px\s*,/.test(token))) {
      const base = q(bounded[1]), limit = q(bounded[2]);
      if (cmp(base, limit) > 0) return { fixed: base };
      return { content: { base, limit, stretch: false } };
    }
    // A bare Nfr row (minmax(auto, Nfr)): its minimum is its items' measured minimum contribution (rows only; the
    // engine rewrites bare fr columns before they get here).
    const bareFr = automatic && (token.match(/^(\d+(?:\.\d+)?)fr$/) ?? token.match(/^minmax\(\s*auto\s*,\s*(\d+(?:\.\d+)?)fr\s*\)$/));
    if (bareFr) { const weight = q(bareFr[1]); if (cmp(weight, q(0)) <= 0) throw new Error('Grid fr weight must be positive'); return { weight, autoMin: true }; }
    const flexible = token.match(/^minmax\(\s*0(?:px)?\s*,\s*(\d+(?:\.\d+)?)fr\s*\)$/);
    if (!flexible) return { fixed: px(token) };
    const weight = q(flexible[1]);
    if (cmp(weight, q(0)) <= 0) throw new Error('Grid fr weight must be positive');
    return { weight };
  });
  if (!result.length || result.length > 64) throw new Error('Use 1..64 explicit supported tracks');
  return result;
}
/** grid-template-areas (rows joined by |, cells by spaces) → Map name → {row, column, rows, columns}; '.' is empty. */
export function parseAreas(value) {
  if (!value || value === 'none') return { areas: new Map(), rows: 0, columns: 0 };
  const strings = /["']/.test(value) ? [...value.matchAll(/"([^"]*)"|'([^']*)'/g)].map(m => (m[1] ?? m[2]).trim()) : value.split('|');
  if (!strings.length || strings.some(row => !row) || (/["']/.test(value) && value.replace(/"[^"]*"|'[^']*'/g, '').trim())) throw Object.assign(new Error(`grid-template-areas: ${value} is not a list of strings`), { code: 'U_LAYOUT_CSS' });
  const grid = strings.map(row => row.split(/\s+/).map(cell => /^\.+$/.test(cell) ? null : cell));
  const columns = grid[0].length;
  if (grid.some(row => row.length !== columns)) throw Object.assign(new Error('grid-template-areas rows have different column counts (the declaration is invalid)'), { code: 'U_LAYOUT_CSS' });
  const areas = new Map();
  grid.forEach((row, r) => row.forEach((name, c) => {
    if (!name) return;
    const a = areas.get(name);
    if (!a) areas.set(name, { row: r, column: c, rows: 1, columns: 1, cells: 1 });
    else { a.rows = Math.max(a.rows, r - a.row + 1); a.columns = Math.max(a.columns, c - a.column + 1); a.cells++; }
  }));
  for (const [name, a] of areas) {
    const rect = a.rows * a.columns === a.cells && grid.slice(a.row, a.row + a.rows).every(row => row.slice(a.column, a.column + a.columns).every(cell => cell === name));
    if (!rect) throw Object.assign(new Error(`grid-template-areas: the area ${name} is not a rectangle (the declaration is invalid)`), { code: 'U_LAYOUT_CSS' });
  }
  return { areas, rows: grid.length, columns };
}

function placement(value, axis, areas) {
  if (value === 'auto') return { span: 1 };
  // A bare name in grid-row / grid-column is the named area's lines (name-start / name-end).
  if (/^-?[A-Za-z_][\w-]*$/.test(String(value)) && !/^span$/i.test(value)) value = `area:${value}`;
  if (String(value).startsWith('area:')) {
    const a = areas?.areas.get(value.slice(5));
    if (!a) throw Object.assign(new Error(`grid-${axis}: ${value.slice(5)} names no area of the parent's grid-template-areas (Chromium places it on implicit lines)`), { code: 'U_LAYOUT_CSS', unknownArea: value.slice(5) });
    return axis === 'column' ? { start: a.column, span: a.columns } : { start: a.row, span: a.rows };
  }
  const automatic = value.match(/^span\s+([1-9]\d*)$/);
  if (automatic) return { span: Number(automatic[1]) };
  const m = value.match(/^([1-9]\d*)(?:\s*\/\s*(?:span\s+([1-9]\d*)|([1-9]\d*)))?$/);
  if (!m) throw new Error(`Use numeric grid-${axis}, start / end, or start / span N`);
  const start = Number(m[1]) - 1, span = m[2] ? Number(m[2]) : m[3] ? Number(m[3]) - start - 1 : 1;
  return { start, span };
}
export function place(children, columns, { rows, subgridColumns = false, areas } = {}) {
  // Areas wider than the explicit columns create implicit columns, which are not modeled.
  if (areas && areas.columns > columns) throw Object.assign(new Error(`grid-template-areas has ${areas.columns} columns but grid-template-columns ${columns}: the extra columns are implicit`), { code: 'U_LAYOUT_CSS' });
  const occupied = new Set(), result = [];
  let cursor = 0;
  const violation = (code, message, box, axis) => { throw Object.assign(new Error(message), { code, box, axis }); };
  const ordered = children.map(item => ({ ...item, column: placement(item.style['grid-column'], 'column', areas), line: placement(item.style['grid-row'], 'row', areas) }))
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
