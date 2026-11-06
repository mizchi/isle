/** Common numeric computations are local to one stable-value phase. No state or
 * results are added to the snapshot. Property reads, strings and remote calls
 * retain their original evaluation order. */
export function planComputations(roots, derives, types, emit, start = 0) {
  const plain = () => ({ declarations: [], expressions: roots.map(expr => emit(expr, new Map())), derives: [], next: start });
  function allowed(expr) {
    return ['number', 'string', 'boolean', 'name'].includes(expr.kind) ||
      (expr.kind === 'binary' && allowed(expr.left) && allowed(expr.right));
  }
  if (!roots.length || !roots.every(allowed)) return plain();
  const references = expr => expr.kind === 'name' ? [expr.name] : expr.kind === 'binary'
    ? [...references(expr.left), ...references(expr.right)] : [];
  const dependencies = new Map(), order = [], seen = new Set(), active = new Set();
  function visit(name) {
    if (!derives.has(name) || seen.has(name)) return;
    if (active.has(name)) throw new Error(`Cyclic derive: ${name}`);
    active.add(name);
    const refs = references(derives.get(name));
    dependencies.set(name, refs);
    refs.forEach(visit);
    active.delete(name); seen.add(name); order.push(name);
  }
  const inputs = roots.flatMap(references);
  inputs.forEach(visit);
  if (!order.every(name => allowed(derives.get(name)))) return plain();
  const numericTypes = new Map();
  function numeric(expr) {
    if (expr.kind === 'number') return true;
    if (expr.kind === 'name') return derives.has(expr.name) ? numericTypes.get(expr.name) === true : types.get(expr.name) === 'number';
    return expr.kind === 'binary' && ['+', '-', '*', '/'].includes(expr.op) && numeric(expr.left) && numeric(expr.right);
  }
  const candidates = new Map();
  for (const name of order) {
    const expression = derives.get(name), isNumeric = numeric(expression);
    numericTypes.set(name, isNumeric);
    if (isNumeric && expression.kind === 'binary') candidates.set(name, `d${start + candidates.size}`);
  }
  if (!candidates.size) return plain();
  const selected = new Map(candidates);
  function counts() {
    const uses = new Map();
    const add = (name, count) => { if (derives.has(name)) uses.set(name, (uses.get(name) ?? 0) + count); };
    inputs.forEach(name => add(name, 1));
    for (const name of order.toReversed()) {
      const count = uses.get(name) ?? 0, evaluations = selected.has(name) ? Math.min(count, 1) : count;
      for (const dependency of dependencies.get(name)) add(dependency, evaluations);
    }
    return uses;
  }
  // Keep a temporary only when it reduces emitted source size after accounting
  // for other shared nodes. Pruning also prevents caching once-used children.
  for (;;) {
    let removed = false;
    const uses = counts();
    for (const [name, local] of selected) {
      const others = new Map(selected); others.delete(name);
      const expression = emit(derives.get(name), others), count = uses.get(name) ?? 0;
      const declaration = `  const ${local} = ${expression};`;
      if (count < 2 || expression.length * count <= declaration.length + local.length * count) {
        selected.delete(name); removed = true; break;
      }
    }
    if (!removed) break;
  }
  if (!selected.size) return plain();
  const declarations = order.filter(name => selected.has(name)).map(name => {
    const others = new Map(selected); others.delete(name);
    return `  const ${selected.get(name)} = ${emit(derives.get(name), others)};`;
  });
  const expressions = roots.map(expr => emit(expr, selected));
  const baseline = plain();
  if (declarations.join('\n').length + expressions.join('').length >= baseline.expressions.join('').length) return baseline;
  return { declarations, expressions, derives: order.filter(name => selected.has(name)), next: start + candidates.size };
}
