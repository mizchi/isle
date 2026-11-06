import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { defineSchema, toSchemaIR } from '../lib/schema.mjs';
import { createValidator } from '../runtime/validation.mjs';

test('DSL and a closed TS declaration produce identical portable schema IR and issues', () => {
  const dsl = requireIR(compile(`schema Signup {
    email: string minLength(3) maxLength(80) format("email");
    confirmation: string sameAs(email);
    age: number min(18) integer(); accepted: boolean equals(true);
  }`)).schemas[0];
  const ts = defineSchema('Signup', {
    email: { type: 'string', minLength: 3, maxLength: 80, format: 'email' },
    confirmation: { type: 'string', sameAs: 'email' },
    age: { type: 'number', min: 18, integer: true }, accepted: { type: 'boolean', equals: true },
  });
  assert.deepEqual(toSchemaIR(dsl), ts);
  assert.deepEqual(toSchemaIR(ts), ts);
  assert.doesNotMatch(JSON.stringify(ts), /source|optional|validation|effects/);
  const left = createValidator(dsl), right = createValidator(ts);
  for (const value of [
    { email: 'a@example.com', confirmation: 'a@example.com', age: 21, accepted: true },
    { email: 'bad', confirmation: 'different', age: 17.5, accepted: false },
    { email: 'a@example.com', confirmation: 'a@example.com', age: -0, accepted: true },
    { email: 'a@example.com', confirmation: 'a@example.com', age: NaN, accepted: true },
  ]) assert.deepEqual(left(value), right(value));
});

test('schema IR rejects opaque behavior, unsupported types and contradictory rules', () => {
  for (const fields of [
    { x: { type: 'string', transform: value => value.trim() } },
    { x: { type: 'string', minLength: 8, maxLength: 2 } },
    { x: { type: 'string', sameAs: 'missing' } },
    { x: { type: 'number', minLength: 3 } },
    { x: { type: 'string', optional: true } },
    { x: { type: 'object' } },
    { x: { type: 'string', pattern: '[a&&b]' } },
    { x: { type: 'number', integer: false } },
    { x: { type: 'number', equals: -0 } },
  ]) assert.throws(() => defineSchema('Bad', fields), /contract|pattern/i);
  const schema = { name: 'Bad', kind: 'schema', fields: [{ name: 'x', type: 'string' }] };
  assert.throws(() => toSchemaIR({ ...schema, validation: { name: 'private.check' } }), /contract/i);
  assert.throws(() => toSchemaIR({ ...schema, fields: [{ name: 'x', type: 'string',
    constraints: [{ kind: 'minLength', value: 2 }, { kind: 'minLength', value: 3 }] }] }), /contract/i);
});

test('normalization owns its data and ignores the placement of the type property', () => {
  const fields = { x: { type: 'string', minLength: 3 } };
  const schema = defineSchema('Owned', fields);
  fields.x.minLength = 8;
  assert.deepEqual(createValidator(schema)({ x: 'abcd' }), []);
  const unordered = defineSchema('Owned', { x: { minLength: 3, type: 'string' } });
  assert.deepEqual(unordered, schema);
});
