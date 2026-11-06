import { createResourceOwner } from './resource-owner.mjs';
const PROFILE = typeof __ISLE_PROFILE__ !== 'undefined' && __ISLE_PROFILE__;

/** Optional connection between decoded component owners, lazy setup code and native removal. */
export function createResourceBindings(root, nodes, entries, resolve, isLive, dispose, onError) {
  const owners = new Map(), initialized = new Set(), modules = new Map(), pending = new Set();
  let observer, closed = false;
  const check = id => { if (closed || !nodes.has(id) || !isLive(id)) throw new Error('Resource component disposed'); };
  function watch() {
    if (observer) return;
    const document = root.ownerDocument ?? root;
    observer = new document.defaultView.MutationObserver(changes => {
      if (!changes.some(change => [...change.removedNodes].some(node => node.nodeType === 1))) return;
      for (const [id, owner] of owners) if (!owner.disposed && !isLive(id)) dispose(id);
    });
    observer.observe(root, { childList: true, subtree: true });
  }
  function get(id) {
    check(id); watch();
    if (!owners.has(id)) {
      const parent = nodes.get(id)[1];
      owners.set(id, parent == null ? createResourceOwner({ onError }) : get(parent).fork());
    }
    return owners.get(id);
  }
  function prepare(schema) {
    if (!entries || !Object.hasOwn(entries, schema)) return undefined;
    if (!modules.has(schema)) modules.set(schema, resolve(entries[schema]).catch(error => { modules.delete(schema); throw error; }));
    return modules.get(schema);
  }
  function activate(id, setup, timing) {
    if (!setup || initialized.has(id)) return;
    check(id); initialized.add(id);
    const owner = get(id);
    try {
      const context = { root: nodes.get(id)[0], owner, id };
      const result = PROFILE && timing ? timing.sync('resource-setup', () => setup(context)) : setup(context);
      if (result !== undefined) {
        // A rejected async setup must never become an unhandled promise. Its work is
        // joined for diagnostics; adapters must register async work with owner.acquire.
        if (result && typeof result.then === 'function') {
          const task = Promise.resolve(result).catch(error => { try { onError(error); } catch {} }).finally(() => pending.delete(task));
          pending.add(task);
        }
        throw new Error('Resource setup must be synchronous; use owner.acquire for async initialization');
      }
      check(id);
    } catch (error) { dispose(id); throw error; }
  }
  return {
    prepare, activate, get,
    dispose(id) { owners.get(id)?.dispose(); },
    async settled() {
      for (;;) {
        await Promise.all([...owners.values()].map(owner => owner.settled()));
        if (!pending.size) return;
        await Promise.all([...pending]);
      }
    },
    close() {
      closed = true; observer?.disconnect();
      for (const [id, owner] of owners) if (nodes.get(id)[1] == null) owner.dispose();
    },
  };
}
