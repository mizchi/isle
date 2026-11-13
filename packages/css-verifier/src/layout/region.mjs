import { q, add, sub, mul, div, cmp, exact, number } from './linear.mjs';
const z = q(0);
export const scalar = value => ({ x: z, y: z, b: q(value) });
export const width = { x: q(1), y: z, b: z };
export const height = { x: z, y: q(1), b: z };
export const sum = (a, b) => ({ x: add(a.x, b.x), y: add(a.y, b.y), b: add(a.b, b.b) });
export const times = (a, k) => ({ x: mul(a.x, k), y: mul(a.y, k), b: mul(a.b, k) });
export const diff = (a, b) => sum(a, times(b, q(-1)));
export const evaluate = (a, p) => add(add(mul(a.x, p.x), mul(a.y, p.y)), a.b);
export const affine = a => ({ coefficient: exact(a.x), constant: exact(a.b), ...(cmp(a.y, z) ? { heightCoefficient: exact(a.y) } : {}) });
const key = p => `${exact(p.x)},${exact(p.y)}`;
const unique = points => [...new Map(points.map(p => [key(p), p])).values()];
export const sample = region => {
  const n = q(region.vertices.length);
  return { x: div(region.vertices.map(p => p.x).reduce(add, z), n), y: div(region.vertices.map(p => p.y).reduce(add, z), n) };
};
export function rectangle(inline, block) {
  return { vertices: unique([{ x: inline.min, y: block.min }, { x: inline.max, y: block.min }, { x: inline.max, y: block.max }, { x: inline.min, y: block.max }]), constraints: [] };
}
/** Exact clipping of a bounded convex region by slack >= 0 (or > 0). */
export function clip(region, slack, strict = false) {
  const vertices = [], points = region.vertices;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const av = evaluate(slack, a), bv = evaluate(slack, b);
    const ai = cmp(av, z) >= 0, bi = cmp(bv, z) >= 0;
    if (ai) vertices.push(a);
    if (ai !== bi) {
      const t = div(av, sub(av, bv));
      vertices.push({ x: add(a.x, mul(t, sub(b.x, a.x))), y: add(a.y, mul(t, sub(b.y, a.y))) });
    }
  }
  const result = { vertices: unique(vertices), constraints: [...region.constraints, { slack, strict }] };
  if (!result.vertices.length) return null;
  // The centroid lies in the relative interior, including degenerate lines/points.
  const point = sample(result);
  if (result.constraints.some(c => cmp(evaluate(c.slack, point), z) < (c.strict ? 1 : 0))) return null;
  return result;
}
export function partition(region, slack, relation) {
  const negative = times(slack, q(-1));
  if (relation === '>=' || relation === '>') return { yes: [clip(region, slack, relation === '>')].filter(Boolean), no: [clip(region, negative, relation === '>=')].filter(Boolean) };
  if (relation === '<=' || relation === '<') return partition(region, negative, relation === '<' ? '>' : '>=');
  const equal = clip(region, slack);
  return { yes: [equal && clip(equal, negative)].filter(Boolean), no: [clip(region, slack, true), clip(region, negative, true)].filter(Boolean) };
}
export function projection(region, axis) {
  const values = region.vertices.map(p => p[axis]).sort(cmp), min = values[0], max = values.at(-1);
  const variable = axis === 'x' ? width : height;
  const includes = value => { const one = clip(region, diff(variable, scalar(value))); return Boolean(one && clip(one, diff(scalar(value), variable))); };
  return { min: number(min), max: number(max), minInclusive: includes(min), maxInclusive: includes(max), minExact: exact(min), maxExact: exact(max) };
}
export function serialize(region) {
  const constraints=new Map();
  for(const c of region.constraints) {
    const variable=[c.slack.x,c.slack.y].find(value=>cmp(value,z)!==0);
    if(!variable) continue; // A feasible region's constant constraints are tautologies.
    const magnitude=cmp(variable,z)<0 ? mul(variable,q(-1)) : variable;
    const normalized=affine(times(c.slack,div(q(1),magnitude))),key=JSON.stringify(normalized);
    constraints.set(key,{...normalized,strict:c.strict || (constraints.get(key)?.strict ?? false)});
  }
  return {vertices:region.vertices.map(p=>({width:exact(p.x),height:exact(p.y)})),constraints:[...constraints.values()]};
}
