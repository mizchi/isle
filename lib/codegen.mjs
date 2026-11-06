import { hasControls, hasRegionExpressions, childrenOf } from './template.mjs';
import { prepareRegions, valueType } from './region-codegen.mjs';
import {sha256} from './sha256.mjs';
import { optimizeStatic, isLiteral, binaryValue } from './static.mjs';
import { planComputations } from './computations.mjs';
import { analyzeComponentCost } from './cost-plan.mjs';
import { validatePattern } from './form-contracts.mjs';
import { checkedIdentifier as ident, validateShape } from './shape.mjs';
import { escapeHtml, encodeSnapshot, safeHref } from './html.mjs';
export { validateShape, escapeHtml, encodeSnapshot };

const tags = new Set('a article aside b br button code details div em footer form h1 h2 h3 header input label li main nav ol option output p pre section select small span strong summary textarea ul'.split(' '));
const voidTags = new Set(['br', 'input']);
const booleanAttributes = new Set(['disabled', 'required', 'checked', 'readonly', 'multiple', 'selected', 'hidden', 'autofocus']);
const localReferences = new Set(['for', 'aria-labelledby', 'aria-describedby', 'aria-errormessage']);
const formAttributes = new Set('for required checked readonly multiple selected minlength maxlength min max step pattern autocomplete placeholder inputmode rows cols hidden tabindex method action href autofocus'.split(' '));
const quote = JSON.stringify;
const renderContext = Symbol('isle SSR composition');

