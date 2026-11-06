import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireSharedRuntime, sharedRuntimeInfo } from '../runtime/shared-runtime.mjs';

test('independent SDK copies initialize one runtime per ABI even when they race', async () => {
  const other = await import('../runtime/shared-runtime.mjs?independent-copy');
  const realm = {}; let finish, loads = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const first = acquireSharedRuntime('test/1', () => { loads++; return pending; }, { version: '0.0.1', realm, exports: ['mount'] });
  const second = other.acquireSharedRuntime('test/1', async () => { loads++; return { abi: 'test/1', version: '0.0.1', mount() {} }; }, { version: '0.0.1', realm, exports: ['mount'] });
  await Promise.resolve(); assert.equal(loads, 1);
  assert.deepEqual(sharedRuntimeInfo(realm), [{ abi: 'test/1', version: '0.0.1', status: 'loading' }]);
  const engine = { abi: 'test/1', version: '0.0.1', mount() {} }; finish(engine);
  assert.equal(await first, engine); assert.equal(await second, engine);
  assert.deepEqual(other.sharedRuntimeInfo(realm), [{ abi: 'test/1', version: '0.0.1', status: 'ready' }]);
});

test('incompatible ABIs never substitute implementations; malformed runtimes do not poison retries', async () => {
  const realm = {};
  await assert.rejects(acquireSharedRuntime('test/1', async () => ({ abi: 'test/2', version: '0.0.1' }), { version: '0.0.1', realm }), /ABI/);
  assert.deepEqual(sharedRuntimeInfo(realm), []);
  await assert.rejects(acquireSharedRuntime('test/1', async () => ({ abi: 'test/1', version: '0.0.1' }), { version: '0.0.1', realm, exports: ['mount'] }), /mount/);
  const first = await acquireSharedRuntime('test/1', async () => ({ abi: 'test/1', version: '0.0.1', mount() {} }), { version: '0.0.1', realm, exports: ['mount'] });
  assert.throws(() => acquireSharedRuntime('test/2', async () => ({ abi: 'test/2', version: '0.0.1', mount() {} }), { version: '0.0.1', realm, exports: ['mount'] }), /ABI/);
  assert.equal(first.version, '0.0.1'); assert.equal(sharedRuntimeInfo(realm).length, 1);
  assert.throws(() => acquireSharedRuntime('', async () => ({ abi: '' }), { version: '0.0.1', realm }), /ABI/);
});

test('failure of one concurrent initialization is shared and another provider can retry', async () => {
  const realm = {}; let loads = 0;
  const load = () => { loads++; throw new Error('offline'); };
  const results = await Promise.allSettled([acquireSharedRuntime('test/1', load, { version: '0.0.1', realm }), acquireSharedRuntime('test/1', load, { version: '0.0.1', realm })]);
  assert.equal(loads, 1); assert.ok(results.every(result => result.status === 'rejected'));
  const engine = await acquireSharedRuntime('test/1', async () => ({ abi: 'test/1', version: '0.0.1' }), { version: '0.0.1', realm });
  assert.equal(engine.abi, 'test/1');
});

test('different versions are rejected before a second factory runs, including while loading', async () => {
  const realm = {}; let finish, wrongLoads = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const first = acquireSharedRuntime('test/1', () => pending, { version: '0.0.1', realm });
  assert.throws(() => acquireSharedRuntime('test/1', async () => { wrongLoads++; return { abi: 'test/1', version: '0.0.2' }; }, { version: '0.0.2', realm }), /version mismatch/);
  assert.equal(wrongLoads, 0);
  finish({ abi: 'test/1', version: '0.0.1' }); await first;
  assert.throws(() => acquireSharedRuntime('test/1', async () => ({ abi: 'test/1', version: '0.0.2' }), { version: '0.0.2', realm }), /version mismatch/);
});

test('module version and unversioned registry are rejected rather than silently substituted', async () => {
  await assert.rejects(acquireSharedRuntime('test/1', async () => ({ abi: 'test/1', version: '0.0.2' }), { version: '0.0.1', realm: {} }), /version mismatch/);
  const realm = {};
  Object.defineProperty(realm, Symbol.for('isle.runtime.registry/1'), { value: { version: 1, entries: new Map() } });
  assert.throws(() => acquireSharedRuntime('test/1', async () => ({ abi: 'test/1', version: '0.0.1' }), { version: '0.0.1', realm }), /registry/);
});
