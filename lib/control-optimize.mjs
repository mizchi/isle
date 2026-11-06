import { childrenOf, rewrite } from './template.mjs';
import { binaryValue, isLiteral } from './static.mjs';
/** Type-check every arm first; erase only proven unreachable arms in this later pass. */
export function optimizeControls(component) {
  const mutable = new Set(), constants = new Map();
  function scan(node) { node.handlers?.forEach(handler => handler.statements.forEach(statement => mutable.add(statement.target))); childrenOf(node).forEach(scan); }
  scan(component.root);
  function fold(value) {
    value = rewrite(value, constants);
    if (value.kind === 'binary') {
      const left = fold(value.left), right = fold(value.right);
      if (isLiteral(left) && isLiteral(right)) {
        const result = binaryValue(value.op, left.value, right.value);
        if (typeof result !== 'number' || Number.isFinite(result) && !Object.is(result, -0)) return { kind: typeof result, value: result };
      }
      return { ...value, left, right };
    }
    if (value.kind === 'not') { const inner = fold(value.value); return inner.kind === 'boolean' ? { kind: 'boolean', value: !inner.value } : { ...value, value: inner }; }
    return value;
  }
  for (const state of component.states) if (!mutable.has(state.name)) { const value = fold(state.initial); if (isLiteral(value)) constants.set(state.name, value); }
  for (const derive of component.derives) { const value = fold(derive.value); if (isLiteral(value)) constants.set(derive.name, value); }
  function nodes(values) { return values.flatMap(node => {
    if (node.kind === 'select') {
      const cases = []; let fallback = nodes(node.fallback);
      for (const arm of node.cases) {
        const test = fold(arm.test), children = nodes(arm.children);
        if (test.kind === 'boolean') { if (!test.value) continue; fallback = children; break; }
        cases.push({ test, children });
      }
      return cases.length ? [{ ...node, cases, fallback }] : fallback;
    }
    if (node.kind === 'each') return [{ ...node, children: nodes(node.children), empty: nodes(node.empty) }];
    if (node.kind === 'boundary') return [{ ...node, children: nodes(node.children), fallback: nodes(node.fallback) }];
    return [{ ...node, ...(node.children ? { children: nodes(node.children) } : {}) }];
  }); }
  return { ...component, root: nodes([component.root])[0] };
}
