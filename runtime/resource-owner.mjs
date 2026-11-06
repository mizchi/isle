/** Live resources are local capabilities, never snapshot values. ES2023 + AbortController only. */
export function createResourceOwner(options = {}) {
  const fail = () => { throw new Error('Resource owner disposed'); };
  const callable = fn => { if (typeof fn !== 'function') throw new TypeError('Resource adapter must be a function'); };
  function record(node, error) {
    for (let current = node; current; current = current.parent) current.errors.push(error);
  }
  function report(node, error) {
    record(node, error);
    try { node.onError(error); } catch (failure) { record(node, failure); }
  }
  function retire(node) {
    if (node.alive || node.initializing || node.work.size || node.children.length) return;
    const parent = node.parent;
    if (!parent) return;
    const index = parent.children.indexOf(node);
    if (index >= 0) parent.children.splice(index, 1);
    retire(parent);
  }
  function track(node, work) {
    const task = Promise.resolve(work).then(undefined, error => report(node, error)).finally(() => { node.work.delete(task); retire(node); });
    node.work.add(task);
  }
  function release(node, entry) {
    if (!entry.acquired || entry.released) return;
    // Consume before entering host code: a destructor may synchronously reenter dispose().
    entry.released = true;
    const value = entry.value; entry.value = undefined;
    const destroy = entry.release; entry.release = undefined;
    try { track(node, destroy(value)); } catch (error) { report(node, error); }
  }
  function complete(node, entry, value) {
    entry.acquired = true; entry.value = value;
    if (node.alive) entry.state = 'ready';
    else release(node, entry); // Abort may have been ignored by the initializer.
  }
  function register(node, destroy) {
    callable(destroy);
    const entry = { state: 'pending', acquired: false, released: false, value: undefined, error: undefined, release: destroy };
    if (node.alive) node.entries.push(entry);
    const handle = {
      get state() { return node.alive ? entry.state : 'disposed'; },
      get error() { return node.alive ? entry.error : undefined; },
      read() {
        if (!node.alive) fail();
        if (entry.state === 'pending') throw new Error('Resource pending');
        if (entry.state === 'failed') throw entry.error;
        return entry.value;
      },
    };
    return { entry, handle };
  }
  function invalidate(node, closing) {
    if (!node.alive) return;
    node.alive = false;
    // No host callbacks until every descendant has lost access to its resources.
    for (const child of node.children.toReversed()) invalidate(child, closing);
    closing.push(node);
  }
  function dispose(node) {
    if (!node.alive) return false;
    const closing = []; invalidate(node, closing);
    for (const current of closing) { current.detach?.(); current.abort.abort(); }
    for (const current of closing) {
      for (const entry of current.entries.toReversed()) release(current, entry);
      current.entries.length = 0;
      retire(current);
    }
    return true;
  }
  function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
  function make(onError, parent) {
    const node = { alive: true, abort: new AbortController(), entries: [], children: [], work: new Set(), errors: [], onError, parent, initializing: 0 };
    node.api = {
      get disposed() { return !node.alive; },
      get signal() { return node.abort.signal; },
      get errors() { return node.errors.slice(); },
      own(value, destroy) {
        const { entry, handle } = register(node, destroy); complete(node, entry, value); return handle;
      },
      acquire(initialize, destroy) {
        if (!node.alive) fail();
        callable(initialize);
        const { entry, handle } = register(node, destroy);
        node.initializing++;
        try {
          // Register first, so unmount during initialization still owns its eventual result.
          const result = initialize(node.abort.signal);
          track(node, Promise.resolve(result).then(value => complete(node, entry, value), error => {
            entry.release = undefined;
            if (node.alive) { entry.state = 'failed'; entry.error = error; }
          }));
        } catch (error) { if (node.alive) { entry.state = 'failed'; entry.error = error; } entry.release = undefined; }
        finally { node.initializing--; retire(node); }
        return handle;
      },
      fork() {
        if (!node.alive) fail();
        const child = make(onError, node); node.children.push(child); return child.api;
      },
      dispose: () => dispose(node),
      async settled() {
        // Late acquisitions may add cleanup work after an earlier batch has finished.
        for (;;) {
          const work = descendants(node).flatMap(current => [...current.work]);
          if (!work.length) return;
          await Promise.all(work);
        }
      },
    };
    return node;
  }
  const node = make(options.onError ?? (error => console.error('[isle resource]', error)));
  if (options.signal) {
    const close = () => dispose(node);
    node.detach = () => options.signal.removeEventListener('abort', close);
    if (options.signal.aborted) dispose(node);
    else options.signal.addEventListener('abort', close, { once: true });
  }
  return node.api;
}
