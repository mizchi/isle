import { childrenOf, references as referenceSet, rewrite } from './template.mjs';
const references = expr => [...referenceSet(expr)];
function walk(node, visit) { visit(node); childrenOf(node).forEach(child => walk(child, visit)); }

/** Erase pure calls and lexical children; preserve client calls as independent SSR/resume owners. */
export function lowerComposition(ir) {
  const definitions = new Map(ir.components.map(component => [component.name, component]));
  // Never let a receiver's loop/lambda capture a caller's lexical fragment.
  const occupied = new Set(JSON.stringify(ir).match(/[A-Za-z_][A-Za-z_0-9]*/g));
  let serial = 0;
  const fresh = () => {
    let name;
    do {name=`IsleLexicalScope${serial++}`;} while(occupied.has(name));
    occupied.add(name);return name;
  };
  const substitute = (value, env) => rewrite(value, env, fresh);
  const fail = (node, code, message, hint) => { throw { code, message, hint, ...(node.source ?? { start: 0, end: 1 }) }; };
  try {
    ir.components = ir.components.map(component => {
      let index = 0, composed = component.props.some(prop => prop.type === 'RenderFragment');
      walk(component.root, node => { if (node.kind === 'component') composed = true; });
      const mutable = new Set(), derives = new Map(component.derives.map(derive => [derive.name, derive.value]));
      walk(component.root, node => node.handlers?.forEach(handler => handler.statements.forEach(statement => mutable.add(statement.target))));
      const changes = (expr, active = new Set()) => references(expr).some(name => {
        if (mutable.has(name)) return true;
        if (!derives.has(name)) return false;
        if (active.has(name)) throw new Error('Cyclic derive');
        return changes(derives.get(name), new Set([...active, name]));
      });
      function constantProjection(node) {
        if (node.handlers?.length || node.attributes?.some(attr => attr.name === 'schema')) return false;
        const values = node.kind === 'expression' ? [node.value] : (node.props ?? node.attributes ?? []).map(prop => prop.value);
        return values.every(value => !changes(value)) && childrenOf(node).every(constantProjection);
      }
      function expand(node, env, path, projection) {
        if (node.kind === 'expression') {
          if (node.value.kind === 'name' && node.value.name === 'children' && projection !== undefined) return projection;
          return [{ ...node, value: substitute(node.value, env) }];
        }
        if (node.kind === 'text' || node.kind === 'slot') return [node];
        if (node.kind === 'select') return [{ ...node,
          cases: node.cases.map(arm => ({ test: substitute(arm.test, env), children: arm.children.flatMap(child => expand(child, env, path, projection)) })),
          fallback: node.fallback.flatMap(child => expand(child, env, path, projection)) }];
        if (node.kind === 'each') {
          const inner = new Map(env);
          const item = path.length ? fresh() : node.item, index = path.length && node.index ? fresh() : node.index;
          inner.set(node.item,{kind:'name',name:item});
          if(node.index) inner.set(node.index,{kind:'name',name:index});
          return [{ ...node, item, index, value: substitute(node.value, env), key: substitute(node.key, inner),
            children: node.children.flatMap(child => expand(child, inner, path, projection)),
            empty: node.empty.flatMap(child => expand(child, env, path, projection)) }];
        }
        if (node.kind === 'boundary') {
          const inner = new Map(env), error = path.length ? fresh() : node.error;
          inner.set(node.error,{kind:'name',name:error});
          return [{ ...node, error, children: node.children.flatMap(child => expand(child, env, path, projection)),
            fallback: node.fallback.flatMap(child => expand(child, inner, path, projection)) }];
        }
        if (node.kind === 'component') {
          const target = definitions.get(node.name), site = `c${index++}`;
          if (!target) fail(node, 'E_COMPONENT_UNKNOWN', `Unknown component ${node.name}`, 'Declare the component in this source.');
          const props = node.props.map(prop => ({ ...prop, value: substitute(prop.value, env) }));
          const children = node.children.flatMap(child => expand(child, env, path, projection));
          if (target.side === 'client') {
            if (props.some(prop => changes(prop.value)) || !children.every(constantProjection)) {
              fail(node, 'E_COMPONENT_CAPTURE', 'Mutable parent values or parent event handlers cannot cross a client owner boundary',
                'Pass immutable initial props and static render fragments. Use a universal child for live parent bindings.');
            }
            return [{ kind: 'island', component: target.name, site, props, children, source: node.source,...(node.layoutContracts ? {layoutContracts:node.layoutContracts} : {}) }];
          }
          const local = new Map(props.map(prop => [prop.name, prop.value]));
          for (const derive of target.derives) local.set(derive.name, substitute(derive.value, local));
          const roots=expand(target.root, local, [...path, site], target.props.some(prop => prop.type === 'RenderFragment') ? children : undefined);
          if(node.layoutContracts) roots[0]={...roots[0],layoutContracts:[...(roots[0].layoutContracts ?? []),...node.layoutContracts]};
          return roots;
        }
        const attributes = node.attributes.map(attr => {
          let value = substitute(attr.value, env);
          if (composed && value.kind === 'string') {
            const local = id => JSON.stringify([path, id]);
            if (attr.name === 'id') value = { ...value, value: local(value.value) };
            else if (['for', 'aria-labelledby', 'aria-describedby', 'aria-errormessage'].includes(attr.name)) value = { ...value, value: value.value.split(/\s+/).map(local).join(' ') };
          }
          return { ...attr, value };
        });
        const handlers = node.handlers.map(handler => ({...handler,
          statements:handler.statements.map(statement => ({...statement,value:substitute(statement.value,env)}))}));
        return [{ ...node, attributes, handlers, children: node.children.flatMap(child => expand(child, env, path, projection)) }];
      }
      const fragment = component.props.some(prop => prop.type === 'RenderFragment');
      return { ...component, props: component.props.filter(prop => prop.type !== 'RenderFragment'),
        ...(fragment ? { children: true } : {}),
        root: expand(component.root, new Map(), [], fragment ? [{ kind: 'slot' }] : undefined)[0] };
    });
    const compiled = new Map(ir.components.map(component => [component.name, component]));
    function checkHTML(node, ancestors, projection = () => {}) {
      if (node.kind === 'slot') { projection(ancestors); return; }
      if (node.kind === 'island') { checkHTML(compiled.get(node.component).root, ancestors, at => node.children.forEach(child => checkHTML(child, at, projection))); return; }
      if (node.kind !== 'element') { childrenOf(node).forEach(child => checkHTML(child, ancestors, projection)); return; }
      if ((['input', 'br'].includes(node.tag) && node.children.length) ||
          (['textarea', 'option'].includes(ancestors.at(-1))) ||
          (ancestors.at(-1) === 'select' && node.tag !== 'option')) {
        fail(node, 'E_COMPONENT_HTML', 'Component expansion is incompatible with this HTML content model', 'Use ordinary containers for nested component roots.');
      }
      if (node.tag === 'form' && ancestors.includes('form')) fail(node, 'E_FORM_NESTING', 'Forms cannot be nested through component calls', 'Move the forms into separate DOM branches.');
      if (node.tag === 'button' && ancestors.includes('form') && !node.attributes.some(attr => attr.name === 'type' && ['button', 'submit', 'reset'].includes(attr.value.value))) fail(node, 'E_FORM_BUTTON_TYPE', 'Buttons in a composed form require an explicit type', 'Declare button type explicitly.');
      if ((ancestors.includes('button') && ['button', 'input', 'select', 'textarea', 'form', 'a'].includes(node.tag)) ||
          (node.tag === 'label' && ancestors.includes('label')) ||
          (ancestors.includes('p') && ['div', 'section', 'form', 'p', 'main', 'article', 'aside', 'h1', 'h2', 'h3', 'ul', 'ol'].includes(node.tag))) {
        fail(node, 'E_COMPONENT_HTML', 'Component expansion creates an invalid HTML nesting', 'Use a container compatible with the child component root.');
      }
      node.children.forEach(child => checkHTML(child, [...ancestors, node.tag], projection));
    }
    ir.components.forEach(component => checkHTML(component.root, []));
    return [];
  } catch (error) { if (!error.code) throw error; return [error]; }
}
