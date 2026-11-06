globalThis.resourceModuleLoads = (globalThis.resourceModuleLoads ?? 0) + 1;
export function setup({ root, owner, id }) {
  const state = globalThis.resourceProbe ??= { contexts: [], released: [], aborted: [], hits: [], pending: {} };
  const host = root.getRootNode().host?.id ?? 'document', key = host + ':' + id;
  const context = { key, id, root, owner, handles: [] }; state.contexts.push(context);
  const ping = () => state.hits.push(key);
  root.addEventListener('resource:ping', ping);
  context.handles.push(owner.own(root, element => {
    state.released.push(key + ':listener'); element.removeEventListener('resource:ping', ping);
  }));
  context.handles.push(owner.acquire(signal => {
    signal.addEventListener('abort', () => state.aborted.push(key), { once: true });
    if (root.getAttribute('data-counter') === '2') return new Promise(resolve => { state.pending[key] = resolve; });
    return Promise.resolve(key + ':connection');
  }, value => { state.released.push(value); }));
  root.setAttribute('data-resource-key', key);
  if (root.hasAttribute('data-broken')) throw new Error('setup failed');
}
