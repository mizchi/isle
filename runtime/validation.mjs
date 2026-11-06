import { compilePattern, primitive } from './schema.mjs';
export { compilePattern } from './schema.mjs';
// HTML's ASCII email grammar; values are checked without coercion or normalization.
const email = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Compile once; caller mutations cannot change the resulting validator. */
export function createValidator(input) {
  const invalid = () => { throw new Error('Invalid validation contract'); };
  if (!input || !Array.isArray(input.fields)) invalid();
  const declared = new Map();
  for (const field of input.fields) {
    if (!field || typeof field.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field.name) ||
      ['__proto__', 'constructor', 'prototype'].includes(field.name) || declared.has(field.name) || !['number', 'string', 'boolean'].includes(field.type)) invalid();
    declared.set(field.name, field.type);
  }
  for (const field of input.fields) for (const rule of field.constraints ?? []) {
    const type = field.type;
    switch (rule.kind) {
      case 'minLength': case 'maxLength': if (type !== 'string' || !Number.isSafeInteger(rule.value) || rule.value < 0) invalid(); break;
      case 'min': case 'max': if (type !== 'number' || typeof rule.value !== 'number' || !Number.isFinite(rule.value)) invalid(); break;
      case 'integer': if (type !== 'number') invalid(); break;
      case 'equals': if (!primitive(type, rule.value)) invalid(); break;
      case 'sameAs': if (rule.field === field.name || declared.get(rule.field) !== type) invalid(); break;
      case 'pattern': if (type !== 'string' || typeof rule.value !== 'string') invalid(); break;
      case 'format': if (type !== 'string' || rule.value !== 'email') invalid(); break;
      default: invalid();
    }
  }
  const schema = structuredClone(input), names = new Set(schema.fields.map(field => field.name));
  const fields = schema.fields.map(field => ({ ...field, checks: (field.constraints ?? []).map(rule => {
    switch (rule.kind) {
      case 'minLength': return [rule.kind, value => value.length >= rule.value];
      case 'maxLength': return [rule.kind, value => value.length <= rule.value];
      case 'min': return [rule.kind, value => value >= rule.value];
      case 'max': return [rule.kind, value => value <= rule.value];
      case 'integer': return [rule.kind, Number.isSafeInteger];
      case 'equals': return [rule.kind, value => value === rule.value];
      case 'sameAs':
        if (!names.has(rule.field)) throw new Error('Unknown validation reference');
        return [rule.kind, (value, data) => value === data[rule.field]];
      case 'format':
        if (rule.value !== 'email') throw new Error('Unknown format');
        return [rule.kind, value => email.test(value)];
      case 'pattern': {
        const expression = compilePattern(rule.value);
        return [rule.kind, value => expression.test(value)];
      }
      default: throw new Error('Unknown validation rule');
    }
  }) }));
  return data => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [{ field: '', code: 'type' }];
    const issues = [];
    if (Object.keys(data).some(name => !names.has(name))) issues.push({ field: '', code: 'unknownField' });
    for (const field of fields) {
      const value = data[field.name];
      if (!Object.hasOwn(data, field.name) || !primitive(field.type, value)) { issues.push({ field: field.name, code: 'type' }); continue; }
      for (const [code, check] of field.checks) if (!check(value, data)) issues.push({ field: field.name, code });
    }
    return issues;
  };
}

/** Host validators may return public codes for declared fields, never arbitrary payloads. */
export function checkIssues(issues, fields) {
  if (!Array.isArray(issues) || issues.length > fields.length * 8) throw new Error('Invalid validation issues');
  return issues.map(issue => {
    if (!issue || Object.keys(issue).some(key => !['field', 'code'].includes(key)) ||
      !fields.some(field => field.name === issue.field) || typeof issue.code !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(issue.code)) throw new Error('Invalid validation issue');
    return { field: issue.field, code: issue.code };
  });
}
