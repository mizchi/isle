const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function checkedIdentifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) || forbidden.has(value)) throw new Error(`Invalid identifier: ${value}`);
  return value;
}
/** Validate boundary records using Web-standard primitives, without loading code generation. */
export function validateShape(value, fields, label = 'value') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a record`);
  for (const key of Object.keys(value)) if (forbidden.has(key) || !fields.some(field => field.name === key)) throw new Error(`${label}: unknown field ${key}`);
  for (const field of fields) {
    checkedIdentifier(field.name);
    const actual = value[field.name];
    if (field.optional && actual === undefined) continue;
    if (!['number', 'string', 'boolean'].includes(field.type) || typeof actual !== field.type ||
      (field.type === 'number' && (!Number.isFinite(actual) || Object.is(actual, -0)))) throw new Error(`${label}.${field.name} must be ${field.type}`);
  }
  return value;
}
