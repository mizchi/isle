import test from 'node:test';
import assert from 'node:assert/strict';
import { createInteraction } from '../runtime/profile.mjs';

test('overlapping interactions use numeric timestamps and separate invocation IDs', () => {
  let now = 0;
  const entries = [], performance = { now: () => now, measure: (name, options) => entries.push({ name, ...options }) };
  const first = createInteraction(performance, 'Counter.increment', 'a', 'click');
  now = 1;
  const second = createInteraction(performance, 'Counter.increment', 'b', 'click');
  const end = first.begin('code', { url: 'https://example.test/counter.js', cached: false });
  now = 5; second.finish('cancelled');
  now = 8; end(); first.finish('ok'); first.finish('error');
  assert.deepEqual(entries.map(entry => [entry.name, entry.start, entry.end, entry.detail.status]), [
    ['isle:Counter.increment:interaction', 1, 5, 'cancelled'],
    ['isle:Counter.increment:code', 1, 8, 'ok'],
    ['isle:Counter.increment:interaction', 0, 8, 'ok'],
  ]);
  assert.notEqual(entries[0].detail.invocation, entries[1].detail.invocation);
  assert.equal(entries[1].detail.scopeId, 'a');
  assert.equal(entries[1].detail.handlerId, 'Counter.increment');
  assert.equal(entries[1].detail.url, 'https://example.test/counter.js');
  assert.equal(entries[1].detail.cached, false);
});

test('profiling wrappers preserve return values, cancellation and thrown errors', async () => {
  let now = 0;
  const entries = [], timing = createInteraction({ now: () => ++now,
    measure: (name, options) => entries.push({ name, ...options }) }, 'Editor.save', 'a', 'click');
  assert.equal(timing.sync('restore', () => 37), 37);
  assert.equal(await timing.measure('run', async () => false, undefined, value => value ? 'ok' : 'cancelled'), false);
  const error = new Error('broken');
  assert.throws(() => timing.sync('restore', () => { throw error; }), value => value === error);
  await assert.rejects(timing.measure('code', async () => { throw error; }), value => value === error);
  assert.deepEqual(entries.map(entry => entry.detail.status), ['ok', 'cancelled', 'error', 'error']);
});
