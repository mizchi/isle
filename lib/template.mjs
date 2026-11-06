/** Exhaustive child edges shared by compiler passes; branch bodies keep their lexical scopes. */
export function childGroups(node) {
  if (node.kind === 'select') return [...node.cases.map(arm => arm.children), node.fallback];
  if (node.kind === 'each') return [node.children, node.empty];
  if (node.kind === 'boundary') return [node.children, node.fallback];
  return node.children ? [node.children] : [];
}
export const childrenOf = node => childGroups(node).flat();
export function hasControls(node) {
  return ['select', 'each', 'boundary'].includes(node.kind) || childrenOf(node).some(hasControls);
}
export function expressionChildren(expr) {
  switch (expr.kind) {
    case 'binary': return [expr.left, expr.right];
    case 'property': return [expr.object];
    case 'index': return [expr.object, expr.index];
    case 'not': return [expr.value];
    case 'array': return expr.values;
    case 'record': case 'remote': return expr.fields.map(field => field.value);
    default: return [];
  }
}
export function references(expr, out = new Set()) {
  if (expr.kind === 'name') out.add(expr.name);
  expressionChildren(expr).forEach(child => references(child, out));
  return out;
}
export function rewrite(expr, env) {
  switch (expr.kind) {
    case 'name': return env.get(expr.name) ?? expr;
    case 'binary': return { ...expr, left: rewrite(expr.left, env), right: rewrite(expr.right, env) };
    case 'property': return { ...expr, object: rewrite(expr.object, env) };
    case 'index': return { ...expr, object: rewrite(expr.object, env), index: rewrite(expr.index, env) };
    case 'not': return { ...expr, value: rewrite(expr.value, env) };
    case 'array': return { ...expr, values: expr.values.map(value => rewrite(value, env)) };
    case 'record': case 'remote': return { ...expr, fields: expr.fields.map(field => ({ ...field, value: rewrite(field.value, env) })) };
    default: return expr;
  }
}
