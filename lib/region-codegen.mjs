import { checkedIdentifier as ident } from './shape.mjs';
import { createHash } from 'node:crypto';
import { childrenOf, references, expressionChildren } from './template.mjs';
import { validValue, arrayIndex } from '../runtime/value.mjs';
import { escape, rangeHTML, keyed } from '../runtime/regions.mjs';
import { binaryValue } from './static.mjs';
import { encodeSnapshot, safeHref } from './html.mjs';
import { costMetrics } from './cost-plan.mjs';
const q = JSON.stringify;
const booleans = new Set(['disabled', 'required', 'checked', 'readonly', 'multiple', 'selected', 'hidden']);
const voids = new Set(['br', 'input']);
export function valueType(type, schemas) {
  if (typeof type !== 'string' || ['number', 'string', 'boolean'].includes(type)) return type;
  if (type.endsWith('[]')) return { array: valueType(type.slice(0, -2), schemas) };
  const schema = schemas.find(schema => schema.name === type);
  if (!schema) throw new Error(`Unknown closed type: ${type}`);
  return { record: Object.fromEntries(schema.fields.map(field => [field.name, valueType(field.type, schemas)])) };
}
export function prepareRegions(component) {
  [...component.props, ...component.states, ...component.derives].forEach(field => ident(field.name));
  const fields = [...component.props, ...component.states].map(field => ({ name: field.name, type: field.type }));
  const slots = new Map(fields.map((field, i) => [field.name, i]));
  const derives = new Map(component.derives.map(derive => [derive.name, derive.value]));
  const specs = [], handlers = [], nodes = new WeakMap();
  const deps = (expr, locals = new Map(), seen = new Set()) => {
    const out = new Set();
    for (const name of references(expr)) {
      if (locals.has(name)) out.add('$local');
      else if (derives.has(name)) {
        if (seen.has(name)) throw new Error('Cyclic derive');
        for (const key of deps(derives.get(name), locals, new Set([...seen, name]))) out.add(key);
      } else out.add(name);
    }
    return out;
  };
  function code(expr, locals) {
    switch (expr.kind) {
      case 'number': case 'string': case 'boolean': return q(expr.value);
      case 'name':
        ident(expr.name);
        if (!locals.has(expr.name) && !derives.has(expr.name) && !slots.has(expr.name)) throw new Error('Unknown region expression name');
        return locals.has(expr.name) ? `l[${locals.get(expr.name)}]` : derives.has(expr.name) ? `(${code(derives.get(expr.name), locals)})` : `v[${slots.get(expr.name)}]`;
      case 'binary':
        if (!['+', '-', '*', '/', '===', '!==', '<', '>', '<=', '>=', '&&', '||'].includes(expr.op)) throw new Error('Unsupported region expression operator');
        return `(${code(expr.left, locals)} ${expr.op} ${code(expr.right, locals)})`;
      case 'property': return `(${code(expr.object, locals)})[${q(ident(expr.key))}]`;
      case 'index': return `arrayIndex(${code(expr.object, locals)},${code(expr.index, locals)})`;
      case 'not': return `(!${code(expr.value, locals)})`;
      case 'array': return `[${expr.values.map(expr => code(expr, locals)).join(',')}]`;
      case 'record': return `{${expr.fields.map(field => `${q(ident(field.name))}:${code(field.value, locals)}`).join(',')}}`;
      case 'event':
        if (!['value', 'checked', 'invalid', 'validationMessage'].includes(expr.field)) throw new Error('Unsupported region event field');
        return `event.${expr.field}`;
      case 'remote': return `(await remote(${q(ident(expr.name))},{${expr.fields.map(field => `${q(ident(field.name))}:${code(field.value, locals)}`).join(',')}}))`;
      default: throw new Error(`Unsupported region expression ${expr.kind}`);
    }
  }
  function evaluate(expr, v, l, locals) {
    switch (expr.kind) {
      case 'number': case 'string': case 'boolean': return expr.value;
      case 'name': return locals.has(expr.name) ? l[locals.get(expr.name)] : derives.has(expr.name) ? evaluate(derives.get(expr.name), v, l, locals) : v[slots.get(expr.name)];
      case 'binary': {
        const left = evaluate(expr.left, v, l, locals);
        if (expr.op === '&&' && !left || expr.op === '||' && left) return left;
        return binaryValue(expr.op, left, evaluate(expr.right, v, l, locals));
      }
      case 'property': return evaluate(expr.object, v, l, locals)[expr.key];
      case 'index': return arrayIndex(evaluate(expr.object, v, l, locals), evaluate(expr.index, v, l, locals));
      case 'not': return !evaluate(expr.value, v, l, locals);
      case 'array': return expr.values.map(expr => evaluate(expr, v, l, locals));
      case 'record': return Object.fromEntries(expr.fields.map(field => [field.name, evaluate(field.value, v, l, locals)]));
      default: throw new Error('Effect in render expression');
    }
  }
  const expressions = node => node.kind === 'expression' ? [node.value] : node.kind === 'select' ? node.cases.map(arm => arm.test) : node.kind === 'each' ? [node.value, node.key] : (node.attributes ?? node.props ?? []).map(attr => attr.value);
  function block(children, locals = new Map()) {
    const id = specs.length, spec = { id, children, locals, dependencies: new Set() }; specs.push(spec);
    function inspect(node) {
      if (node.kind === 'element' && !'a article aside b br button code details div em footer form h1 h2 h3 header input label li main nav ol output p pre section small span strong summary ul'.split(' ').includes(node.tag)) throw new Error('Unsupported region HTML tag');
      for (const attr of node.attributes ?? []) {
        if (!/^[a-z][a-z0-9-]*$/.test(attr.name) || attr.name.startsWith('on') || attr.name.startsWith('data-isle-') || ['srcdoc', 'style', 'src'].includes(attr.name)) throw new Error('Unsupported region attribute');
        if (attr.name === 'href' && (node.tag !== 'a' || component.side === 'client' && attr.value.kind !== 'string')) throw new Error('Client region links require literal destinations');
        if (attr.name === 'href' && attr.value.kind === 'string') safeHref(attr.value.value);
      }
      (node.kind === 'each' ? [node.value] : expressions(node)).forEach(expr => code(expr, locals));
      if (node.kind === 'island' || node.kind === 'slot' || node.form) throw new Error('Region blocks currently require universal children and native DOM; client owners, render fragments and schema forms need an explicit static sibling owner');
      expressions(node).forEach(expr => deps(expr, locals).forEach(name => spec.dependencies.add(name)));
      if (node.kind === 'select') {
        nodes.set(node, { specs: [...node.cases.map(arm => block(arm.children, locals)), block(node.fallback, locals)] }); return;
      }
      if (node.kind === 'each') {
        const inner = new Map(locals); inner.set(node.item, locals.size); inner.set(node.index || '$index' + id, locals.size + 1);
        nodes.set(node, { body: block(node.children, inner), empty: block(node.empty, locals) }); return;
      }
      if (node.kind === 'boundary') {
        const inner = new Map(locals); inner.set(node.error, locals.size);
        nodes.set(node, { body: block(node.children, locals), fallback: block(node.fallback, inner) }); return;
      }
      node.handlers?.forEach(handler => {
        if (component.side !== 'client') throw new Error('Only client components can own handlers');
        if (!['click', 'input', 'change', 'submit', 'invalid'].includes(handler.event)) throw new Error('Unsupported region event');
        for (const statement of handler.statements) {
          if (!component.states.some(state => state.name === statement.target) || !['=', '+=', '-='].includes(statement.op)) throw new Error('Unsupported region state mutation');
          code(statement.value, locals);
        }
        handlers.push({ ...handler, locals, id: component.name + '.' + handler.id });
      });
      childrenOf(node).forEach(inspect);
    }
    children.forEach(inspect);
    return spec;
  }
  if (component.side !== 'client' && component.states.length) throw new Error('Only client components can own state');
  const top = block([component.root]);
  const mutable = new Set(handlers.flatMap(handler => handler.statements.map(statement => statement.target)));
  const dynamic = (expr, locals) => [...deps(expr, locals)].some(name => name === '$local' || mutable.has(name));
  const features = { select: false, each: false, boundary: false };
  (function scan(node) { if (Object.hasOwn(features, node.kind)) features[node.kind] = true; childrenOf(node).forEach(scan); })(component.root);
  // Dependents include inactive factories: a later transition needs current values for every arm.
  const schemaId = createHash('sha256').update(q(['regions/1', component])).digest('hex').slice(0, 16);
  function html(spec, v, l, id, scope, resume) {
    let serial = 0;
    const ev = expr => evaluate(expr, v, l, spec.locals);
    function render(node) {
      const site = serial++;
      if (node.kind === 'text') return escape(node.value);
      if (node.kind === 'expression') {
        const value = escape(ev(node.value));
        return resume && dynamic(node.value, spec.locals) ? `<!--t:${id}|${site}-->${value}<!---->` : value;
      }
      if (node.kind === 'select') {
        const arm = node.cases.findIndex(arm => ev(arm.test)), index = arm < 0 ? node.cases.length : arm;
        const child = nodes.get(node).specs[index], childId = `${id}.${site}.${index}`, result = html(child, v, l, childId, scope, resume);
        return resume ? rangeHTML(childId, result) : result;
      }
      if (node.kind === 'each') {
        const { body, empty } = nodes.get(node), rows = keyed(ev(node.value), (item, index) => evaluate(node.key, v, [...l, item, index], body.locals));
        const result = (rows.length ? rows : [['empty', undefined, -1]]).map(([key, value, index]) => {
          const childId = `${id}.${site}.${key}`, result = html(rows.length ? body : empty, v, rows.length ? [...l, value, index] : l, childId, scope, resume);
          return resume ? rangeHTML(childId, result) : result;
        }).join('');
        return resume ? rangeHTML(`${id}.${site}`, result) : result;
      }
      if (node.kind === 'boundary') {
        const { body, fallback } = nodes.get(node); let result, arm = 0;
        try { result = html(body, v, l, `${id}.${site}.0`, scope, resume); }
        catch { arm = 1; result = html(fallback, v, [...l, 'Render failed'], `${id}.${site}.1`, scope, resume); }
        return resume ? rangeHTML(`${id}.${site}.${arm}`, result) : result;
      }
      let attributes = node.attributes.map(attr => {
        let value = ev(attr.value);
        if (attr.name === 'href') safeHref(value);
        const local = value => `isle-${encodeURIComponent(scope)}:${encodeURIComponent(id)}:${value}`;
        if (attr.name === 'id') value = local(value);
        else if (['for', 'aria-labelledby', 'aria-describedby', 'aria-errormessage'].includes(attr.name)) value = String(value).split(/\s+/).map(local).join(' ');
        return booleans.has(attr.name) ? value ? ` ${attr.name}` : '' : ` ${attr.name}="${escape(value)}"`;
      }).join('');
      if (resume) {
        const locator = node.attributes.some(attr => dynamic(attr.value, spec.locals));
        if (locator || node.handlers.length) attributes += ` data-isle-frame="${escape(id)}"`;
        if (locator) attributes += ` data-isle-node="${site}"`;
        if (node === component.root) attributes += ` data-isle-root="${escape(scope)}"`;
        node.handlers.forEach(handler => { attributes += ` data-isle-on-${handler.event}="${escape(scope + '|' + component.name + '.' + handler.id)}"`; });
      }
      return `<${node.tag}${attributes}>` + (voids.has(node.tag) ? '' : node.children.map(render).join('') + `</${node.tag}>`);
    }
    return spec.children.map(render).join('');
  }
  const moduleId = `virtual:isle-regions/${component.name}`;
  function nodeDeps(node, locals) {
    const result = new Set();
    const add = values => values.forEach(name => result.add(name));
    if (node.kind === 'each') {
      add(deps(node.value, locals));
      const body = nodes.get(node).body;
      for (const child of node.children) for (const name of nodeDeps(child, body.locals)) if (name !== '$local') result.add(name);
      node.empty.forEach(child => add(nodeDeps(child, locals)));
    } else if (node.kind === 'boundary') {
      node.children.forEach(child => add(nodeDeps(child, locals)));
      for (const child of node.fallback) for (const name of nodeDeps(child, nodes.get(node).fallback.locals)) if (name !== '$local' || locals.size) result.add(name);
    } else {
      expressions(node).forEach(expr => add(deps(expr, locals)));
      childrenOf(node).forEach(child => add(nodeDeps(child, locals)));
    }
    return result;
  }
  function compileBlock(spec) {
    let serial = 0; const patches = [];
    const changed = expr => { const names = [...deps(expr, spec.locals)]; return names.length ? `(!d||${names.map(name => `d.has(${q(name)})`).join('||')})` : '!d'; };
    const exp = expr => code(expr, spec.locals);
    const control = (node, operation) => {
      const dependencies = [...nodeDeps(node, spec.locals)];
      patches.push(`if(!d${dependencies.map(name => `||d.has(${q(name)})`).join('')}){${operation}}`);
    };
    function render(node) {
      const site = serial++;
      if (node.kind === 'text') return q(escape(node.value));
      if (node.kind === 'expression') {
        if (!dynamic(node.value, spec.locals)) return `escape(${exp(node.value)})`;
        patches.push(`if(${changed(node.value)}) c.text(f,${site},${exp(node.value)});`);
        return `${q('<!--t:')}+id+${q('|' + site + '-->')}+escape(${exp(node.value)})+${q('<!---->')}`;
      }
      if (node.kind === 'select') {
        const options = nodes.get(node).specs;
        const arm = node.cases.map((arm, i) => `${exp(arm.test)}?${i}:`).join('') + node.cases.length;
        control(node, `c.select(f,${site},${arm},[${options.map(spec => `b${spec.id}`).join(',')}],v,l,d);`);
        return `(()=>{const a=${arm},s=[${options.map(spec => `b${spec.id}`).join(',')}][a],k=id+${q('.' + site + '.')}+a;return rangeHTML(k,s[0](v,l,k,scope));})()`;
      }
      if (node.kind === 'each') {
        const { body, empty } = nodes.get(node);
        const rows = `keyed(${exp(node.value)},(item,index)=>{const l=[...argumentsLocals,item,index];return ${code(node.key, body.locals)}})`;
        const expression = rows.replace('argumentsLocals', 'parentLocals');
        control(node, `const parentLocals=l; c.each(f,${site},()=>${expression},${changed(node.value)},b${body.id},b${empty.id},v,l,d);`);
        return `(()=>{const parentLocals=l,rows=${expression},entries=rows.length?rows:[['empty',null,-1]];return rangeHTML(id+${q('.' + site)},entries.map(([key,item,index])=>{const k=id+${q('.' + site + '.')}+key,s=rows.length?b${body.id}:b${empty.id},locals=rows.length?[...l,item,index]:l;return rangeHTML(k,s[0](v,locals,k,scope))}).join(''));})()`;
      }
      if (node.kind === 'boundary') {
        const { body, fallback } = nodes.get(node);
        control(node, `c.boundary(f,${site},b${body.id},b${fallback.id},v,l,d);`);
        return `(()=>{try {const k=id+${q('.' + site + '.0')};return rangeHTML(k,b${body.id}[0](v,l,k,scope));}catch{const k=id+${q('.' + site + '.1')};return rangeHTML(k,b${fallback.id}[0](v,[...l,'Render failed'],k,scope));}})()`;
      }
      let attrs = [];
      for (const attr of node.attributes) {
        const value = exp(attr.value);
        if (dynamic(attr.value, spec.locals)) patches.push(`if(${changed(attr.value)}) c.attribute(f,${site},${q(attr.name)},${value});`);
        if (['id', 'for', 'aria-labelledby', 'aria-describedby', 'aria-errormessage'].includes(attr.name)) {
          const valueCode = attr.name === 'id' ? `local(${value})` : `String(${value}).split(/\\s+/).map(local).join(' ')`;
          attrs.push(`${q(' ' + attr.name + '="')}+escape(${valueCode})+'"'`);
        } else attrs.push(booleans.has(attr.name) ? `(${value}?${q(' ' + attr.name)}:'')` : `${q(' ' + attr.name + '="')}+escape(${value})+'"'`);
      }
      const eventAttrs = node.handlers.map(handler => `+${q(' data-isle-on-' + handler.event + '="')}+escape(scope+${q('|' + component.name + '.' + handler.id)})+'"'`).join('');
      const locator = node.attributes.some(attr => dynamic(attr.value, spec.locals));
      const markers = `''${locator || node.handlers.length ? `+${q(' data-isle-frame="')}+escape(id)+'"'` : ''}${locator ? `+${q(' data-isle-node="' + site + '"')}` : ''}${eventAttrs}` + (node === component.root ? `+${q(' data-isle-root="')}+escape(scope)+'"'` : '');
      const opening = `${q('<' + node.tag)}${attrs.map(attr => '+(' + attr + ')').join('')}+(${markers})+'>'`;
      return voids.has(node.tag) ? opening : opening + '+' + [...node.children.map(render), q('</' + node.tag + '>')].join('+');
    }
    const markup = spec.children.map(render).join('+') || "''";
    return `const b${spec.id}=[function(v,l,id,scope){const local=value=>'isle-'+encodeURIComponent(scope)+':'+encodeURIComponent(id)+':'+value;return ${markup};},function(c,f,v,l,d){${patches.join('\n')}}];`;
  }
  const moduleCode = `import { regionContext, escape, rangeHTML, keyed } from './isle-region-runtime.mjs';\nimport { arrayIndex } from './isle-value-runtime.mjs';\n${specs.map(compileBlock).join('\n')}\nexport function prepare(event,v){return regionContext(event.region[0],event.region[1],b0,v);}\n`;
  const analysis = { folded: [], aliases: [], serverStates: component.states.map(state => state.name), htmlStates: component.states.map(state => state.name), staticFragments: 0, dynamicBindings: 0,
    snapshotSlots: fields.map(field => field.name), skippedInitializers: [], textRanges: [], resumeRoot: { tag: component.root.tag, depth: 0 }, regions: specs.length };
  function generated() {
    return { name: component.name, schemaId, fields, analysis, regions: { id: moduleId, code: moduleCode, features }, bindings: [], events: [...new Set(handlers.map(handler => handler.event))],
      handlers: handlers.map(handler => {
        const actions = new Set();
        function remotes(expr) { if (expr.kind === 'remote') actions.add(expr.name); expressionChildren(expr).forEach(remotes); }
        handler.statements.forEach(statement => remotes(statement.value));
        const statements = handler.statements.map(statement => {
          const rhs = code(statement.value, handler.locals), index = slots.get(statement.target);
          return `set(${index},${statement.op === '=' ? rhs : `v[${index}]${statement.op[0]}(${rhs})`});`;
        }).join('\n');
        const writes = [...new Set(handler.statements.map(statement => statement.target))];
        return { id: handler.id, event: handler.event, async: handler.async, source: handler.source, remote: actions.size > 0, actions: [...actions], captures: fields.map((_, i) => i), captureNames: fields.map(field => field.name), writes, computations: [], symbol: 'run',
          code: `import { prepare } from ${q(moduleId)};\nimport { arrayIndex } from './isle-value-runtime.mjs';\nexport ${handler.async ? 'async ' : ''}function run(v,set,text,attribute,remote,event){const c=prepare(event,v),l=c.locals(event.element);${statements}\nevent.region[2](c.prepare(v,new Set(${q(writes)})));}\n` };
      }) };
  }
  function render(props, { scopeId = 's0', mode = 'resume', parentScope } = {}) {
    if (!['ssr', 'resume'].includes(mode)) throw new Error('Unknown render mode');
    const values = fields.map(field => props[field.name]);
    if (Object.keys(props).some(name => !component.props.some(field => field.name === name))) throw new Error('Unknown prop');
    for (const field of component.props) if (!validValue(field.type, props[field.name])) throw new Error(`Invalid prop ${field.name}`);
    const resumable = mode === 'resume' && component.side === 'client' && handlers.length > 0;
    const needed = nodeDeps(component.root, new Map());
    for (const name of needed) {
      const state = component.states.find(state => state.name === name);
      if (state) deps(state.initial).forEach(name => needed.add(name));
    }
    for (const state of component.states) if (resumable || needed.has(state.name)) values[slots.get(state.name)] = evaluate(state.initial, values, [], new Map());
    values.forEach((value, index) => { if ((resumable || needed.has(fields[index].name) || component.props.some(field => field.name === fields[index].name)) && !validValue(fields[index].type, value)) throw new Error('Invalid state'); });
    const content = html(top, values, [], '0', scopeId, resumable), snapshot = resumable ? [2, schemaId, scopeId, values] : null;
    // Put the outer range inside the native owner root so its lifetime follows the owner.
    const markup = resumable ? content.replace(/^(<[^>]+>)/, '$1<!--r:0-->').replace(/(<\/[^>]+>)$/, '<!--e:0-->$1') : content;
    return { html: resumable && parentScope !== undefined ? markup.replace(' data-isle-root=', ` data-isle-parent="${escape(parentScope)}" data-isle-root=`) : markup, snapshot, snapshotHtml: snapshot ? `<script type="application/json" data-isle-snapshot="${escape(scopeId)}">${encodeSnapshot(snapshot)}</script>` : '' };
  }
  function cost() {
    const reason = 'Control-flow work is data-dependent; region bounds are not yet implemented.';
    const work = Object.fromEntries(costMetrics.map(metric => [metric, { kind: 'unknown', reason }]));
    const restore = { owners: handlers.length ? 1 : 0, snapshotSlots: fields.length, bindingLocators: 0, childOwners: 0 };
    return { component: component.name, schemaId, side: component.side, localElements: null, childSites: [], restore, entries: generated().handlers.map(({ code, computations, regions, captureNames, ...handler }) => ({ ...handler, captures: captureNames, component: component.name, scope: 'one-owner/generated-handler', restore, work, phases: [], updates: [], reasons: [], unknownCosts: [{ code: 'control-flow', reason }] })) };
  }
  return { generate: () => structuredClone(generated()), render, cost };
}
