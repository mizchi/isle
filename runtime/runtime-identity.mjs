import pkg from '../package.json' with { type: 'json' };

export function validateRuntimeVersion(version) {
  if (typeof version !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version)) throw new TypeError('Exact runtime version is required');
  return version;
}
export const runtimeIdentity = Object.freeze({
  version: typeof __ISLE_RUNTIME_VERSION__ === 'undefined' ? pkg.version : __ISLE_RUNTIME_VERSION__,
  mode: typeof __ISLE_WIDGET_MODE__ === 'undefined' ? 'shared' : __ISLE_WIDGET_MODE__,
});

export function assertRuntimeIdentity(actual, expected) {
  if (!actual || typeof actual !== 'object' || !['shared', 'standalone'].includes(actual.mode) || Object.keys(actual).some(key => !['version', 'mode'].includes(key))) throw new Error('Invalid widget runtime identity');
  validateRuntimeVersion(actual.version);
  if (expected && actual.version !== expected.version) throw new Error(`Widget runtime version mismatch: expected ${expected.version}, received ${actual.version}`);
  if (expected && actual.mode !== expected.mode) throw new Error(`Widget runtime mode mismatch: expected ${expected.mode}, received ${actual.mode}`);
  return actual;
}
