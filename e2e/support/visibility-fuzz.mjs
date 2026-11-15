// Seeded generator of nested grid pages with media branches (width, height, orientation, resolution), for the
// visibility harness: every grid item must fit the grid area it is placed in, or the part that does not is cut off
// (the containers clip) or covered by its neighbour — an invisible region.
//
// The generated CSS stays inside the verifier's subset on purpose (grid tracks of px and minmax(0, fr), px gaps
// and padding, px or stretched item sizes, display: none under a media branch) and never mixes vw with vh in one
// length, so every region the static check reports is a rectangle in (width, height).

export function random(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; }; }

export function generateCase(seed, { flex = false, minmax = false, margins = false } = {}) {
  const r = random(seed), pick = list => list[Math.floor(r() * list.length)], int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  let n = 0;
  const containers = [], items = [];
  // With minmax: true, half the templates are minmax(px, fr) tracks and repeat(auto-fill, …) (the responsive card grid),
  // whose sizes and column counts change with the width (the earlier seeds keep their cases).
  const basic = () => pick([
    'minmax(0,1fr)', `repeat(${int(2, 4)},minmax(0,1fr))`, `${int(8, 30) * 10}px minmax(0,1fr)`, `minmax(0,1fr) ${int(6, 20) * 10}px`,
    `repeat(${int(2, 3)},${int(8, 20) * 10}px)`, `minmax(0,2fr) minmax(0,1fr)`,
  ]);
  const tracks = () => !minmax || r() < 0.5 ? basic() : pick([
    `repeat(auto-fill,minmax(${int(6, 20) * 10}px,1fr))`, `repeat(auto-fill,minmax(min(${int(10, 30) * 10}px,100%),1fr))`, `repeat(auto-fill,${int(6, 16) * 10}px)`, `repeat(auto-fit,minmax(${int(6, 20) * 10}px,1fr))`,
    `minmax(${int(6, 20) * 10}px,1fr) minmax(${int(6, 20) * 10}px,2fr)`, `${int(4, 12) * 10}px minmax(${int(8, 20) * 10}px,1fr)`,
  ]);
  // flex: some containers are flex rows or columns; their children never shrink (flex-shrink: 0) and have px widths
  // (the subset needs a definite basis), so an overflow is a real overflow, not a shrink.
  const container = (depth, inFlex = false) => {
    const id = `c${n++}`, kind = flex && depth > 0 && r() < 0.45 ? pick(['row', 'column']) : 'grid';
    const rule = {kind, columns: tracks(), gap: pick([0, 8, 16]), rowGap: pick([0, 8]), padding: pick([0, 8, 12]), autoRows: pick(['auto', 'auto', `${int(3, 8) * 10}px`]), clip: r() < 0.6, width: inFlex ? `${int(10, 40) * 10}px` : null};
    // With margins: true, grid items (containers and items) get px margins on some sides.
    const margin = () => margins && r() < 0.5 ? Array.from({length: 4}, () => pick([0, 0, 4, 8, 16, 24])).map(v => `${v}px`).join(' ') : null;
    containers.push({id, ...rule, margin: inFlex ? null : margin()});
    const count = int(1, 4);
    const children = Array.from({length: count}, () => depth < 3 && r() < 0.35 && kind === 'grid' ? container(depth + 1) : item(kind !== 'grid', kind));
    return {id, children};
  };
  const item = (inFlex = false, kind = 'grid') => {
    // Flex children are narrower (30–200px) so that a flex row both fits and overflows across the domain.
    const id = `i${n++}`;
    let width = !inFlex && r() < 0.5 ? 'auto' : inFlex ? `${int(3, 20) * 10}px` : `${int(4, 45) * 10}px`;
    // With margins, some grid items get a percentage width (it resolves against the area, not the area less margins).
    if (margins && !inFlex && r() < 0.25) width = pick(['50%', '100%', '80%']);
    const height = `${int(2, 9) * 10}px`;
    items.push({id, width, height, inFlex, margin: margins && kind !== 'column' && r() < 0.5 ? Array.from({length: 4}, () => pick([0, 0, 4, 8, 16, 24])).map(v => `${v}px`).join(' ') : null});
    return {id, children: []};
  };
  const root = container(0);
  const html = node => node.children.length || node.id.startsWith('c') ? `<div class="${node.id}">${node.children.map(html).join('')}</div>` : `<div class="${node.id}"></div>`;
  const decl = c => (c.kind === 'grid' ? `display:grid;grid-template-columns:${c.columns};column-gap:${c.gap}px;row-gap:${c.rowGap}px;grid-auto-rows:${c.autoRows};` : `display:flex;flex-direction:${c.kind};column-gap:${c.gap}px;row-gap:${c.rowGap}px;`)
    + `padding:${c.padding}px;${c.clip ? 'overflow:hidden;' : ''}${c.width ? `width:${c.width};flex-shrink:0;` : ''}${c.margin ? `margin:${c.margin};` : ''}`;
  let css = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr);overflow-x:clip}body{margin:0}';
  css += containers.map(c => `.${c.id}{${decl(c)}background:#eef}`).join('');
  css += items.map(i => `.${i.id}{${i.width === 'auto' ? '' : `width:${i.width};`}height:${i.height};${i.inFlex ? 'flex-shrink:0;' : ''}${i.margin ? `margin:${i.margin};` : ''}background:#246}`).join('');
  // Media branches: each changes a container's tracks, an item's size, or hides an item.
  const conditions = [() => `(min-width: ${int(36, 90) * 10}px)`, () => `(max-width: ${int(36, 90) * 10}px)`, () => `(min-height: ${int(55, 85) * 10}px)`,
    () => '(orientation: portrait)', () => '(min-resolution: 2dppx)', () => `(min-width: ${int(40, 70) * 10}px) and (max-height: ${int(55, 80) * 10}px)`];
  const branches = Array.from({length: int(1, 4)}, () => {
    const condition = pick(conditions)();
    const body = Array.from({length: int(1, 3)}, () => {
      const kind = r();
      if (kind < 0.35) { const c = pick(containers); return c.kind === 'grid' ? `.${c.id}{grid-template-columns:${tracks()}}` : `.${c.id}{flex-direction:${pick(['row', 'column'])}}`; }
      if (kind < 0.75) { const i = pick(items); return `.${i.id}{width:${!i.inFlex && r() < 0.3 ? 'auto' : i.inFlex ? `${int(3, 25) * 10}px` : `${int(4, 60) * 10}px`}}`; }
      const i = pick(items); return `.${i.id}{display:none}`;
    }).join('');
    return `@media ${condition}{${body}}`;
  });
  css += branches.join('');
  return {seed, html: `<html lang="en"><body>${html(root)}</body></html>`, body: html(root), css, items: items.map(i => i.id), containers: containers.map(c => c.id), flexContainers: containers.filter(c => c.kind !== 'grid').map(c => c.id)};
}

