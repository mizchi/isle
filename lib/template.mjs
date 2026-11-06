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
/** Route the closed extended expression subset to the typed region backend. */
export function hasRegionExpressions(component) {
  const extended = expr => ['conditional', 'method', 'collection', 'json-parse', 'json-stringify'].includes(expr.kind) || expressionChildren(expr).some(extended);
  const walk = node => (node.kind === 'expression' && extended(node.value)) || (node.attributes ?? node.props ?? []).some(attr => extended(attr.value)) ||
    node.handlers?.some(handler => ['keydown', 'dblclick', 'focusout'].includes(handler.event) || handler.statements.some(statement => extended(statement.value))) || childrenOf(node).some(walk);
  return component.states.some(state => extended(state.initial)) || component.derives.some(derive => extended(derive.value)) || walk(component.root);
}
export function expressionChildren(expr) {
  switch (expr.kind) {
    case 'conditional': return [expr.test, expr.yes, expr.no];
    case 'method': return [expr.object, ...expr.args];
    case 'collection': return [expr.object, expr.body];
    case 'json-parse': case 'json-stringify': return [expr.value];
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
  if (expr.kind === 'collection') {
    references(expr.object, out);
    for (const name of references(expr.body)) if (name !== expr.parameter) out.add(name);
    return out;
  }
  expressionChildren(expr).forEach(child => references(child, out));
  return out;
}
export function rewrite(expr, env) {
  switch (expr.kind) {
    case 'conditional': return { ...expr, test: rewrite(expr.test, env), yes: rewrite(expr.yes, env), no: rewrite(expr.no, env) };
    case 'method': return { ...expr, object: rewrite(expr.object, env), args: expr.args.map(arg => rewrite(arg, env)) };
    case 'collection': {
      const inner = new Map(env); inner.delete(expr.parameter);
      return { ...expr, object: rewrite(expr.object, env), body: rewrite(expr.body, inner) };
    }
    case 'json-parse': case 'json-stringify': return { ...expr, value: rewrite(expr.value, env) };
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
