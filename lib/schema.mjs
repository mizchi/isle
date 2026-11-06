import { dataRecord, normalizeFields, schemaError } from './schema-normalize.mjs';
const rules = ['minLength', 'maxLength', 'min', 'max', 'integer', 'equals', 'sameAs', 'pattern', 'format'];

/** Build-time, language-neutral data. Request-dependent behavior belongs to Action.validation. */
export function toSchemaIR(input) {
  dataRecord(input, ['name', 'kind', 'fields'], 'schema');
  if (typeof input.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.name) || !['schema', 'view'].includes(input.kind)) schemaError('schema name/kind');
  const fields = normalizeFields(input.fields);
  for (const field of fields) for (const rule of field.constraints ?? []) if (rule.kind === 'pattern') new RegExp(rule.value, 'v');
  return { name: input.name, kind: input.kind, fields };
}

/** Experimental TS authoring frontend; no arbitrary predicates, coercions or transforms. */
export function defineSchema(name, input) {
  if (!input || typeof input !== 'object') schemaError('fields');
  dataRecord(input, Object.keys(input), 'fields');
  const fields = Object.entries(input).map(([name, definition]) => {
    dataRecord(definition, ['type', ...rules], name);
    const constraints = Object.entries(definition).filter(([key]) => key !== 'type').map(([kind, value]) => {
      if (kind === 'integer') { if (value !== true) schemaError(`${name}.integer`); return { kind }; }
      return { kind, [kind === 'sameAs' ? 'field' : 'value']: value };
    });
    return { name, type: definition.type, constraints };
  });
  return toSchemaIR({ name, kind: 'schema', fields });
}
