import { defineSchema, toSchemaIR, type InferSchema } from '../../lib/schema.mjs';
import type { Schema, ServerHost } from '../../lib/contracts.d.ts';

const Signup = defineSchema('Signup', {
  email: { type: 'string', format: 'email' },
  confirmation: { type: 'string', sameAs: 'email' },
  age: { type: 'number', min: 18, integer: true },
  accepted: { type: 'boolean', equals: true },
});
const input: InferSchema<typeof Signup> = { email: 'a@example.com', confirmation: 'a@example.com', age: 21, accepted: true };
const schema: Schema = toSchemaIR(Signup);
void input; void schema;

// @ts-expect-error Number fields cannot have string-length constraints.
defineSchema('Bad', { age: { type: 'number', minLength: 3 } });
// @ts-expect-error Opaque functions are not portable rules.
defineSchema('Bad', { email: { type: 'string', transform: (value: string) => value.trim() } });
// @ts-expect-error References must name another declared field of the same type.
defineSchema('Bad', { email: { type: 'string', sameAs: 'missing' } });
// @ts-expect-error A field cannot refer to itself.
defineSchema('Bad', { email: { type: 'string', sameAs: 'email' } });
// @ts-expect-error References cannot cross primitive types.
defineSchema('Bad', { email: { type: 'string', sameAs: 'age' }, age: { type: 'number' } });
// @ts-expect-error Type inference preserves the number field.
const wrong: InferSchema<typeof Signup> = { ...input, age: '21' };
void wrong;

const host: ServerHost = {
  context: () => ({ subject: 'alice', tenant: 'demo' }),
  policies: { signup: () => true }, validators: { available: { effects: ['db.read'], validate: () => [] } },
  operations: {},
};
void host;