// Viewports to sample: random points plus both sides of every px breakpoint in the CSS.
export function viewports(c, seed, {min = 320, max = 1024, hmin = 480, hmax = 900} = {}) {
  const r = random(seed + 7919), points = new Set();
  for (let i = 0; i < 4; i++) points.add(`${min + Math.floor(r() * (max - min))}x${hmin + Math.floor(r() * (hmax - hmin))}`);
  for (const m of c.css.matchAll(/(min|max)-(width|height): (\d+)px/g)) {
    const v = Number(m[3]);
    for (const d of [-1, 0, 1]) {
      const at = v + d;
      if (m[2] === 'width' && at >= min && at <= max) points.add(`${at}x${hmin + Math.floor(r() * (hmax - hmin))}`);
      if (m[2] === 'height' && at >= hmin && at <= hmax) points.add(`${min + Math.floor(r() * (max - min))}x${at}`);
    }
  }
  // orientation compares width with height (portrait when height ≥ width): sample on w = h and on both sides of it.
  if (c.css.includes('orientation')) for (const x of [hmin + 40, Math.min(max, hmax) - 60]) for (const [dw, dh] of [[0, 0], [0, 1], [1, 0]]) points.add(`${x + dw}x${x + dh}`);
  return [...points].map(p => p.split('x').map(Number));
}
