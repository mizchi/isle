import { createInteraction } from './profile.mjs';
import { captureFormEvent, disposeFormEvents, settleFormEvents } from './form-events.mjs';
import { createRequester } from './request.mjs';
const DEBUG = typeof __ISLE_DEBUG__ === 'undefined' || __ISLE_DEBUG__;
const PROFILE = typeof __ISLE_PROFILE__ !== 'undefined' && __ISLE_PROFILE__;
const FORMS = typeof __ISLE_FORMS__ === 'undefined' || __ISLE_FORMS__;
const SCHEMA_FORMS = typeof __ISLE_SCHEMA_FORMS__ === 'undefined' || __ISLE_SCHEMA_FORMS__;
const LAZY_CODE = typeof __ISLE_LAZY_CODE__ === 'undefined' || __ISLE_LAZY_CODE__;
const NESTED = typeof __ISLE_NESTED__ === 'undefined' || __ISLE_NESTED__;
const RESOURCES = typeof __ISLE_RESOURCES__ === 'undefined' || __ISLE_RESOURCES__;
const REGIONS = typeof __ISLE_REGIONS__ === 'undefined' || __ISLE_REGIONS__;
const documents = new WeakMap();

/** Register delegated events without importing the runtime or reading snapshots. */
export function loadIslands(root, load, events, options = {}) {
  const { onError = error => console.error('[isle]', error.message) } = options;
  if (documents.has(root)) return documents.get(root);
  const document = root.ownerDocument ?? root;
  const request = SCHEMA_FORMS ? createRequester(document, options) : undefined;
  const roots = new Map(), disposed = new Set();
  const pending = LAZY_CODE ? root.querySelector('template[data-isle-load="1"]')?.content : undefined;
  for (const node of root.querySelectorAll('[data-isle-root]')) {
    const id = node.getAttribute('data-isle-root');
    if (roots.has(id)) throw new Error('I1');
    roots.set(id, node);
  }
  const abort = new document.defaultView.AbortController();
  const metrics = DEBUG ? { restores: 0, loads: 0, completed: 0, cancelled: 0, errors: 0 } : undefined;
  let runtime, loading, closed = false, deliveries = Promise.resolve();
  const start = () => loading ??= Promise.resolve().then(load).then(module => {
    if (closed) return;
    runtime = module.resume(root, module.registry, { ...options, onError, metrics });
    for (const id of disposed) runtime.dispose(id);
    return runtime;
  }).catch(error => { loading = undefined; throw error; });
  function dispatch(event) {
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    const element = target?.closest(`[data-isle-on-${event.type}]`);
    if (!element) return;
    const [id, handler] = element.getAttribute(`data-isle-on-${event.type}`).split('|'), root = roots.get(id);
    const alive = () => !closed && !disposed.has(id) && root?.isConnected && root.contains(element);
    if (!alive()) return;
    const schemaForm = SCHEMA_FORMS && element.hasAttribute('data-isle-form');
    if (schemaForm && event.type === 'invalid') event.preventDefault();
    if (FORMS && event.type === 'submit') {
      event.preventDefault();
      if (!schemaForm && !document.defaultView.HTMLFormElement.prototype.reportValidity.call(element)) return;
    }
    // Capture mutable DOM properties before the first asynchronous import.
    const payload = { type: event.type, value: event.target?.value, checked: event.target?.checked };
    if (REGIONS) { payload.element = element; payload.key = event.key; }
    if (SCHEMA_FORMS && schemaForm) {
      payload.form = captureFormEvent(document, event, element);
      if (!payload.form) return;
      payload.form.bridge.request = request;
      payload.reportError = onError;
    }
    if (FORMS && event.target?.validity) {
      payload.invalid = !event.target.validity.valid;
      payload.validationMessage = event.target.validationMessage;
      payload.element = element;
    }
    const timing = PROFILE ? createInteraction(document.defaultView.performance, handler, id, event.type) : undefined;
    if (PROFILE) payload.timing = timing;
    const endQueue = PROFILE ? timing.begin('loader-queue') : undefined;
    // Activate only this entry's build-time closure. Moving each inert link once
    // deduplicates shared dependencies; modulepreload never evaluates the handler.
    if (LAZY_CODE) for (const link of pending?.querySelectorAll('link[data-isle-code]') ?? []) {
      if (link.getAttribute('data-isle-code').split(' ').includes(handler)) document.head.append(link);
    }
    deliveries = deliveries.then(async () => {
      if (PROFILE) endQueue();
      if (alive()) {
        const current = await (PROFILE ? timing.measure('runtime', start, { cached: !!runtime }) : start());
        if (alive()) { current.dispatch(root, element, id, handler, payload); return; }
      }
      if (PROFILE) timing.finish('cancelled');
      if (DEBUG) metrics.cancelled++;
    }).catch(error => {
      if (SCHEMA_FORMS && payload.form && payload.type === 'submit') payload.form.bridge.release(payload.form.ticket);
      if (PROFILE) timing.finish('error'); if (DEBUG) metrics.errors++; onError(error);
    });
  }
  for (const type of events) root.addEventListener(type, dispatch, { signal: abort.signal, ...(FORMS && type === 'invalid' ? { capture: true } : {}) });
  const controller = {
    metrics,
    ...(RESOURCES ? { async resources(id) {
      if (closed || disposed.has(id) || !roots.has(id) || !roots.get(id).isConnected || !root.contains(roots.get(id))) throw new Error('Resource component disposed');
      const current = await start();
      if (closed || disposed.has(id) || !roots.get(id).isConnected || !root.contains(roots.get(id))) throw new Error('Resource component disposed');
      return current.resources(id);
    } } : {}),
    dispose(id) {
      if (!roots.has(id) || disposed.has(id)) return;
      if (SCHEMA_FORMS) disposeFormEvents(roots.get(id));
      disposed.add(id); runtime?.dispose(id);
      if (NESTED) for (const [child, node] of roots) if (node.getAttribute('data-isle-parent') === id) controller.dispose(child);
    },
    async settled() { await deliveries; await runtime?.settled(); if (SCHEMA_FORMS) await settleFormEvents(roots.values()); },
    close() {
      closed = true; abort.abort(); if (SCHEMA_FORMS) for (const root of roots.values()) disposeFormEvents(root);
      runtime?.close(); documents.delete(root);
    },
  };
  documents.set(root, controller);
  return controller;
}
