import { defineSchema } from '../../../lib/schema.mjs';

export default defineSchema('Registration', {
  email: { type: 'string', minLength: 3, maxLength: 80, format: 'email' },
  accepted: { type: 'boolean', equals: true },
});
