// Local demo only: a fixed server principal, not a login implementation.
const document = { id: 'demo', title: 'Draft', owner: 'alice', tenant: 'demo' };
export const host = {
  context: () => ({ subject: 'alice', tenant: 'demo' }),
  policies: { 'policy.documentEditor': (context, id) => id === document.id && context.subject === document.owner && context.tenant === document.tenant },
  operations: { 'documents.rename': {
    policy: 'policy.documentEditor', effects: ['db.write'],
    prepare: async () => undefined,
    commit: ({ permit, args }) => {
      if (permit.target !== document.id) throw new Error('Wrong resource');
      document.title = args[1];
      return { id: document.id, title: document.title };
    },
  } },
};
