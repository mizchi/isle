import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutMetrics } from '../benchmarks/critical-path/metrics.mjs';

test('CLS selects the worst session, with strict one-second and five-second boundaries', () => {
  const entries = [0, 900, 1800, 2700, 3600, 4500, 5000, 6000].map(startTime => ({ startTime, value: .01, hadRecentInput: false }));
  const result = layoutMetrics(entries.reverse());
  assert.ok(Math.abs(result.cls - .06) < 1e-10);
  assert.ok(Math.abs(result.rawShift - .08) < 1e-10);
  assert.equal(result.entries[0].startTime, 0);
});

test('raw shifts expose movement even when recent input excludes it from CLS', () => {
  const result = layoutMetrics([{ startTime: 100, value: .2, hadRecentInput: true }, { startTime: 700, value: .03, hadRecentInput: false }]);
  assert.equal(result.cls, .03);
  assert.equal(result.rawShift, .23);
  assert.deepEqual(layoutMetrics([]), { cls: 0, rawShift: 0, entries: [] });
});
