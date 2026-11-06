/** Public stateless demo. Real authentication/persistence belongs in a separate host adapter. */
export function createDemoHost(ids) {
  const tasks = new Set(ids);
  return {
    context: () => ({ subject: 'public-demo', tenant: 'widget-demo' }),
    policies: {
      'policy.planEditor': (context, id) => context.tenant === 'widget-demo' && tasks.has(id),
      'policy.projectCreator': context => context.tenant === 'widget-demo',
    },
    validators: { 'projects.available': { effects: ['db.read'], validate: ({ input }) => input.project === 'Taken project' ? [{ field: 'project', code: 'taken' }] : [] } },
    operations: {
      'plans.save': { policy: 'policy.planEditor', effects: ['db.write'], commit: ({ args }) => ({ hours: args[1] }) },
      'projects.create': { policy: 'policy.projectCreator', effects: ['db.write'], commit: ({ args }) => ({ project: args[1] }) },
    },
  };
}
