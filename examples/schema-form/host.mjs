// Local demo only: the request principal is fixed. Registration is an in-memory write.
const accounts = new Set(['taken@example.com']);
export const host = {
  context: () => ({ subject: 'demo', tenant: 'local' }),
  policies: { 'policy.signup': context => context.tenant === 'local' },
  validators: { 'accounts.available': { effects: ['db.read'],
    validate: async ({ input }) => accounts.has(input.email) ? [{ field: 'email', code: 'taken' }] : [] } },
  operations: { 'accounts.register': { policy: 'policy.signup', effects: ['db.write'],
    commit: ({ args }) => { accounts.add(args[1]); return { email: args[1] }; } } },
};
