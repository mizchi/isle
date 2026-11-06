import test from 'node:test';
import assert from 'node:assert/strict';
import { runTransaction } from '../runtime/client.mjs';

function scope() {
  const patches = [];
  const s = { _values: [37], patches,
    _validate(key, value) { if (key !== 0 || !Number.isFinite(value)) throw new Error('Invalid state'); },
    _set(key, value) { s._validate(key, value); s._values[key] = value; },
    _text(key, value) { patches.push([key, value]); }, _attribute() {}, _remote() {},
  };
  return s;
}
test('failed event cannot leave state changed without a matching DOM commit', async () => {
  const s = scope();
  await assert.rejects(runTransaction(s, (values, set, text) => {
    set(0, 38); text(0, '38'); set(0, Infinity);
  }, {}, () => true));
  assert.equal(s._values[0], 37);
  assert.deepEqual(s.patches, []);
});
test('dispose during awaited remote result prevents state and DOM commit', async () => {
  const s = scope(); let alive = true;
  const committed = await runTransaction(s, async (values, set, text) => {
    set(0, 38); await Promise.resolve(); alive = false; text(0, '38');
  }, {}, () => alive);
  assert.equal(committed, false);
  assert.equal(s._values[0], 37);
  assert.deepEqual(s.patches, []);
});
test('synchronous reads see staged writes and only final output is committed', async () => {
  const s = scope();
  assert.equal(await runTransaction(s, (values, set, text) => {
    set(0, 38); assert.equal(values[0], 38); set(0, values[0] + 1); text(0, '39');
  }, {}, () => true), true);
  assert.equal(s._values[0], 39); assert.deepEqual(s.patches, [[0, '39']]);
});

test('captured slots project and commit only the referenced state', async () => {
  const patches = [];
  const state = { _values: [37, 100], _validate(index, value) {
    if (![0, 1].includes(index) || !Number.isFinite(value)) throw new Error('Invalid state');
  }, _set(index, value) { state._values[index] = value; }, _text(index, value) { patches.push(value); } };
  await runTransaction(state, (values, set, text) => { assert.deepEqual(values, [100]); set(0, values[0] + 1); text(0, String(values[0])); }, {}, () => true, [1]);
  assert.deepEqual(state._values, [37, 101]);
  assert.deepEqual(patches, ['101']);
  for (const slots of [[2], [1, 1], Array(1)]) await assert.rejects(runTransaction(state, () => assert.fail('invalid captures must not execute'), {}, () => true, slots));
  await assert.rejects(runTransaction(state, (values, set) => set('length', 99), {}, () => true, [0]));
  assert.deepEqual(state._values, [37, 101]);
});
