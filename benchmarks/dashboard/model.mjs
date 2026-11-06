export const teams = ['Platform', 'Design', 'Operations', 'Research'];
export const tasks = Array.from({ length: 64 }, (_, i) => ({
  id: `task-${String(i).padStart(2, '0')}`, team: teams[i % teams.length],
  title: `${teams[i % teams.length]} work package ${String(i + 1).padStart(2, '0')}`,
  initial: 2 + i % 7, rate: 80 + i % 5 * 10,
  description: 'Review the delivery requirements, document the acceptance criteria, and coordinate the implementation with the project owner. Keep this context available while adjusting the plan.',
}));
export const projectSchema = { name: 'ProjectInput', kind: 'schema', fields: [
  { name: 'project', type: 'string', constraints: [{ kind: 'minLength', value: 3 }, { kind: 'maxLength', value: 64 }] },
  { name: 'email', type: 'string', constraints: [{ kind: 'minLength', value: 3 }, { kind: 'maxLength', value: 80 }, { kind: 'format', value: 'email' }] },
  { name: 'confirmation', type: 'string', constraints: [{ kind: 'minLength', value: 3 }, { kind: 'sameAs', field: 'email' }] },
  { name: 'budget', type: 'number', constraints: [{ kind: 'min', value: 100 }, { kind: 'max', value: 100000 }, { kind: 'integer' }] },
  { name: 'accepted', type: 'boolean', constraints: [{ kind: 'equals', value: true }] },
] };
export const fields = [
  { name: 'project', label: 'Project name (required)', type: 'text', minLength: 3, maxLength: 64, required: true, initial: '' },
  { name: 'email', label: 'Owner email (required)', type: 'email', minLength: 3, maxLength: 80, required: true, autoComplete: 'email', initial: '' },
  { name: 'confirmation', label: 'Confirm email (required)', type: 'text', minLength: 3, required: true, initial: '' },
  { name: 'budget', label: 'Budget in credits (required)', type: 'number', min: 100, max: 100000, step: 'any', required: true, initial: '400' },
  { name: 'accepted', label: 'I confirm the project details (required)', type: 'checkbox', required: true, initial: false },
];
export const projectDefaults = { project: '', email: '', confirmation: '', budget: 400, accepted: false };
export const message = issue => ({ minLength: 'This value is too short.', maxLength: 'This value is too long.',
  format: 'Enter a valid email address.', sameAs: 'These values must match.', min: 'This value is too small.',
  max: 'This value is too large.', integer: 'Enter a whole number.', equals: 'Select the required value.',
  type: 'Enter a valid value.', taken: 'This value is already in use.' }[issue?.code] ?? 'Check this value.');
