// Static counterparts of the box-model rules of `vlmkit check integrity`
// (runtime, DOM + pixels). Each rule is decided over the whole viewport
// domain from the symbolic geometry the engine already proved: border-box
// rectangles that are affine in the viewport, the regions they hold in, and
// the obligations a box contract waived. Opt-in through `options.integrity`.
//
//   page-overflow-x      → E_LAYOUT_PAGE_OVERFLOW   a box's right edge passes the viewport
//   container-protrusion → E_LAYOUT_PROTRUSION      a child leaves its parent's padding box
//   text-collision       → E_LAYOUT_TEXT_COLLISION  two text boxes intersect
//   target-undersized    → E_LAYOUT_TARGET_SIZE     a button/link is smaller than the target size
//   clipped-content      → W_LAYOUT_CLIPPED         a waived overflow is cut by hidden/clip (warning)
//   nested-scroll        → W_LAYOUT_NESTED_SCROLL   a scrolling box inside a scrolling box (warning)
//
// Boxes without a proved rectangle (inside a clipping or scrolling ancestor,
// or where positions are not modeled) are outside the positional rules, as in
// the browser, where clipped content cannot reach the page edge.
import { q, exact, number } from './linear.mjs';
import { scalar, width, sum, diff, times, evaluate, sample, clip, partition } from './region.mjs';

export function intersect(a, b) {
  let region = a;
  for (const constraint of b.constraints) { region = region && clip(region, constraint.slack, constraint.strict); if (!region) return null; }
  return region;
}
const below = (region, value, limit) => region && clip(region, diff(limit, value), true); // value < limit
const right = row => sum(row.origin.inline, row.inline);
const bottom = row => sum(row.origin.block, row.block);
const box = row => ({ inline: [[row.origin.inline, right(row)]], block: [[row.origin.block, bottom(row)]], basis: 'border-box' });
const alignments = { start: 0, left: 0, justify: 0, center: 1 / 2, end: 1, right: 1 };
/**
 * Painted extents of a text leaf as [{region, extent}]: the font-derived line,
 * or the border box. A line that does not fit is start-aligned (CSS Text 3
 * §6.1), so text-align applies only where the content box holds the bound;
 * for a domain, strings wider than the box start-align within [start, bound].
 */
function textExtents(row) {
  const contract = row.box.contract, factor = alignments[row.textAlign];
  if (!contract?.textMetrics || !contract.font || factor === undefined) return [{ region: row.region, extent: box(row) }];
  const start = sum(row.origin.inline, scalar(row.content.left)), top = sum(row.origin.block, scalar(row.content.top));
  const width = scalar(contract.minInlineSize), block = [[top, sum(top, scalar(contract.font.lineHeight))]];
  const place = left => {
    const extent = { inline: [[left, sum(left, width)]], block: [...block], basis: 'text' };
    if (row.overflow !== 'visible') { const own = box(row); extent.inline.push(own.inline[0]); extent.block.push(own.block[0]); }
    return extent;
  };
  if (factor === 0) return [{ region: row.region, extent: place(start) }];
  const fits = partition(row.region, diff(row.content.inline, width), '>=');
  return [...fits.yes.map(region => ({ region, extent: place(sum(start, times(diff(row.content.inline, width), q(factor)))) })),
    ...fits.no.map(region => ({ region, extent: place(start) }))];
}
const isParent = (parent, child) => child.path.startsWith(parent.path + '/') && !child.path.slice(parent.path.length + 1).includes('/');

