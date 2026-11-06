import { createResourceBindings } from './resource-bindings.mjs';
import { createStyleGate } from './styles.mjs';
import { validValue } from './value.mjs';
import { createCodeResolver } from './code-ref.mjs';
import { createRequester } from './request.mjs';
// Build-time capability constants default to the complete runtime for direct ESM use.
const DEBUG = typeof __ISLE_DEBUG__ === 'undefined' || __ISLE_DEBUG__;
const PROFILE = typeof __ISLE_PROFILE__ !== 'undefined' && __ISLE_PROFILE__;
const ATTRIBUTES = typeof __ISLE_ATTRIBUTES__ === 'undefined' || __ISLE_ATTRIBUTES__;
const TEXT = typeof __ISLE_TEXT__ === 'undefined' || __ISLE_TEXT__;
const TEXT_RANGES = typeof __ISLE_TEXT_RANGES__ === 'undefined' || __ISLE_TEXT_RANGES__;
const REMOTE = typeof __ISLE_REMOTE__ === 'undefined' || __ISLE_REMOTE__;
const FORMS = typeof __ISLE_FORMS__ === 'undefined' || __ISLE_FORMS__;
const EAGER_CODE = typeof __ISLE_EAGER_CODE__ === 'undefined' || __ISLE_EAGER_CODE__;
const RESOURCES = typeof __ISLE_RESOURCES__ === 'undefined' || __ISLE_RESOURCES__;
const CSS = typeof __ISLE_CSS__ === 'undefined' || __ISLE_CSS__;
const REGIONS = typeof __ISLE_REGIONS__ === 'undefined' || __ISLE_REGIONS__;
const documents = new WeakMap();
const NESTED = typeof __ISLE_NESTED__ === 'undefined' || __ISLE_NESTED__;
const valid = (type, value) => typeof value === type && (type !== 'number' || (Number.isFinite(value) && !Object.is(value, -0)));

export async function runTransaction(scope, run, payload, isLive, captures) {
  if (!isLive()) return false;
  const slots = captures ?? scope._values.map((_, index) => index);
  if (!Array.isArray(slots) || slots.includes(undefined) || new Set(slots).size !== slots.length || slots.some(index => !Number.isSafeInteger(index) || index < 0 || index >= scope._values.length)) throw new Error('I8');
  const values = slots.map(index => scope._values[index]), patches = [];
  if (REGIONS && scope.region) payload.region = [...scope.region, commit => patches.push([commit, []])];
  await run(values,
    (key, value) => {
      if (!Number.isInteger(key) || key < 0 || key >= slots.length) throw new Error('I8');
      scope._validate(slots[key], value); values[key] = value;
    },
    TEXT ? (...args) => patches.push([scope._text, args]) : undefined,
    ATTRIBUTES ? (...args) => patches.push([scope._attribute, FORMS ? [...args, payload] : args]) : undefined,
    scope._remote, payload);
  if (!isLive()) return false;
  for (const [key, value] of values.entries()) if (!Object.is(scope._values[slots[key]], value)) scope._set(slots[key], value);
  for (const [apply, args] of patches) apply(...args);
  return true;
}

