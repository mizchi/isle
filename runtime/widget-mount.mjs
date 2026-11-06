import { resolveWidgetDescriptor, widgetURL } from './widget-contract.mjs';
import { runtimeIdentity, assertRuntimeIdentity } from './runtime-identity.mjs';
import { createStyleGate } from './styles.mjs';
// A DOM-local lease is shared even by isolated runtimes; it is not a runtime pool.
const mountKey = Symbol.for('isle.widget.mount/1');

/** Imperative ShadowRoot adapter; lifecycle/geometry belong to its caller. */
export async function mountWidget(root, source, { signal, onError } = {}) {
  signal?.throwIfAborted();
  if (Object.hasOwn(root, mountKey)) throw new Error('Widget root is already mounted');
  const owner = {};
  Object.defineProperty(root, mountKey, { value: owner, configurable: true });
  const release = () => { if (root[mountKey] === owner) delete root[mountKey]; };
  // Native imports cannot be aborted. Free the lease now; their continuation checks signal.
  signal?.addEventListener('abort', release, { once: true });
  try { return await mountContent(root, source, { signal, onError }, release); }
  catch (error) { release(); throw error; }
  finally { signal?.removeEventListener('abort', release); }
}

async function mountContent(root, source, { signal, onError }, release) {
  const document = root.ownerDocument, view = document.defaultView;
  const descriptorURL = widgetURL(source).href;
  signal?.throwIfAborted();
  const response = await view.fetch(descriptorURL, { credentials: 'omit', signal, redirect: 'error' });
  if (!response.ok) throw new Error('Widget is unavailable');
  signal?.throwIfAborted();
  const descriptor = resolveWidgetDescriptor(await response.json(), descriptorURL, runtimeIdentity);
  signal?.throwIfAborted();
  const content = document.createElement('template'); content.innerHTML = descriptor.html;
  if ([...content.content.querySelectorAll('script')].some(node => node.type !== 'application/json')) throw new Error('Widget markup must be inert');
  for (const template of content.content.querySelectorAll('template[data-isle-styles="1"]')) template.setAttribute('data-isle-base', descriptorURL);
  root.replaceChildren(content.content);
  for (const [rel, urls] of [['modulepreload', descriptor.preload], ['preload', descriptor.preloadStyles ?? []]]) {
    const preloaded = new Set([...document.head.querySelectorAll(rel === 'preload' ? 'link[rel=preload][as=style]' : 'link[rel=modulepreload]')].map(link => link.href));
    for (const href of urls) {
      if (preloaded.has(href)) continue;
      const link = document.createElement('link'); link.rel = rel; if (rel === 'preload') link.as = 'style'; link.href = href; link.crossOrigin = 'anonymous';
      document.head.append(link); preloaded.add(href);
    }
  }
  const styles = createStyleGate(root);
  try { return await attachController(root, descriptor, { signal, onError }, release, styles); }
  catch (error) { styles.close?.(); throw error; }
}

async function attachController(root, descriptor, { signal, onError }, release, styles) {
  signal?.throwIfAborted();
  const cancel = () => styles.close?.();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const pending = styles('@eager');
    if (pending) { const apply = await pending; signal?.throwIfAborted(); apply?.(); }
    let controller;
    if (descriptor.module !== null) {
      const module = await import(/* @vite-ignore */ descriptor.module);
      signal?.throwIfAborted();
      if (typeof module.mount !== 'function') throw new Error('Widget mount is missing');
      assertRuntimeIdentity(module.runtimeIdentity, runtimeIdentity);
      controller = module.mount(root, { actionBaseURL: descriptor.actions, requestCredentials: 'omit', onError });
      if (typeof controller?.close !== 'function') throw new Error('Invalid widget mount controller');
    } else controller = { dispose() {}, async settled() {}, close() {} };
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true; signal?.removeEventListener('abort', close);
      try { controller.close(); } finally { styles.close?.(); release(); }
    };
    if (signal?.aborted) { close(); signal.throwIfAborted(); }
    signal?.addEventListener('abort', close, { once: true });
    return { ...controller, close };
  } finally { signal?.removeEventListener('abort', cancel); }
}
