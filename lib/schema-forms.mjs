import { childrenOf } from './template.mjs';
import { toSchemaIR } from './schema.mjs';
const literal = value => ({ kind: typeof value, value });
const attr = (name, value) => ({ name, value: literal(value) });
const read = (node, name) => node.attributes.find(attribute => attribute.name === name)?.value;
const text = value => ({ kind: 'text', value });
const element = (tag, attributes, children = [], extra = {}) => ({ kind: 'element', tag, attributes, children, handlers: [], ...extra });
const events = ['input', 'change', 'focusout', 'invalid', 'submit', 'reset'];
const formApi = new Set('getAttribute hasAttribute setAttribute removeAttribute querySelector querySelectorAll matches closest contains nodeType isConnected parentElement ownerDocument dataset dispatchEvent addEventListener removeEventListener requestSubmit reportValidity checkValidity reset'.split(' '));

export function lowerSchemaForms(ir) {
  const diagnostics = [];
  const fail = (node, message = 'Invalid schema form contract') => { throw { code: 'E_FORM_SCHEMA', message, hint: 'Use one named control per schema field, matching native constraints, and an explicit action with the same input schema.', ...(node.source ?? { start: 0, end: 1 }) }; };
  for (const component of ir.components) {
    let index = 0;
    const used = new Set(), chunks = new Set(), parents = new WeakMap();
    function collect(node) {
      if (node.kind !== 'element') { childrenOf(node).forEach(collect); return; }
      if (read(node, 'id')?.kind === 'string') used.add(read(node, 'id').value);
      node.handlers.forEach(handler => chunks.add(handler.id));
      node.children.forEach(child => { parents.set(child, node); collect(child); });
    }
    collect(component.root);
    function walk(node) {
      if (node.kind !== 'element') { childrenOf(node).forEach(walk); return; }
      const declaration = read(node, 'schema');
      if (!declaration) { if (read(node, 'submit')) fail(node); node.children.forEach(walk); return; }
      const schema = ir.schemas.find(schema => schema.kind === 'schema' && schema.name === declaration.value);
      const action = ir.actions.find(action => action.name === read(node, 'submit')?.value);
      if (node.tag !== 'form' || component.side !== 'client') fail(node, 'Schema forms require a client form element');
      if (!schema) fail(node, `Unknown input schema: ${declaration.value ?? declaration.kind}`);
      if (!action) fail(node, `Unknown server action: ${read(node, 'submit')?.value ?? 'missing submit'}`);
      if (action.inputSchema !== schema.name) fail(node, `Action ${action.name} requires schema ${action.inputSchema}`);
      const id = `__form${index++}`, controls = new Map();
      if (chunks.has(id)) fail(node, `Generated form entry ${id} conflicts with a named handler`); chunks.add(id);
      function controlsIn(child) {
        if (child.kind === 'island' || child.kind === 'slot') fail(child, 'Schema controls must belong to the same client owner');
        if (['select', 'each', 'boundary'].includes(child.kind)) fail(child, 'Schema controls require a fixed DOM shape');
        if (child.kind !== 'element') return;
        if (child.handlers.length || (child !== node && (child.tag === 'form' || read(child, 'schema')))) fail(child);
        if (child !== node && read(child, 'submit')) fail(child, 'Only the form may declare a submit action');
        if (child.tag === 'button' && read(child, 'name')) fail(child, 'Named buttons are outside the fixed schema input contract');
        if (['input', 'textarea', 'select'].includes(child.tag)) {
          const name = read(child, 'name');
          const field = schema.fields.find(field => field.name === name?.value);
          if (name?.kind !== 'string' || !field) fail(child, `Control name must reference a schema field: ${name?.value ?? 'missing name'}`);
          if (formApi.has(name.value)) fail(child, `Field ${name.value} shadows a form DOM API used by the framework`);
          if (controls.has(name.value)) fail(child, `Multiple controls reference field ${name.value}`);
          if (field.type === 'boolean' && child.tag !== 'input') fail(child);
          if (field.type === 'number' && child.tag !== 'input') fail(child);
          if (read(child, 'disabled') || read(child, 'multiple')) fail(child);
          const expected = new Map();
          if (child.tag === 'input') expected.set('type', field.type === 'boolean' ? 'checkbox' : field.type === 'number' ? 'number' : 'text');
          if (child.tag === 'input' && field.type === 'string' && ['text', 'password', 'search', 'tel', 'hidden'].includes(read(child, 'type')?.value)) expected.set('type', read(child, 'type').value);
          if (field.type === 'number') expected.set('step', 'any');
          for (const rule of field.constraints ?? []) {
            if (rule.kind === 'format') expected.set('type', 'email');
            if (rule.kind === 'minLength') { expected.set('minlength', String(rule.value)); if (rule.value > 0) expected.set('required', true); }
            if (rule.kind === 'maxLength') expected.set('maxlength', String(rule.value));
            if (['min', 'max', 'pattern'].includes(rule.kind)) expected.set(rule.kind, String(rule.value));
            if (rule.kind === 'equals' && field.type === 'boolean' && rule.value === true) expected.set('required', true);
          }
          if (field.type === 'number') expected.set('required', true);
          for (const name of ['type', 'required', 'minlength', 'maxlength', 'min', 'max', 'pattern', 'step']) {
            const existing = read(child, name);
            if (existing && (!expected.has(name) || existing.value !== expected.get(name))) fail(child, `Field ${field.name} has a conflicting ${name} attribute`);
          }
          for (const [name, value] of expected) if (!read(child, name)) child.attributes.push(attr(name, value));
          const localId = read(child, 'id')?.value ?? `${id}_${field.name}`;
          if (!read(child, 'id')) { if (used.has(localId)) fail(child); used.add(localId); child.attributes.push(attr('id', localId)); }
          const errorId = `${id}_${field.name}_error`;
          if (used.has(errorId)) fail(child); used.add(errorId);
          child.attributes.push(attr('aria-invalid', 'false'));
          const described = child.attributes.find(attribute => attribute.name === 'aria-describedby');
          if (described) described.value.value += ` ${errorId}`; else child.attributes.push(attr('aria-describedby', errorId));
          child.formField = field.name;
          controls.set(field.name, { node: child, id: localId, errorId });
        }
        child.children.forEach(controlsIn);
      }
      controlsIn(node);
      if (controls.size !== schema.fields.length) fail(node, `Missing controls: ${schema.fields.filter(field => !controls.has(field.name)).map(field => field.name).join(', ')}`);
      const { name: schemaName, fields } = toSchemaIR(schema);
      const publicSchema = { name: schemaName, fields };
      const form = { schema: publicSchema, action: action.name, asyncValidation: Boolean(action.validation), events: [...events] };
      const output = ir.schemas.find(schema => schema.name === action.outputSchema);
      form.output = { name: output.name, fields: output.fields.map(({ name, type }) => ({ name, type })) };
      node.attributes = node.attributes.filter(attribute => !['schema', 'submit'].includes(attribute.name));
      node.attributes.push(attr('method', 'post'), attr('action', `/__isle/action/${action.name}`));
      node.form = form;
      node.handlers.push({ id, event: 'submit', async: false, source: node.source, statements: [], form });
      for (const field of schema.fields) {
        const control = controls.get(field.name);
        let anchor = control.node;
        for (let parent = parents.get(anchor); parent && parent !== node; parent = parents.get(parent)) if (parent.tag === 'label') anchor = parent;
        const parent = parents.get(anchor);
        parent.children.splice(parent.children.indexOf(anchor) + 1, 0,
          element('p', [attr('id', control.errorId), attr('hidden', true)], [], { formError: field.name }));
      }
      node.children.push(element('div', [attr('role', 'alert'), attr('hidden', true), attr('tabindex', '-1')], [], { formSummary: true }));
      node.children.push(element('p', [attr('role', 'status')], [], { formStatus: true }));
    }
    try { walk(component.root); } catch (diagnostic) { if (diagnostic.code !== 'E_FORM_SCHEMA') throw diagnostic; diagnostics.push(diagnostic); }
  }
  return diagnostics;
}