export function judgeIntegrity({ geometry, waived }, { block, targetSize = 24, protrusion = 'all', ranges }) {
  const findings = [], warnings = [], exempted = [];
  const witness = region => { const p = sample(region); return { viewport: number(p.x), viewportExact: exact(p.x), ...(block ? { viewportHeight: number(p.y), viewportHeightExact: exact(p.y) } : {}) }; };
  const report = (list, code, severity, message, row, region, extra = {}) => list.push({ code, severity, message, box: row.box.label, path: row.path, source: row.box.source, ...ranges(region), witness: witness(region), ...extra });
  const placed = geometry.filter(row => row.origin && row.block);

  // page-overflow-x: the page scrolls when an unclipped box reaches past the viewport.
  for (const row of placed) {
    const failed = below(row.region, width, right(row));
    if (failed) report(findings, 'E_LAYOUT_PAGE_OVERFLOW', 'error', `${row.box.label} reaches past the viewport, so the page scrolls horizontally`, row, failed, { rule: 'page-overflow-x', amount: number(evaluate(diff(right(row), width), sample(failed))) });
  }

  // container-protrusion: a child's border box leaves its parent's padding box.
  for (const child of placed) {
    if (child.position === 'absolute') continue; // authored overlay; its containing block is checked separately
    // 'painted': only parents with a border or background, as vlmkit judges visible protrusion.
    for (const parent of placed.filter(p => isParent(p, child) && (protrusion === 'all' || p.painted))) {
      const shared = intersect(child.region, parent.region);
      if (!shared) continue;
      const box = { left: sum(parent.origin.inline, scalar(parent.borders.left)), top: sum(parent.origin.block, scalar(parent.borders.top)),
        right: diff(right(parent), scalar(parent.borders.right)), bottom: diff(bottom(parent), scalar(parent.borders.bottom)) };
      for (const [axis, failed] of [
        ['inline', below(shared, child.origin.inline, box.left)], ['inline', below(shared, box.right, right(child))],
        ['block', below(shared, child.origin.block, box.top)], ['block', below(shared, box.bottom, bottom(child))],
      ]) if (failed) { report(findings, 'E_LAYOUT_PROTRUSION', 'error', `${child.box.label} sticks out of its parent ${parent.box.label} on the ${axis} axis`, child, failed, { rule: 'container-protrusion', axis, parent: parent.path }); break; }
    }
  }

  // text-collision: the painted text of two leaves overlaps (open intervals:
  // touching is fine). A font-derived text contract (ADR-0010) gives the
  // extent of its single line: the width bound placed by text-align and one
  // line box; a box that clips its overflow cuts it to its padding box. Other
  // text is its border box. Intervals intersect iff all pairs do (Helly, 1-D).
  // A positioned (absolute) box is an authored overlay: listed as exempted.
  const texts = placed.filter(row => row.box.text);
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    for (const pa of textExtents(a)) for (const pb of textExtents(b)) {
      let overlap = intersect(pa.region, pb.region);
      for (const axis of ['inline', 'block']) {
        const intervals = [...pa.extent[axis], ...pb.extent[axis]];
        for (let m = 0; m < intervals.length && overlap; m++) for (let n = m + 1; n < intervals.length && overlap; n++)
          overlap = below(below(overlap, intervals[m][0], intervals[n][1]), intervals[n][0], intervals[m][1]);
      }
      if (!overlap) continue;
      const extra = { rule: 'text-collision', other: b.path, basis: [pa.extent.basis, pb.extent.basis] };
      if (a.position === 'absolute' || b.position === 'absolute') exempted.push({ code: 'E_LAYOUT_TEXT_COLLISION', rule: 'text-collision', box: a.box.label, path: a.path, other: b.path, ...ranges(overlap), basis: extra.basis, reason: 'intentional overlay: one box is positioned above the flow' });
      else report(findings, 'E_LAYOUT_TEXT_COLLISION', 'error', `${a.box.label} and ${b.box.label} overlap`, a, overlap, extra);
    }
  }

  // target-undersized (WCAG 2.2 SC 2.5.8): interactive boxes need targetSize × targetSize.
  if (block) for (const row of geometry.filter(row => ['button', 'a'].includes(row.box.tag) && row.block)) {
    for (const [axis, size] of [['inline', row.inline], ['block', row.block]]) {
      const failed = below(row.region, size, scalar(targetSize));
      if (failed) { report(findings, 'E_LAYOUT_TARGET_SIZE', 'error', `${row.box.label} is smaller than the ${targetSize}px target size on the ${axis} axis`, row, failed, { rule: 'target-undersized', axis }); break; }
    }
  }

  // clipped-content / nested-scroll: obligations a contract waived that do fail.
  const byPath = new Map(geometry.map(row => [row.path, row]));
  const owner = path => { for (let p = path; p; p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') { const row = byPath.get(p); if (row && row.overflow !== 'visible') return row; } return null; };
  const scrolling = [];
  for (const entry of waived) {
    const container = owner(entry.self ? entry.path : entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : entry.path);
    if (!container) continue;
    if (container.overflow === 'clip') report(warnings, 'W_LAYOUT_CLIPPED', 'warning', `${entry.box.label} is cut off by ${container.box.label} (overflow ${container.overflowValue})`, entry, entry.region, { rule: 'clipped-content', container: container.path, axis: entry.axis });
    else if (container.overflow === 'scroll') scrolling.push({ container, region: entry.region });
  }
  for (const inner of scrolling) for (const outer of scrolling) {
    if (inner.container === outer.container || !inner.container.path.startsWith(outer.container.path + '/')) continue;
    const both = intersect(inner.region, outer.region);
    if (both) report(warnings, 'W_LAYOUT_NESTED_SCROLL', 'warning', `${inner.container.box.label} scrolls inside ${outer.container.box.label}`, inner.container, both, { rule: 'nested-scroll', outer: outer.container.path });
  }
  return { findings: dedupe(findings), warnings: dedupe(warnings), exempted: dedupe(exempted) };
}

// One row per (code, path, axis, region): the solver revisits boxes per case.
function dedupe(rows) {
  const seen = new Set();
  return rows.filter(row => { const key = JSON.stringify([row.code, row.path, row.axis, row.other, row.range, row.heightRange]); if (seen.has(key)) return false; seen.add(key); return true; });
}
