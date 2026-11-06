import { defineSchema } from '../../lib/schema.mjs';

export default defineSchema('Passwords', {
  password: { type: 'string', minLength: 8, maxLength: 64 },
  confirmation: { type: 'string', minLength: 8, maxLength: 64, sameAs: 'password' },
});
