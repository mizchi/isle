const literalKinds = new Set(['string', 'number', 'boolean']);
export const isLiteral = value => literalKinds.has(value.kind);
const transferableLiteral = value => isLiteral(value) &&
  (value.kind !== 'number' || (Number.isFinite(value.value) && !Object.is(value.value, -0)));
export function binaryValue(op, a, b) {
  switch (op) {
    case '===': return a === b;
    case '!==': return a !== b;
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    case '&&': return a && b;
    case '||': return a || b;
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    default: throw new Error('Unsupported expression operator');
  }
}

// HTML parsing normalizes CR/NUL and transport replaces unpaired surrogates.
// Keep these constants in the whole dynamic expression to preserve later Text.data writes.
const stableText = value => !value.startsWith('\n') && !/[\0\r\uD800-\uDFFF]/u.test(value);

/** Partial evaluation is limited to the closed primitive expression language. */
export function optimizeStatic(component, mutable) {
  const constants = new Map(), aliases = new Map(), resolved = new Map(), active = new Set();
  const invariantSources = new Map(component.props.map(prop => [prop.name, prop.type]));
  const definitions = new Map(component.derives.map(derive => [derive.name, derive.value]));
  function derived(name) {
    if (resolved.has(name)) return resolved.get(name);
    if (active.has(name)) throw new Error(`Cyclic derive: ${name}`);
    active.add(name);
    const value = fold(definitions.get(name));
    active.delete(name); resolved.set(name, value);
    return value;
  }
  function fold(expr) {
    if (expr.kind === 'name') {
      if (constants.has(expr.name)) return constants.get(expr.name);
      if (aliases.has(expr.name)) return aliases.get(expr.name);
      if (definitions.has(expr.name)) {
        const value = derived(expr.name);
        if (isLiteral(value)) return value;
      }
      return expr;
    }
    if (expr.kind === 'binary') {
      const left = fold(expr.left), right = fold(expr.right);
      if (isLiteral(left) && isLiteral(right)) {
        const value = binaryValue(expr.op, left.value, right.value);
        if (typeof value !== 'number' || (Number.isFinite(value) && !Object.is(value, -0))) return { kind: typeof value, value };
      }
      return { ...expr, left, right };
    }
    if (expr.kind === 'not') { const value = fold(expr.value); return value.kind === 'boolean' ? { kind: 'boolean', value: !value.value } : { ...expr, value }; }
    if (expr.kind === 'property') return { ...expr, object: fold(expr.object) };
    if (expr.kind === 'remote') return { ...expr, fields: expr.fields.map(field => ({ ...field, value: fold(field.value) })) };
    return expr;
  }
  const states = component.states.map(state => {
    const initial = fold(state.initial);
    if (!mutable.has(state.name)) {
      const type = state.type ?? 'number';
      if (transferableLiteral(initial) && initial.kind === type) constants.set(state.name, initial);
      else if (initial.kind === 'name' && invariantSources.get(initial.name) === type) aliases.set(state.name, initial);
      invariantSources.set(state.name, type);
    }
    return { ...state, initial };
  });
  for (const name of definitions.keys()) derived(name);
  const types = new Map([...component.props, ...component.states].map(field => [field.name, field.type]));
  function isString(expr) {
    if (!expr) return false;
    if (expr.kind === 'string') return true;
    if (expr.kind === 'name') return types.has(expr.name) ? types.get(expr.name) === 'string' : isString(resolved.get(expr.name));
    return expr.kind === 'binary' && expr.op === '+' && isString(expr.left) && isString(expr.right);
  }
  function textParts(expr) {
    if (expr.kind === 'name' && resolved.has(expr.name) && isString(expr)) return textParts(resolved.get(expr.name));
    return expr.kind === 'binary' && expr.op === '+' && isString(expr)
      ? [...textParts(expr.left), ...textParts(expr.right)] : [expr];
  }
  function transform(node) {
    if (node.kind === 'text') return [node];
    if (node.kind === 'slot') return [node];
    if (node.kind === 'island') return [{ ...node, props: node.props.map(prop => ({ ...prop, value: fold(prop.value) })), children: node.children.flatMap(transform) }];
    if (node.kind === 'expression') {
      const value = fold(node.value);
      if (isLiteral(value)) return [{ kind: 'text', value: String(value.value) }];
      const parts = textParts(value);
      let start = 0, end = parts.length;
      while (start < end && parts[start].kind === 'string' && stableText(parts[start].value)) start++;
      while (end > start && parts[end - 1].kind === 'string' && stableText(parts[end - 1].value)) end--;
      if (!start && end === parts.length) return [{ ...node, value }];
      const before = parts.slice(0, start).map(part => part.value).join(''), after = parts.slice(end).map(part => part.value).join('');
      const dynamic = parts.slice(start, end).reduce((left, right) => ({ kind: 'binary', op: '+', left, right }));
      // Keep one Text node: node boundaries can change shaping and kerning.
      return [{ kind: 'expression', value: dynamic, staticText: { before, after } }];
    }
    return [{ ...node, attributes: (node.attributes ?? []).map(attr => ({ ...attr, value: fold(attr.value) })),
      handlers: (node.handlers ?? []).map(handler => ({ ...handler,
        statements: handler.statements.map(statement => ({ ...statement, value: fold(statement.value) })) })),
      children: node.children.flatMap(transform) }];
  }
  return { root: transform(component.root)[0], states, derives: resolved,
    aliases: [...aliases].map(([name, value]) => ({ name, source: value.name })),
    folded: [...constants.keys(), ...[...resolved].filter(([, value]) => isLiteral(value)).map(([name]) => name)] };
}