function refs(expr, out = new Set()) {
  switch (expr.kind) {
    case 'name': out.add(ident(expr.name)); break;
    case 'not': refs(expr.value, out); break;
    case 'binary': refs(expr.left, out); refs(expr.right, out); break;
    case 'property': refs(expr.object, out); ident(expr.key); break;
    case 'remote': expr.fields.forEach(field => refs(field.value, out)); break;
    case 'number': case 'string': case 'boolean': break;
    case 'event':
      if (!['value', 'checked', 'invalid', 'validationMessage'].includes(expr.field)) throw new Error('Unsupported event field');
      break;
    default: throw new Error(`Unsupported expression: ${expr.kind}`);
  }
  return out;
}
function code(expr, derives, slots, seen = new Set(), locals = new Map()) {
  switch (expr.kind) {
    case 'number': case 'string': case 'boolean': return quote(expr.value);
    case 'event':
      refs(expr);
      return `event.${expr.field}`;
    case 'name': {
      const key = ident(expr.name);
      if (locals.has(key)) return locals.get(key);
      if (!derives.has(key)) return `v[${slots ? slots.get(key) : quote(key)}]`;
      if (seen.has(key)) throw new Error(`Cyclic derive: ${key}`);
      return code(derives.get(key), derives, slots, new Set([...seen, key]), locals);
    }
    case 'not': return `(!${code(expr.value, derives, slots, seen, locals)})`;
    case 'binary':
      if (!['+', '-', '*', '/', '===', '!==', '<', '>', '<=', '>=', '&&', '||'].includes(expr.op)) throw new Error('Unsupported expression operator');
      return `(${code(expr.left, derives, slots, seen, locals)} ${expr.op} ${code(expr.right, derives, slots, seen, locals)})`;
    case 'property': return `(${code(expr.object, derives, slots, seen, locals)})[${quote(ident(expr.key))}]`;
    case 'remote': return `(await remote(${quote(ident(expr.name))}, {${expr.fields.map(field => `${quote(ident(field.name))}: ${code(field.value, derives, slots, seen, locals)}`).join(',')}}))`;
    default: throw new Error(`Unsupported expression: ${expr.kind}`);
  }
}
function remoteNames(expr, out = new Set()) {
  if (expr.kind === 'remote') {
    out.add(ident(expr.name));
    for (const field of expr.fields) remoteNames(field.value, out);
  } else if (expr.kind === 'not') remoteNames(expr.value, out);
  else if (expr.kind === 'binary') { remoteNames(expr.left, out); remoteNames(expr.right, out); }
  else if (expr.kind === 'property') remoteNames(expr.object, out);
  return out;
}
function eventFields(expr, out = new Set()) {
  if (expr.kind === 'event') { refs(expr); out.add(expr.field); }
  else if (expr.kind === 'not') eventFields(expr.value, out);
  else if (expr.kind === 'binary') { eventFields(expr.left, out); eventFields(expr.right, out); }
  else if (expr.kind === 'property') eventFields(expr.object, out);
  else if (expr.kind === 'remote') expr.fields.forEach(field => eventFields(field.value, out));
  return out;
}
function evaluate(expr, env, derives, seen = new Set()) {
  switch (expr.kind) {
    case 'number': case 'string': case 'boolean': return expr.value;
    case 'name':
      if (derives.has(expr.name)) {
        if (seen.has(expr.name)) throw new Error('Cyclic derive');
        return evaluate(derives.get(expr.name), env, derives, new Set([...seen, expr.name]));
      }
      if (!Object.hasOwn(env, expr.name)) throw new Error(`Unknown expression name: ${expr.name}`);
      return env[expr.name];
    case 'not': return !evaluate(expr.value, env, derives, seen);
    case 'binary': {
      const a = evaluate(expr.left, env, derives, seen);
      if (expr.op === '&&' && !a || expr.op === '||' && a) return a;
      const b = evaluate(expr.right, env, derives, seen);
      return binaryValue(expr.op, a, b);
    }
    case 'property': return evaluate(expr.object, env, derives, seen)[ident(expr.key)];
    default: throw new Error(`Unsupported SSR expression: ${expr.kind}`);
  }
}
function plan(component) {
  if (component.side !== 'client' && component.states.length) throw new Error('Only client components can own state');
  const originalDerives = new Map(component.derives.map(d => [ident(d.name), d.value]));
  const mutable = new Set(), captured = new Set(), bindings = [], handlers = [], locations = new WeakMap(), staticText = new WeakMap();
  const noEvent = expr => { if (eventFields(expr).size) throw new Error('Event values require an event entry'); };
  for (const state of component.states) { ident(state.name); refs(state.initial); noEvent(state.initial); }
  for (const value of originalDerives.values()) { noEvent(value); code(value, originalDerives); }
  function scan(node) {
    if (node.kind === 'text') return;
    if (node.kind === 'slot') return;
    if (node.kind === 'island') {
      ident(node.component); ident(node.site);
      for (const prop of node.props) { ident(prop.name); refs(prop.value); noEvent(prop.value); }
      node.children.forEach(scan); return;
    }
    if (node.kind === 'expression') { refs(node.value); noEvent(node.value); return; }
    if (node.kind !== 'element' || !tags.has(node.tag)) throw new Error(`Unsupported HTML tag: ${node.tag}`);
    for (const attr of node.attributes ?? []) {
      if ((!formAttributes.has(attr.name) && !/^(class|id|title|type|name|value|role|disabled|aria-[a-z-]+|data-[a-z-]+)$/.test(attr.name)) || attr.name.startsWith('data-isle-')) throw new Error(`Unsupported attribute: ${attr.name}`);
      refs(attr.value);
      if (attr.name === 'href' && node.tag !== 'a') throw new Error('Link href requires an anchor');
      noEvent(attr.value);
      if (attr.name === 'pattern' && attr.value.kind === 'string') {
        validatePattern(attr.value.value);
      }
    }
    for (const handler of node.handlers ?? []) {
      if (component.side !== 'client') throw new Error('Only client components can own handlers');
      if (!['click', 'input', 'change', 'submit', 'invalid'].includes(handler.event)) throw new Error(`Unsupported event: ${handler.event}`);
      const control = ['input', 'textarea', 'select'].includes(node.tag);
      if ((handler.event === 'submit' && node.tag !== 'form') || (handler.event === 'invalid' && !control)) throw new Error('Invalid event target');
      const allowed = control && ['input', 'change', 'invalid'].includes(handler.event) ? new Set(['value', 'invalid', 'validationMessage']) : new Set();
      if (allowed.size && node.tag === 'input' && node.attributes.some(attr => attr.name === 'type' && attr.value.kind === 'string' && ['checkbox', 'radio'].includes(attr.value.value))) allowed.add('checked');
      for (const statement of handler.statements) {
        if ([...eventFields(statement.value)].some(field => !allowed.has(field))) throw new Error('Unsupported event field for target');
        if (!component.states.some(state => state.name === statement.target)) throw new Error(`Mutation requires state: ${statement.target}`);
        mutable.add(statement.target); refs(statement.value);
      }
    }
    node.children.forEach(scan);
  }
  scan(component.root);
  const optimized = optimizeStatic(component, mutable), { derives, root } = optimized;
  const parents = new WeakMap(), depths = new WeakMap(), targets = new Set();
  function collect(node, parent, depth = 0) {
    parents.set(node, parent); depths.set(node, depth);
    if (node.kind !== 'element') return;
    if (node.handlers?.length) targets.add(node);
    for (const handler of node.handlers ?? []) {
      handlers.push({ ...handler, id: `${component.name}.${handler.id}` });
      for (const statement of handler.statements) { captured.add(statement.target); refs(statement.value, captured); }
    }
    node.children.forEach(child => collect(child, node, depth + 1));
  }
  collect(root);
  function deps(expr, seen = new Set()) {
    const result = new Set();
    for (const key of refs(expr)) {
      if (!derives.has(key)) result.add(key);
      else {
        if (seen.has(key)) throw new Error(`Cyclic derive: ${key}`);
        for (const leaf of deps(derives.get(key), new Set([...seen, key]))) result.add(leaf);
      }
    }
    return result;
  }
  const retain = dependencies => { for (const key of dependencies) captured.add(key); };
  function stableProjection(node) {
    if (node.handlers?.length || node.form) throw new Error('Projected children cannot own parent handlers');
    const values = node.kind === 'expression' ? [node.value] : (node.props ?? node.attributes ?? []).map(prop => prop.value);
    if (values.some(value => [...deps(value)].some(name => mutable.has(name)))) throw new Error('Mutable props cannot cross a client owner boundary');
    node.children?.forEach(stableProjection);
  }
  function checkIslands(node) {
    if (node.kind === 'island') {
      if (node.props.some(prop => [...deps(prop.value)].some(name => mutable.has(name)))) throw new Error('Mutable props cannot cross a client owner boundary');
      node.children.forEach(stableProjection); return;
    }
    node.children?.forEach(checkIslands);
  }
  checkIslands(root);
  for (const key of [...captured]) if (derives.has(key)) { captured.delete(key); retain(deps(derives.get(key))); }
  function locate(node) {
    if (node.kind === 'expression') {
      if (node.staticText) staticText.set(node, { before: escapeHtml(node.staticText.before), after: escapeHtml(node.staticText.after) });
      const dependencies = [...deps(node.value)];
      if (dependencies.some(key => mutable.has(key))) {
        const binding = { id: bindings.length, kind: 'text', value: node.value, dependencies,
          ...(node.staticText ? { range: { prefix: node.staticText.before.length, suffix: node.staticText.after.length } } : {}) };
        bindings.push(binding); locations.set(node, binding); retain(dependencies);
        targets.add(parents.get(node));
      }
    } else if (node.kind === 'element') {
      const attributes = [];
      for (const attr of node.attributes ?? []) {
        const dependencies = [...deps(attr.value)];
        if (dependencies.some(key => mutable.has(key))) {
          if (attr.name === 'href') throw new Error('Link destinations must be immutable');
          const binding = { id: bindings.length, kind: 'attribute', name: attr.name, value: attr.value, dependencies };
          bindings.push(binding); attributes.push(binding); retain(dependencies);
          targets.add(node);
        }
      }
      locations.set(node, attributes); node.children.forEach(locate);
    }
  }
  locate(root);
  function commonAncestor(a, b) {
    while (depths.get(a) > depths.get(b)) a = parents.get(a);
    while (depths.get(b) > depths.get(a)) b = parents.get(b);
    while (a !== b) { a = parents.get(a); b = parents.get(b); }
    return a;
  }
  const resumeRoot = targets.size ? [...targets].reduce(commonAncestor) : root;
  const fields = [...component.props, ...component.states].filter(field => captured.has(field.name)).map(field => ({ name: field.name, type: field.type ?? 'number' }));
  for (const key of captured) if (!fields.some(field => field.name === key)) throw new Error(`Unknown captured expression: ${key}`);
  const slots = new Map(fields.map((field, index) => [field.name, index]));
  const dynamicContract = {
    fields,
    handlers: handlers.map(handler => ({ id: handler.id, event: handler.event, async: handler.async,
      ...(handler.preventDefault ? {preventDefault:true} : {}),
      ...(handler.form ? { form: handler.form } : {}),
      statements: handler.statements.map(statement => ({ target: slots.get(statement.target), op: statement.op, value: code(statement.value, derives, slots) })) })),
    bindings: bindings.map(binding => ({ id: binding.id, kind: binding.kind, name: binding.name, range: binding.range,
      value: code(binding.value, derives, slots) })),
  };
  const schemaId = sha256(JSON.stringify([2, 'code-ref/1', 'static-plan/2', dynamicContract])).slice(0,16);
  const needed = new Set(fields.map(field => field.name)), htmlNeeded = new Set(), stateByName = new Map(optimized.states.map(state => [state.name, state]));
  function needTemplate(node) {
    if (node.kind === 'expression') for (const key of deps(node.value)) htmlNeeded.add(key);
    else if (node.kind === 'element') {
      for (const attr of node.attributes ?? []) for (const key of deps(attr.value)) htmlNeeded.add(key);
      node.children.forEach(needTemplate);
    } else if (node.kind === 'island') {
      for (const prop of node.props) for (const key of deps(prop.value)) htmlNeeded.add(key);
      node.children.forEach(needTemplate);
    }
  }
  needTemplate(root);
  function requiredStates(names) {
    for (const key of names) if (stateByName.has(key)) for (const dependency of deps(stateByName.get(key).initial)) names.add(dependency);
    return optimized.states.filter(state => names.has(state.name));
  }
  const htmlStates = requiredStates(htmlNeeded);
  for (const key of htmlNeeded) needed.add(key);
  const states = requiredStates(needed);
  const staticHTML = new WeakMap();
  let staticFragments = 0;
  function cache(node, html) { staticHTML.set(node, html); staticFragments++; }
  function staticMarkup(node) {
    if (node.kind === 'text') return escapeHtml(node.value);
    if (['expression', 'island', 'slot'].includes(node.kind)) return null;
    const children = node.children.map(staticMarkup);
    if (!node.handlers?.length && !node.formField && !node.formError && !node.formSummary && !node.formStatus && node.attributes.every(attr => isLiteral(attr.value) && attr.name !== 'id' && !localReferences.has(attr.name) && !(attr.name === 'value' && ['textarea', 'select'].includes(node.tag))) && children.every(html => html !== null)) {
      const attributes = node.attributes.map(attr => renderAttribute(attr.name, attr.value.value)).join('');
      return voidTags.has(node.tag) ? `<${node.tag}${attributes}>` : `<${node.tag}${attributes}>${children.join('')}</${node.tag}>`;
    }
    children.forEach((html, index) => { if (html !== null) cache(node.children[index], html); });
    return null;
  }
  const html = staticMarkup(root);
  if (html !== null) cache(root, html);
  const analysis = { folded: optimized.folded, aliases: optimized.aliases, serverStates: states.map(state => state.name), htmlStates: htmlStates.map(state => state.name), staticFragments, dynamicBindings: bindings.length,
    snapshotSlots: fields.map(field => field.name), skippedInitializers: optimized.states.filter(state => !needed.has(state.name)).map(state => state.name),
    textRanges: bindings.filter(binding => binding.range).map(binding => ({ id: binding.id, ...binding.range })),
    resumeRoot: { tag: resumeRoot.tag ?? resumeRoot.component ?? 'slot', depth: depths.get(resumeRoot) } };
  return { derives, root, resumeRoot, states, htmlStates, staticHTML, staticText, analysis, bindings, handlers, locations, captured, fields, slots, schemaId, deps };
}
export function generateComponent(component) {
  return prepareComponent(component).generate();
}
function generate(component, p) {
  return { name: component.name, schemaId: p.schemaId, fields: p.fields, analysis: p.analysis,
    events: [...new Set(p.handlers.flatMap(handler => handler.form?.events ?? [handler.event]))],
    bindings: p.bindings.map(({ value, ...binding }) => binding),
    handlers: p.handlers.map(handler => {
      if (handler.form) return { id: handler.id, event: 'submit', async: false, source: handler.source, remote: false,
        form: handler.form, actions: [handler.form.action], captures: [], captureNames: [], writes: [], computations: [], symbol: 'run',
        code: `import { handleForm } from './isle-form-runtime.mjs';\nconst config = ${JSON.stringify(handler.form)};\nexport function run(v, set, text, attribute, remote, event) { return handleForm(event, config); }\n` };
      const writes = new Set(handler.statements.map(statement => statement.target));
      const updates = p.bindings.filter(binding => binding.dependencies.some(key => writes.has(key)));
      const captured = new Set(writes);
      for (const statement of handler.statements) for (const key of p.deps(statement.value)) captured.add(key);
      for (const binding of updates) for (const key of binding.dependencies) captured.add(key);
      const captures = p.fields.flatMap((field, index) => captured.has(field.name) ? [index] : []);
      const slots = new Map(captures.map((index, local) => [p.fields[index].name, local]));
      const types = new Map(p.fields.map(field => [field.name, field.type])), computations = [];
      let temporary = 0;
      function compute(expressions, phase) {
        const result = planComputations(expressions, p.derives, types,
          (expr, locals) => code(expr, p.derives, slots, new Set(), locals), temporary);
        temporary = result.next;
        if (result.derives.length) computations.push({ phase, derives: result.derives });
        return result;
      }
      const statements = handler.statements.flatMap((statement, index) => {
        if (!['=', '+=', '-='].includes(statement.op)) throw new Error('Unsupported mutation operator');
        const calculation = compute([statement.value], `statement:${index}`);
        const rhs = calculation.expressions[0], slot = slots.get(statement.target);
        return [...calculation.declarations, `  set(${slot}, ${statement.op === '=' ? rhs : `(v[${slot}] ${statement.op[0]} ${rhs})`});`];
      });
      const calculation = compute(updates.map(binding => binding.value), 'patch');
      const patches = [...calculation.declarations, ...updates.map((binding, index) => binding.kind === 'text'
        ? `  text(${binding.id}, String(${calculation.expressions[index]})${binding.range ? `, ${binding.range.prefix}, ${binding.range.suffix}` : ''});`
        : `  attribute(${binding.id}, ${quote(binding.name)}, ${calculation.expressions[index]});`)];
      const actions = [...handler.statements.reduce((out, statement) => remoteNames(statement.value, out), new Set())];
      const remote = actions.length > 0;
      const event = handler.statements.some(statement => eventFields(statement.value).size);
      const lastParameter = event ? 5 : remote ? 4 : updates.some(binding => binding.kind === 'attribute') ? 3 : updates.length ? 2 : 1;
      const parameters = ['v', 'set', 'text', 'attribute', 'remote', 'event'].slice(0, lastParameter + 1).join(', ');
      return { id: handler.id, event: handler.event, async: handler.async, source: handler.source,
        ...(handler.binding ? {binding:handler.binding,declaration:handler.declaration} : {}), ...(handler.preventDefault ? {preventDefault:true} : {}),
        remote, actions, captures, captureNames: captures.map(index => p.fields[index].name), writes: [...writes], computations, symbol: 'run',
        code: `export ${handler.async ? 'async ' : ''}function run(${parameters}) {\n${[...statements, ...patches].join('\n')}\n}\n` };
    }) };
}
export function isResumable(component) {
  const hasHandler = node => (node.handlers?.length ?? 0) > 0 || childrenOf(node).some(hasHandler);
  return component.side === 'client' && hasHandler(component.root);
}
/** Prepare the complete closed graph so child SSR and reachability share one definition cache. */
export function prepareProgram(ir) {
  const components = structuredClone(ir.components).map(component => ({ ...component,
    props: component.props.map(field => ({ ...field, type: valueType(field.type, ir.schemas) })),
    states: component.states.map(field => ({ ...field, type: valueType(field.type, ir.schemas) })) })), definitions = new Map(components.map(component => [component.name, component]));
  if (definitions.size !== components.length) throw new Error('Duplicate component definition');
  const prepared = new Map(components.map(component => [component.name, prepareWithSchemas(component, ir.schemas)]));
  const get = name => { if (!prepared.has(name)) throw new Error(`Unknown component: ${name}`); return prepared.get(name); };
  const reachable = name => {
    const result = [], active = new Set(), visited = new Set();
    function visit(name) {
      get(name); if (active.has(name)) throw new Error('Recursive component graph');
      if (visited.has(name)) return;
      visited.add(name); active.add(name); result.push(name);
      function walk(node) { if (node.kind === 'island') visit(node.component); node.children?.forEach(walk); }
      walk(definitions.get(name).root); active.delete(name);
    }
    visit(name); return result;
  };
  for (const name of definitions.keys()) reachable(name);
  function render(name, props, options = {}, children = () => '', scopes = new Set()) {
    const owner = options.parentScope;
    return get(name).render(props, { ...options, [renderContext]: {
      children, reserve(id) { if (scopes.has(id)) throw new Error(`Duplicate component scope: ${id}`); scopes.add(id); },
      island(node, values, childScope, parentScope, projection) {
        const result = render(node.component, values, { ...options, scopeId: childScope, parentScope: parentScope ?? owner }, projection, scopes);
        return result.html + result.snapshotHtml;
      },
    } });
  }
  return { get, reachable, render,
    renderAll(mounts, { mode = 'resume' } = {}) {
      const scopes = new Set();
      return mounts.map((mount, index) => render(mount.component, mount.props,
        { scopeId: mount.scopeId ?? `s${index}`, mode: mode === 'ssr' ? 'ssr' : mount.mode }, undefined, scopes));
    },
  };
}
export function renderComponent(component, props, { scopeId = 's0', mode = 'resume' } = {}) {
  return prepareComponent(component).render(props, { scopeId, mode });
}
function renderAttribute(name, value) {
  if (name === 'href') safeHref(value);
  if (booleanAttributes.has(name)) return value ? ` ${name}` : '';
  return ` ${name}="${escapeHtml(value)}"`;
}
export function prepareComponent(input) { return prepareWithSchemas(input, []); }
function prepareWithSchemas(input, schemas) {
  // Prepared artifacts own their definition; later caller mutations cannot corrupt a cached plan.
  const component = structuredClone(input);
  if (hasControls(component.root) || hasRegionExpressions(component) || [...component.props, ...component.states].some(field => field.type !== undefined && typeof field.type !== 'string')) {
    const prepared = prepareRegions(component, schemas);
    return { ...prepared, render(props, options = {}) {
      options[renderContext]?.reserve(options.scopeId ?? 's0');
      return prepared.render(props, options);
    } };
  }
  const p = plan(component);
  return { generate: () => structuredClone(generate(component, p)),
    cost: () => structuredClone(analyzeComponentCost(component, p, generate(component, p))),
    render: (props, options) => render(component, p, props, options) };
}
function render(component, p, props, options = {}) {
  const { scopeId = 's0', mode = 'resume', parentScope } = options, context = options[renderContext];
  if (!['resume', 'ssr'].includes(mode)) throw new Error(`Unknown render mode: ${mode}`);
  const resumable = mode === 'resume' && isResumable(component);
  context?.reserve(scopeId);
  validateShape(props, component.props, 'props');
  const env = { ...props };
  for (const state of resumable ? p.states : p.htmlStates) env[state.name] = evaluate(state.initial, env, p.derives);
  const values = resumable ? Object.fromEntries([...p.captured].map(key => [key, env[key]])) : null;
  if (resumable) validateShape(values, p.fields, 'snapshot');
  function render(node, selected) {
    if (p.staticHTML.has(node) && selected === undefined) return p.staticHTML.get(node);
    if (node.kind === 'text') return escapeHtml(node.value);
    if (node.kind === 'slot') return context?.children() ?? '';
    if (node.kind === 'island') {
      if (!context) throw new Error('Nested components require prepareProgram');
      return context.island(node, Object.fromEntries(node.props.map(prop => [prop.name, evaluate(prop.value, env, p.derives)])),
        `${scopeId}/${node.site}`, resumable ? scopeId : parentScope, () => node.children.map(child => render(child)).join(''));
    }
    if (node.kind === 'expression') {
      const text = p.staticText.get(node), binding = p.locations.get(node);
      const value = `${text?.before ?? ''}${escapeHtml(evaluate(node.value, env, p.derives))}${text?.after ?? ''}`;
      return resumable && binding ? `<!--i:${binding.id}-->${value}<!---->` : value;
    }
    let attributes = (node.attributes ?? []).map(attr => {
      if (attr.name === 'value' && ['textarea', 'select'].includes(node.tag)) return '';
      if (attr.name === 'selected' && selected !== undefined && node.tag === 'option') return '';
      let value = evaluate(attr.value, env, p.derives);
      const localId = id => `isle-${encodeURIComponent(scopeId)}:${id}`;
      if (attr.name === 'id') value = localId(value);
      else if (localReferences.has(attr.name)) value = String(value).split(/\s+/).filter(Boolean).map(localId).join(' ');
      return renderAttribute(attr.name, value);
    }).join('');
    const valueBinding = node.attributes?.find(attr => attr.name === 'value');
    if (node.tag === 'select' && valueBinding) {
      selected = String(evaluate(valueBinding.value, env, p.derives));
      if (!node.children.some(child => child.kind === 'element' && child.tag === 'option' && child.attributes.some(attr => attr.name === 'value' && String(evaluate(attr.value, env, p.derives)) === selected))) throw new Error('Select value must match an explicit option value');
    }
    if (node.tag === 'option' && selected !== undefined) {
      const option = valueBinding ? evaluate(valueBinding.value, env, p.derives) : node.children.map(child => child.kind === 'text' ? child.value : '').join('');
      if (String(option) === selected) attributes += ' selected';
    }
    if (node === p.resumeRoot && resumable) attributes += ` data-isle-root="${escapeHtml(scopeId)}"${parentScope === undefined ? '' : ` data-isle-parent="${escapeHtml(parentScope)}"`}`;
    if (resumable) {
      for (const handler of node.handlers ?? []) for (const event of handler.form?.events ?? [handler.event]) attributes += ` data-isle-on-${event}="${escapeHtml(`${scopeId}|${component.name}.${handler.id}${handler.preventDefault ? '|p' : ''}`)}"`;
      if (node.form) attributes += ' data-isle-form="" data-isle-dirty="false" data-isle-touched="" data-isle-pending="false"';
      if (node.formField) attributes += ` data-isle-field="${escapeHtml(node.formField)}"`;
      if (node.formError) attributes += ` data-isle-error="${escapeHtml(node.formError)}"`;
      if (node.formSummary) attributes += ' data-isle-errors=""';
      if (node.formStatus) attributes += ' data-isle-status=""';
      for (const binding of p.locations.get(node) ?? []) attributes += ` data-isle-binding-${binding.id}="${escapeHtml(scopeId)}"`;
    }
    let content;
    if (node.tag === 'textarea' && valueBinding) {
      const value = String(evaluate(valueBinding.value, env, p.derives));
      content = (value.startsWith('\n') ? '\n' : '') + escapeHtml(value);
    } else content = node.children.map(child => render(child, selected)).join('');
    return voidTags.has(node.tag) ? `<${node.tag}${attributes}>` : `<${node.tag}${attributes}>${content}</${node.tag}>`;
  }
  const snapshot = resumable ? [2, p.schemaId, scopeId, p.fields.map(field => values[field.name])] : null;
  return { html: render(p.root), snapshot,
    snapshotHtml: resumable ? `<script type="application/json" data-isle-snapshot="${escapeHtml(scopeId)}">${encodeSnapshot(snapshot)}</script>` : '' };
}
