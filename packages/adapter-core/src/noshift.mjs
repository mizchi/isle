// Component-declared noshift: an element of the component marked data-noshift="name" keeps its box (position and
// size, at every viewport width and height checked) between the component's states. data-noshift-on="open loading"
// limits the comparison to states that differ only in those conditions (prop names, or the list of a .map / v-for /
// {#each}); without it every two states are compared. A state without the element is not compared (a conditional
// element's absence is not a shift). The contract is part of the component's definition: on a child component's tag
// it is E_SCOPE_CONTRACT (that component's own elements are its to declare).
import { parse } from 'parse5';

const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;
// The analysis' box paths: the page root is `name`, then the index among element children (head is not a box).
function marked(html, name) {
  const out = new Map();
  const walk = (node, path) => {
    const kids = (node.childNodes ?? []).filter(n => n.tagName && !(node.tagName === 'html' && n.tagName === 'head'));
    kids.forEach((child, i) => {
      const p = `${path}/${i}`, key = attr(child, 'data-noshift');
      if (key !== undefined) out.set(key || p, { path: p, on: (attr(child, 'data-noshift-on') ?? '').split(/\s+/).filter(Boolean), label: `[data-noshift="${key}"]` });
      walk(child.tagName === 'template' ? child.content : child, p);
    });
  };
  const doc = parse(html), root = doc.childNodes.find(n => n.tagName === 'html');
  if (root) walk(root, name);
  return out;
}
const num = text => { const [n, d = '1'] = String(text ?? '0').split('/'); return Number(n) / Number(d); };
const at = (affine, width, height) => num(affine.coefficient) * width + num(affine.heightCoefficient ?? '0') * height + num(affine.constant);
const same = (a, b) => ['coefficient', 'heightCoefficient', 'constant'].every(k => Math.abs(num(a[k] ?? '0') - num(b[k] ?? '0')) < 1e-9);
const overlap = (a, b) => a && b ? (Math.max(a.min, b.min) < Math.min(a.max, b.max) || (Math.max(a.min, b.min) === Math.min(a.max, b.max) && a.maxInclusive !== false && b.maxInclusive !== false && a.minInclusive !== false && b.minInclusive !== false)) : true;
const mid = (a, b) => (Math.max(a.min, b.min) + Math.min(a.max, b.max)) / 2;
// The rows cover every width checked (no gap where the box is not known).
const covers = (rows, viewport) => {
  if (!viewport) return true;
  const spans = rows.map(r => r.range).sort((a, b) => a.min - b.min);
  let reach = viewport.min;
  for (const s of spans) { if (s.min > reach) return false; reach = Math.max(reach, s.max); }
  return reach >= viewport.max;
};
const conditionName = key => key.replace(/^#\w+\s+/, '');
const differsOnlyIn = (a, b, names) => Object.keys({ ...a, ...b }).every(k => a[k] === b[k] || names.includes(k) || names.includes(conditionName(k)));
const describe = choices => Object.keys(choices).length ? `{${Object.entries(choices).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}}` : 'the only state';
const sides = { inlineStart: 'left', blockStart: 'top', inlineSize: 'width', blockSize: 'height' };

/** Findings and Unknowns of the data-noshift contracts over analysed states ({choices, html, report}). */
export function noShift(results, { wrap, name, viewport }) {
  const findings = [], unknowns = [];
  const states = results.map(r => ({ ...r, marks: marked(wrap(r.html), name) }));
  const keys = new Set(states.flatMap(s => [...s.marks.keys()]));
  for (const key of keys) {
    const holding = states.filter(s => s.marks.has(key));
    let broken = null, unknown = null;
    for (let i = 0; i < holding.length && !broken; i++) for (let j = i + 1; j < holding.length && !broken; j++) {
      const A = holding[i], B = holding[j], on = [...new Set([...A.marks.get(key).on, ...B.marks.get(key).on])];
      if (on.length && !differsOnlyIn(A.choices, B.choices, on)) continue;
      const rows = s => (s.report.sizes ?? []).filter(r => r.path === s.marks.get(key).path && r.rect);
      const ra = rows(A), rb = rows(B);
      if (!ra.length || !rb.length || !covers(ra, viewport) || !covers(rb, viewport) || A.report.status === 'unknown' || B.report.status === 'unknown') { unknown ??= { A, B }; continue; }
      for (const x of ra) for (const y of rb) {
        if (broken || !overlap(x.range, y.range) || !overlap(x.heightRange, y.heightRange)) continue;
        const moved = Object.keys(sides).find(k => !same(x.rect[k], y.rect[k]));
        if (!moved) continue;
        const width = mid(x.range, y.range), height = x.heightRange && y.heightRange ? mid(x.heightRange, y.heightRange) : (viewport?.height?.min ?? 0);
        broken = { A, B, moved, width, height, a: at(x.rect[moved], width, height), b: at(y.rect[moved], width, height) };
      }
    }
    const label = holding[0].marks.get(key).label;
    if (broken) {
      const r = v => Math.round(v * 100) / 100;
      findings.push({ code: 'E_LAYOUT_NOSHIFT', severity: 'error', box: label, path: broken.A.marks.get(key).path, rule: 'noshift', states: [broken.A.choices, broken.B.choices], html: broken.A.html,
        message: `${label} moves between ${describe(broken.A.choices)} and ${describe(broken.B.choices)}: at ${r(broken.width)}px wide its ${sides[broken.moved]} is ${r(broken.a)}px, then ${r(broken.b)}px (a layout shift its data-noshift contract rules out)` });
    } else if (unknown) unknowns.push({ code: 'U_LAYOUT_NOSHIFT', message: `${label}: its box is not known in ${describe(unknown.A.choices)} or ${describe(unknown.B.choices)}, so its data-noshift contract is not checked` });
  }
  // A contract on another component's tag: the boundary comment carries it.
  const foreign = new Set(results.flatMap(r => [...r.html.matchAll(/<!--isle-boundary:component (\S+) contract=data-noshift-->/g)].map(m => m[1])));
  for (const tag of foreign) findings.push({ code: 'E_SCOPE_CONTRACT', severity: 'error', box: `<${tag}>`, rule: 'component-scope', states: results.map(r => r.choices),
    message: `data-noshift on <${tag}> declares a contract on another component's element: declare it inside ${tag} (its own states), or wrap <${tag}> in an element of this component and mark that` });
  return { findings, unknowns };
}
