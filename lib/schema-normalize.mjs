import { primitive, compilePattern } from '../runtime/schema.mjs';
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
export const schemaError = path => { throw new Error(`Invalid validation contract: ${path}`); };

/** Only closed data records belong to the portable contract. This is not a JS sandbox. */
export function dataRecord(value, keys, path) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) schemaError(path);
}

/** Own a normalized copy. Rule and field declaration order define deterministic issue order. */
export function normalizeFields(input) {
  if (!Array.isArray(input)) schemaError('fields');
  const declared = new Map();
  for (const field of input) {
    dataRecord(field, ['name', 'type', 'optional', 'constraints'], 'field');
    if (typeof field.name !== 'string' || !identifier.test(field.name) || forbidden.has(field.name) || declared.has(field.name) ||
      !['number', 'string', 'boolean'].includes(field.type) || (field.optional !== undefined && field.optional !== false)) schemaError(`field ${field.name}`);
    declared.set(field.name, field.type);
  }
  return input.map(field => {
    if (field.constraints !== undefined && !Array.isArray(field.constraints)) schemaError(field.name);
    const seen = new Set(), type = field.type;
    const constraints = (field.constraints ?? []).map(rule => {
      dataRecord(rule, ['kind', 'value', 'field', 'source'], field.name);
      const path = `${field.name}.${rule.kind}`;
      if (seen.has(rule.kind)) schemaError(path);
      seen.add(rule.kind);
      const argument = rule.kind === 'sameAs' ? 'field' : rule.kind === 'integer' ? null : 'value';
      if (Object.hasOwn(rule, 'value') !== (argument === 'value') || Object.hasOwn(rule, 'field') !== (argument === 'field')) schemaError(path);
      switch (rule.kind) {
        case 'minLength': case 'maxLength': if (type !== 'string' || !Number.isSafeInteger(rule.value) || rule.value < 0) schemaError(path); break;
        case 'min': case 'max': if (type !== 'number' || typeof rule.value !== 'number' || !Number.isFinite(rule.value)) schemaError(path); break;
        case 'integer': if (type !== 'number') schemaError(path); break;
        case 'equals': if (!primitive(type, rule.value)) schemaError(path); break;
        case 'sameAs': if (rule.field === field.name || declared.get(rule.field) !== type) schemaError(path); break;
        case 'pattern': if (type !== 'string') schemaError(path); compilePattern(rule.value); break;
        case 'format': if (type !== 'string' || rule.value !== 'email') schemaError(path); break;
        default: schemaError(path);
      }
      return { kind: rule.kind, ...(argument ? { [argument]: rule[argument] } : {}) };
    });
    for (const [lower, upper] of [['minLength', 'maxLength'], ['min', 'max']]) {
      const low = constraints.find(rule => rule.kind === lower), high = constraints.find(rule => rule.kind === upper);
      if (low && high && low.value > high.value) schemaError(`${field.name}.${upper}`);
    }
    return { name: field.name, type, ...(constraints.length ? { constraints } : {}) };
  });
}
