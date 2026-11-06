/** Compile-time only. No cost data or analysis helper is referenced by browser modules. */
export const costMetrics = Object.freeze(['stateWrites', 'binaryOperations', 'propertyReads', 'slotReads', 'eventReads',
  'textPatchCalls', 'attributePatchCalls', 'textConversions', 'remoteCalls', 'createdElements']);
const counts = () => Object.fromEntries(costMetrics.map(name => [name, 0]));
const bounds = work => Object.fromEntries(costMetrics.map(name => [name, { kind: 'upper-bound', value: work[name] }]));

/** Inspect exactly the expressions that codegen emits, including its selected temporaries. */
export function analyzeComponentCost(component, plan, generated) {
  const types = new Map(plan.fields.map(field => [field.name, field.type]));
  const expressionTypes = new WeakMap();
  function expressionType(expr) {
    if (expressionTypes.has(expr)) return expressionTypes.get(expr);
    let type;
    if (expr.kind === 'name') type = plan.derives.has(expr.name) ? expressionType(plan.derives.get(expr.name)) : types.get(expr.name);
    else if (expr.kind === 'binary') type = expr.op === '+' && [expressionType(expr.left), expressionType(expr.right)].includes('string') ? 'string' : 'number';
    else if (expr.kind === 'event') type = ['value', 'validationMessage'].includes(expr.field) ? 'string' : 'boolean';
    else if (['number', 'string', 'boolean'].includes(expr.kind)) type = expr.kind;
    expressionTypes.set(expr, type);
    return type;
  }
  function inspect(expr, selected, work, unknown) {
    switch (expr.kind) {
      case 'name':
        if (selected.has(expr.name)) return;
        if (plan.derives.has(expr.name)) inspect(plan.derives.get(expr.name), selected, work, unknown);
        else { work.slotReads++; if (types.get(expr.name) === 'string') unknown.add('string-size'); }
        return;
      case 'binary':
        work.binaryOperations++;
        if (expr.op === '+' && expressionType(expr) === 'string') unknown.add('string-size');
        inspect(expr.left, selected, work, unknown); inspect(expr.right, selected, work, unknown); return;
      case 'not': inspect(expr.value, selected, work, unknown); return;
      case 'property': work.propertyReads++; inspect(expr.object, selected, work, unknown); return;
      case 'remote':
        work.remoteCalls++; unknown.add('remote-duration');
        expr.fields.forEach(field => inspect(field.value, selected, work, unknown)); return;
      case 'event':
        work.eventReads++; if (expressionType(expr) === 'string') unknown.add('string-size'); return;
      case 'number': case 'string': case 'boolean': return;
      default: throw new Error(`Unsupported cost expression: ${expr.kind}`);
    }
  }
  const restore = { owners: generated.handlers.length ? 1 : 0, snapshotSlots: plan.fields.length,
    bindingLocators: plan.bindings.length, childOwners: 0 };
  const unknownReasons = {
    'string-size': 'String length and string/DOM work are not bounded by operation counts.',
    'remote-duration': 'Network, server work and await duration are not statically bounded.',
    'form-runtime': 'Schema form validation and DOM operations are delegated to the form runtime.',
  };
  const entries = generated.handlers.map((handler, index) => {
    const source = plan.handlers[index], writes = new Set(handler.writes), unknown = new Set(), phases = [];
    const updates = plan.bindings.filter(binding => binding.dependencies.some(name => writes.has(name)));
    function phase(roots, name, extra = {}) {
      const work = { ...counts(), ...extra }, shared = handler.computations.find(entry => entry.phase === name)?.derives ?? [];
      const selected = new Set(shared);
      for (const name of shared) inspect(plan.derives.get(name), new Set(shared.filter(other => other !== name)), work, unknown);
      roots.forEach(expr => inspect(expr, selected, work, unknown));
      phases.push({ phase: name, sharedDerives: [...shared], work: bounds(work) });
    }
    if (handler.form) {
      unknown.add('form-runtime');
      phases.push({ phase: 'form', sharedDerives: [], work: Object.fromEntries(costMetrics.map(name => [name,
        { kind: 'unknown', reason: unknownReasons['form-runtime'] }])) });
    } else {
      source.statements.forEach((statement, index) => phase([statement.value], `statement:${index}`, {
        stateWrites: 1, binaryOperations: statement.op === '=' ? 0 : 1, slotReads: statement.op === '=' ? 0 : 1,
      }));
      phase(updates.map(binding => binding.value), 'patch', {
        textPatchCalls: updates.filter(binding => binding.kind === 'text').length,
        attributePatchCalls: updates.filter(binding => binding.kind === 'attribute').length,
        textConversions: updates.filter(binding => binding.kind === 'text').length,
      });
    }
    const work = Object.fromEntries(costMetrics.map(metric => {
      const values = phases.map(phase => phase.work[metric]);
      return [metric, values.find(value => value.kind === 'unknown') ?? { kind: 'upper-bound', value: values.reduce((sum, value) => sum + value.value, 0) }];
    }));
    const edges = new Map(), visited = new Set();
    const edge = (from, to) => edges.set(JSON.stringify([from, to]), { from, to });
    function reasons(expr, target) {
      if (expr.kind === 'name') {
        const name = `${component.name}.${expr.name}`; edge(name, target);
        if (plan.derives.has(expr.name) && !visited.has(name)) { visited.add(name); reasons(plan.derives.get(expr.name), name); }
      } else if (expr.kind === 'binary') { reasons(expr.left, target); reasons(expr.right, target); }
      else if (expr.kind === 'property') reasons(expr.object, target);
      else if (expr.kind === 'remote') expr.fields.forEach(field => reasons(field.value, target));
    }
    updates.forEach(binding => reasons(binding.value, `${component.name}.binding:${binding.id}`));
    return { id: handler.id, component: component.name, event: handler.event, async: handler.async, source: handler.source,
      scope: 'one-owner/generated-handler', captures: [...handler.captureNames], writes: [...handler.writes], actions: [...handler.actions],
      restore, work, phases,
      updates: updates.map(({ id, kind, name, dependencies }) => ({ id, kind, ...(name ? { name } : {}), dependencies: [...dependencies], triggeredBy: dependencies.filter(name => writes.has(name)) })),
      reasons: [...edges.values()], unknownCosts: [...unknown].sort().map(code => ({ code, reason: unknownReasons[code] })) };
  });
  let localElements = 0;
  const childSites = [];
  function walk(node) {
    if (node.kind === 'island') { childSites.push({ site: node.site, component: node.component }); return; }
    if (node.kind === 'element') localElements++;
    node.children?.forEach(walk);
  }
  walk(plan.root);
  return { component: component.name, schemaId: generated.schemaId, side: component.side, localElements, childSites, restore, entries };
}
