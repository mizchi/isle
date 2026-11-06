import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceOwner } from '../runtime/resource-owner.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('unmount revokes readers synchronously and releases acquired values exactly once', async () => {
  const owner = createResourceOwner(), released = [], value = {};
  const handle = owner.own(value, item => released.push(item));
  assert.equal(handle.read(), value);
  assert.equal(owner.dispose(), true);
  assert.equal(handle.state, 'disposed');
  assert.throws(() => handle.read(), /disposed/);
  assert.equal(owner.dispose(), false);
  await owner.settled();
  assert.deepEqual(released, [value]);
});

test('an acquisition that ignores abort and finishes after unmount is released without publication', async () => {
  const pending = deferred(), released = [], owner = createResourceOwner();
  let aborts = 0;
  const handle = owner.acquire(signal => { signal.addEventListener('abort', () => { aborts++; }); return pending.promise; }, value => released.push(value));
  owner.dispose();
  assert.equal(aborts, 1);
  assert.equal(handle.state, 'disposed');
  const value = {}; pending.resolve(value); await owner.settled();
  assert.deepEqual(released, [value]); assert.throws(() => handle.read(), /disposed/);
});

test('the promise-fulfillment and unmount race does not leak the returned value', async () => {
  const pending = deferred(), released = [], owner = createResourceOwner();
  owner.acquire(() => pending.promise, value => released.push(value));
  pending.resolve('resource'); owner.dispose(); await owner.settled();
  assert.deepEqual(released, ['resource']);
});

test('an old acquisition cannot publish into a replacement owner', async () => {
  const old = createResourceOwner(), pending = deferred(), releases = [];
  const first = old.acquire(() => pending.promise, value => releases.push(value));
  old.dispose();
  const replacement = createResourceOwner(), next = replacement.own('new', value => releases.push(value));
  pending.resolve('old'); await old.settled();
  assert.equal(next.read(), 'new'); assert.equal(first.state, 'disposed'); assert.deepEqual(releases, ['old']);
  replacement.dispose(); await replacement.settled(); assert.deepEqual(releases, ['old', 'new']);
});

test('a failed initializer has no acquired value to release and cannot start after disposal', async () => {
  const owner = createResourceOwner(), error = new Error('init failed');
  let releases = 0, starts = 0;
  const handle = owner.acquire(() => { throw error; }, () => { releases++; });
  await owner.settled();
  assert.equal(handle.state, 'failed'); assert.equal(handle.error, error); assert.throws(() => handle.read(), value => value === error);
  owner.dispose(); await owner.settled(); assert.equal(releases, 0);
  assert.throws(() => owner.acquire(() => { starts++; }, () => {}), /disposed/);
  assert.equal(starts, 0);
});

test('all descendants are invalidated before abort callbacks or any destructor run', async () => {
  const parent = createResourceOwner(), child = parent.fork(), sibling = parent.fork(), order = [];
  parent.own('parent', () => order.push('parent'));
  child.own('child', () => { assert.equal(parent.disposed, true); assert.equal(sibling.disposed, true); order.push('child'); });
  sibling.own('sibling', () => order.push('sibling'));
  parent.signal.addEventListener('abort', () => {
    assert.equal(child.disposed, true); assert.equal(sibling.disposed, true);
    assert.throws(() => child.own('bad', () => { order.push('late-adoption'); }).read(), /disposed/);
  });
  parent.dispose(); await parent.settled();
  assert.deepEqual(order, ['late-adoption', 'sibling', 'child', 'parent']);
});

test('a failing or pending destructor does not prevent other cleanup attempts', async () => {
  const errors = [], owner = createResourceOwner({ onError: error => errors.push(error) }), pending = deferred(), calls = [];
  const failure = new Error('cleanup failed');
  owner.own('first', value => { calls.push(value); throw failure; });
  owner.own('second', value => { calls.push(value); return pending.promise; });
  owner.own('third', value => { calls.push(value); owner.dispose(); });
  owner.dispose();
  assert.deepEqual(calls, ['third', 'second', 'first']);
  pending.reject(new Error('async cleanup failed')); await owner.settled();
  assert.equal(errors.length, 2); assert.equal(owner.errors.length, 2);
  owner.dispose(); await owner.settled(); assert.equal(calls.length, 3);
});

test('a mount AbortSignal closes its owner while an already-aborted mount cannot initialize', async () => {
  const mount = new AbortController(), owner = createResourceOwner({ signal: mount.signal }), released = [];
  owner.own('listener', value => released.push(value)); mount.abort(); await owner.settled();
  assert.equal(owner.disposed, true); assert.deepEqual(released, ['listener']);
  const closed = createResourceOwner({ signal: mount.signal }); assert.equal(closed.disposed, true);
  assert.throws(() => closed.acquire(() => assert.fail('must not initialize'), () => {}), /disposed/);
});

test('adopting a value after disposal immediately transfers it to cleanup', async () => {
  const owner = createResourceOwner(), released = []; owner.dispose();
  owner.own(undefined, value => released.push(value)); await owner.settled();
  assert.deepEqual(released, [undefined]);
});

test('parent drain waits for a child acquisition and its late asynchronous cleanup', async () => {
  const parent = createResourceOwner(), child = parent.fork(), pending = deferred(), cleanup = deferred(), began = deferred();
  child.acquire(() => { child.dispose(); return pending.promise; }, () => { began.resolve(); return cleanup.promise; });
  let drained = false; const joining = parent.settled().then(() => { drained = true; });
  pending.resolve('late'); await began.promise; assert.equal(drained, false);
  cleanup.resolve(); await joining;
  assert.equal(drained, true); assert.equal(parent.disposed, false);
  parent.dispose(); await parent.settled();
});