/** Registry and handler wire contracts: ../lib/client-contracts.d.ts. */
export function resume(root, registry, options = {}) {
  const { onError = error => console.error('[isle]', error.message), metrics: suppliedMetrics } = options;
  if (documents.has(root)) return documents.get(root);
  const document = root.ownerDocument ?? root;
  const request = REMOTE ? createRequester(document, options) : undefined;
  const [schemas, , handlers, actions, baseURL, prepared] = registry;
  const resolver = createCodeResolver(baseURL);
  const styles = CSS ? createStyleGate(root) : undefined;
  const styleRoot = CSS ? root : undefined;
  const records = new Map(), modules = new Map();
  const metrics = DEBUG ? suppliedMetrics ?? { restores: 0, loads: 0, completed: 0, cancelled: 0, errors: 0 } : undefined;
  const snapshots = new Map();
  for (const node of root.querySelectorAll('[data-isle-snapshot]')) {
    const id = node.getAttribute('data-isle-snapshot');
    if (snapshots.has(id)) throw new Error(DEBUG ? `Duplicate snapshot for ${id}` : 'I1');
    snapshots.set(id, node);
  }
  for (const node of root.querySelectorAll('[data-isle-root]')) {
    const id = node.getAttribute('data-isle-root'), snapshot = snapshots.get(id);
    if (!snapshot || records.has(id)) throw new Error(DEBUG ? `Missing or duplicate snapshot for ${id}` : 'I1');
    records.set(id, { _node: node, _snapshot: snapshot, _alive: true, _generation: 0, _queue: Promise.resolve(), _scope: null,
      ...(NESTED ? { _parent: node.getAttribute('data-isle-parent') } : {}) });
  }
  if (NESTED) for (const record of records.values()) if (record._parent !== null && !records.has(record._parent)) throw new Error(DEBUG ? 'Unknown parent owner' : 'I1');
  const resourceBindings = RESOURCES ? createResourceBindings(root,
    new Map([...records].map(([id, record]) => [id, [record._node, NESTED ? record._parent : null]])), registry[6],
    ref => resolver.resolve(ref), id => { const record = records.get(id); return !!record?._alive && record._node.isConnected && root.contains(record._node); },
    id => controller.dispose(id), onError) : undefined;
  const live = (record, generation) => record._alive && record._generation === generation && record._node.isConnected;
  function restore(record, id) {
    if (record._scope) return record._scope;
    const snapshot = JSON.parse(record._snapshot.textContent);
    const fields = Array.isArray(snapshot) && Object.hasOwn(schemas, snapshot[1]) && schemas[snapshot[1]], values = snapshot?.[3];
    if (!fields || snapshot.length !== 4 || snapshot[0] !== 2 || snapshot[2] !== id || !Array.isArray(values) || values.length !== fields.length)
      throw new Error(DEBUG ? 'Snapshot/schema build mismatch' : 'I2');
    const validate = (key, value) => {
      if (!Number.isInteger(key) || key < 0 || key >= fields.length || !(REGIONS ? validValue(fields[key], value) : valid(fields[key], value)))
        throw new Error(DEBUG ? `Invalid state slot ${key}` : 'I3');
    };
    values.forEach((value, key) => validate(key, value));
    if (DEBUG) metrics.restores++;
    const generation = record._generation;
    const texts = TEXT ? new Map() : undefined, attributes = ATTRIBUTES ? new Map() : undefined;
    if (TEXT) {
      const walker = document.createTreeWalker(record._node, 128); // NodeFilter.SHOW_COMMENT
      for (let marker = walker.nextNode(); marker; marker = walker.nextNode()) {
        if (NESTED && marker.parentElement.closest('[data-isle-root]') !== record._node) continue;
        if (!marker.data.startsWith('i:')) continue;
        let text = marker.nextSibling;
        if (!text || text.nodeType !== 3) { text = document.createTextNode(''); marker.after(text); }
        texts.set(+marker.data.slice(2), text);
      }
    }
    const scope = {
      _values: values, _validate: validate,
      ...(RESOURCES ? { schema: snapshot[1] } : {}),
      ...(REGIONS ? { region: [record._node, id] } : {}),
      _set(key, value) {
        if (!live(record, generation)) return;
        validate(key, value); values[key] = value;
      },
      ...(TEXT ? TEXT_RANGES ? { _text(key, value, prefix = 0, suffix = 0) {
        if (!live(record, generation)) return;
        const target = texts.get(key);
        if (!target) throw new Error(DEBUG ? `Missing SSR text locator ${key}` : 'I4');
        target.replaceData(prefix, target.length - prefix - suffix, value);
      } } : { _text(key, value) {
        if (!live(record, generation)) return;
        const target = texts.get(key);
        if (!target) throw new Error(DEBUG ? `Missing SSR text locator ${key}` : 'I4');
        target.data = value;
      } } : {}),
      ...(ATTRIBUTES ? { _attribute(key, name, value) {
        // Form-only fourth argument; keep the original arity when that capability is removed.
        const payload = FORMS ? arguments[3] : undefined;
        if (!live(record, generation)) return;
        let target = attributes.get(key);
        if (!target) {
          const candidates = [record._node, ...record._node.querySelectorAll(`[data-isle-binding-${key}]`)];
          target = candidates.find(node => node.getAttribute(`data-isle-binding-${key}`) === id);
          if (target) attributes.set(key, target);
        }
        if (!target) throw new Error(DEBUG ? `Missing attribute locator ${key}` : 'I4');
        // A newer edit may already be in the DOM while this captured event waits for code.
        if (FORMS && payload?.element === target &&
          ((name === 'value' && target.value !== payload.value) || (name === 'checked' && target.checked !== payload.checked))) return;
        if (name === 'disabled') target.disabled = Boolean(value);
        else if (FORMS && ['required', 'checked', 'readonly', 'multiple', 'selected'].includes(name)) target[name === 'readonly' ? 'readOnly' : name] = Boolean(value);
        else if (name === 'value') { if (!FORMS || target.value !== String(value)) target.value = String(value); }
        else target.setAttribute(name, value);
      } } : {}),
      ...(REMOTE ? { async _remote(name, input) {
        if (!live(record, generation)) throw new Error(DEBUG ? 'Scope disposed' : 'I5');
        if (!actions.includes(name)) throw new Error(DEBUG ? 'Unregistered remote action' : 'I6');
        const response = await request('action', name, input);
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error ?? 'I7');
        return result.value;
      } } : {}),
    };
    record._scope = scope;
    return scope;
  }
  function dispatch(root, element, id, handlerId, payload) {
    const record = records.get(id), ref = Object.hasOwn(handlers, handlerId) && handlers[handlerId];
    if (!record?._alive || !ref || record._node !== root || !root.contains(element)) {
      if (PROFILE) payload.timing?.finish('cancelled');
      return;
    }
    const generation = record._generation;
    const timing = PROFILE ? payload.timing : undefined;
    const endQueue = PROFILE ? timing?.begin('queue') : undefined;
    record._queue = record._queue.then(async () => {
      if (PROFILE) endQueue?.();
      if (!live(record, generation) || (REGIONS && !root.contains(element))) { if (PROFILE) timing?.finish('cancelled'); if (DEBUG) metrics.cancelled++; return; }
      const resourceScope = RESOURCES && registry[6] ? (record._scope ?? (PROFILE && timing ? timing.sync('restore', () => restore(record, id)) : restore(record, id))) : undefined;
      if (CSS) {
        const pendingStyles = styles(handlerId);
        if (pendingStyles) {
          const apply = await (PROFILE && timing ? timing.measure('styles', () => pendingStyles, undefined, apply => apply ? 'ok' : 'cancelled') : pendingStyles);
          if (!live(record, generation) || !styleRoot.contains(root) || !root.contains(element)) { if (PROFILE) timing?.finish('cancelled'); if (DEBUG) metrics.cancelled++; return; }
          apply?.();
        }
      }
      const ready = EAGER_CODE && prepared && Object.hasOwn(prepared, handlerId);
      const cached = PROFILE ? modules.has(handlerId) || !!ready : undefined;
      if (!modules.has(handlerId)) {
        if (DEBUG) metrics.loads++;
        if (ready && typeof prepared[handlerId] !== 'function') throw new Error(DEBUG ? 'Invalid prepared handler' : 'I9');
        modules.set(handlerId, ready ? Promise.resolve(prepared[handlerId]) : resolver.resolve(ref));
      }
      const pendingSetup = RESOURCES ? resourceBindings.prepare(resourceScope?.schema) : undefined;
      const setup = RESOURCES && PROFILE && timing && pendingSetup ? timing.measure('resource-code', () => pendingSetup,
        { url: new URL(registry[6][resourceScope.schema][0], baseURL).href }) : pendingSetup;
      let run, initialize;
      try {
        if (RESOURCES) [run, initialize] = await Promise.all([PROFILE && timing ? timing.measure('code', () => modules.get(handlerId), { url: new URL(ref[0], baseURL).href, cached }) : modules.get(handlerId), setup]);
        else run = await (PROFILE && timing ? timing.measure('code', () => modules.get(handlerId), { url: new URL(ref[0], baseURL).href, cached }) : modules.get(handlerId));
      } catch (error) { modules.delete(handlerId); throw error; }
      if (!live(record, generation) || (REGIONS && !root.contains(element))) { if (PROFILE) timing?.finish('cancelled'); if (DEBUG) metrics.cancelled++; return; }
      if (CSS && !styleRoot.contains(root)) { if (PROFILE) timing?.finish('cancelled'); if (DEBUG) metrics.cancelled++; return; }
      if (RESOURCES && initialize) {
        resourceBindings.activate(id, initialize, PROFILE ? timing : undefined);
        payload.resources = resourceBindings.get(id);
      }
      if (RESOURCES && !live(record, generation)) { if (DEBUG) metrics.cancelled++; return; }
      let committed;
      if (PROFILE && timing) {
        const scope = record._scope ?? timing.sync('restore', () => restore(record, id));
        committed = await timing.measure('run', () => runTransaction(scope, run, payload, CSS ? () => live(record, generation) && styleRoot.contains(root) && root.contains(element) : REGIONS ? () => live(record, generation) && root.contains(element) : () => live(record, generation), ref[2]),
          undefined, committed => committed ? 'ok' : 'cancelled');
        timing.finish(committed ? 'ok' : 'cancelled');
      } else committed = await runTransaction(restore(record, id), run, payload, CSS ? () => live(record, generation) && styleRoot.contains(root) && root.contains(element) : REGIONS ? () => live(record, generation) && root.contains(element) : () => live(record, generation), ref[2]);
      if (DEBUG) { if (committed) metrics.completed++; else metrics.cancelled++; }
    }).catch(error => { if (PROFILE) timing?.finish('error'); if (DEBUG) metrics.errors++; onError(error); });
  }
  const controller = {
    metrics, dispatch,
    ...(RESOURCES ? { async resources(id) {
      const record = records.get(id);
      if (!record?._alive || !record._node.isConnected || !root.contains(record._node)) throw new Error('Resource component disposed');
      const scope = restore(record, id);
      if (CSS) {
        const apply = await styles('@' + scope.schema);
        resourceBindings.get(id); // Revalidate the owning root before applying ready styles.
        apply?.();
      }
      const setup = await resourceBindings.prepare(scope.schema);
      if (!record._alive || !record._node.isConnected || !root.contains(record._node)) throw new Error('Resource component disposed');
      resourceBindings.activate(id, setup); return resourceBindings.get(id);
    } } : {}),
    dispose(id) {
      const record = records.get(id);
      if (!record?._alive) return;
      if (RESOURCES) {
        function invalidate(scopeId) {
          const current = records.get(scopeId);
          if (!current?._alive) return;
          current._alive = false; current._generation++;
          if (NESTED) for (const [child, value] of records) if (value._parent === scopeId) invalidate(child);
        }
        invalidate(id); resourceBindings.dispose(id);
      } else {
        record._alive = false; record._generation++;
        if (NESTED) for (const [child, value] of records) if (value._parent === id) controller.dispose(child);
      }
    },
    async settled() { await Promise.all([...records.values()].map(record => record._queue)); if (RESOURCES) await resourceBindings.settled(); },
    close() {
      if (RESOURCES) {
        for (const record of records.values()) if (record._alive) { record._alive = false; record._generation++; }
        resourceBindings.close();
      } else for (const id of records.keys()) controller.dispose(id);
      if (CSS) styles.close?.();
      documents.delete(root);
    },
  };
  documents.set(root, controller);
  return controller;
}
