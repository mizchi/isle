import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeClickTiming } from '../benchmarks/heavy-render/statistics.mjs';

test('native click statistics report missing thresholded events without zero filling', () => {
  const result = nativeClickTiming([{ operations: [
    { name: 'warm-bulk', start: 100, trusted: true }, { name: 'warm-bulk', start: 200, trusted: true },
    { name: 'warm-bulk', start: 300, trusted: true }, { name: 'warm-bulk', start: 400, trusted: false },
  ], eventTimings: [
    { name: 'click', startTime: 100.1, duration: 16, interactionId: 1 },
    { name: 'click', startTime: 199.9, duration: 24, interactionId: 2 },
    { name: 'pointerup', startTime: 300, duration: 80, interactionId: 3 },
  ] }], 'warm-bulk');
  assert.equal(result.attempts, 3);
  assert.equal(result.reported, 2);
  assert.equal(result.unreported, 1);
  assert.equal(result.latency.median, 20);
  assert.equal(result.latency.n, 2);
});

test('ambiguous or absent event timing stays missing rather than choosing a convenient duration', () => {
  const result = nativeClickTiming([{ operations: [{ name: 'warm-bulk', start: 100, trusted: true }], eventTimings: [
    { name: 'click', startTime: 100.1, duration: 16, interactionId: 1 },
    { name: 'click', startTime: 100.2, duration: 24, interactionId: 2 },
  ] }], 'warm-bulk');
  assert.equal(result.ambiguous, 1);
  assert.equal(result.reported, 0);
  assert.equal(result.latency, null);
  assert.equal(nativeClickTiming([], 'warm-bulk').latency, null);
});
