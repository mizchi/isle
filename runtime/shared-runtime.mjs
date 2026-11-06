import { validateRuntimeVersion } from './runtime-identity.mjs';
const key = () => Symbol.for('isle.runtime.registry/1');

function registry(realm) {
  const value = realm[key()];
  if (value?.version !== 2 || !(value.entries instanceof Map) || !(value.bindings instanceof Map) || typeof value.runtimeVersion !== 'string') throw new Error('Incompatible Isle runtime registry');
  return value;
}

/** Pin the page before any vendor or Custom Element starts. All claims are atomic. */
export function claimSharedRuntime(version, abis, { realm = globalThis } = {}) {
  validateRuntimeVersion(version);
  for (const abi of abis) if (typeof abi !== 'string' || !abi) throw new TypeError('Shared runtime ABI is required');
  const current = Object.hasOwn(realm, key()) ? registry(realm) : { version: 2, runtimeVersion: version, entries: new Map(), bindings: new Map() };
  if (current.runtimeVersion !== version) throw new Error(`Shared runtime version mismatch: page=${current.runtimeVersion}, requested=${version}`);
  const bindings = new Map(current.bindings);
  for (const abi of abis) {
    const family = abi.slice(0, abi.lastIndexOf('/')) || abi;
    if (bindings.has(family) && bindings.get(family) !== abi) throw new Error(`Shared runtime ABI mismatch: page=${bindings.get(family)}, requested=${abi}`);
    bindings.set(family, abi);
  }
  if (!Object.hasOwn(realm, key())) Object.defineProperty(realm, key(), { value: current });
  current.bindings = bindings;
}

/** Share initialization across independently bundled SDKs in the same JavaScript realm. */
export function acquireSharedRuntime(abi, load, { version, realm = globalThis, exports: required = [] } = {}) {
  if (typeof abi !== 'string' || !abi) throw new TypeError('Shared runtime ABI is required');
  claimSharedRuntime(version, [abi], { realm });
  const { entries } = registry(realm);
  const check = module => {
    if (module?.version !== version) throw new Error(`Shared runtime version mismatch: expected ${version}, received ${module?.version}`);
    if (module?.abi !== abi) throw new Error('Shared runtime ABI mismatch');
    for (const name of required) if (!Object.hasOwn(module, name) || typeof module[name] !== 'function') throw new Error(`Shared runtime export missing: ${name}`);
    return module;
  };
  if (entries.has(abi)) return entries.get(abi).promise.then(check);
  const entry = { status: 'loading' };
  entry.promise = Promise.resolve().then(load).then(check).then(module => {
    entry.status = 'ready'; return module;
  }).catch(error => {
    if (entries.get(abi) === entry) entries.delete(abi);
    throw error;
  });
  entries.set(abi, entry);
  return entry.promise;
}

/** Read-only diagnostic snapshot; no root, state, credentials or mutable cache is exposed. */
export function sharedRuntimeInfo(realm = globalThis) {
  if (!Object.hasOwn(realm, key())) return [];
  const { runtimeVersion, entries } = registry(realm);
  return [...entries].map(([abi, entry]) => ({ version: runtimeVersion, abi, status: entry.status })).sort((a, b) => a.abi.localeCompare(b.abi));
}
