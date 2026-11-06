import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageRanges, unionRanges, rangeBytes, summarizeCPU, sourceFrame } from '../benchmarks/todomvc/profile-metrics.mjs';

test('coverage uses the innermost execution count, preserving UTF-16 to UTF-8 byte accounting', () => {
  const source = 'ab😀cdefgh';
  const functions = [
    { ranges: [{ startOffset: 0, endOffset: 10, count: 1 }] },
    { ranges: [{ startOffset: 2, endOffset: 8, count: 0 }, { startOffset: 4, endOffset: 6, count: 1 }] },
  ];
  const used = coverageRanges(functions, source.length);
  assert.deepEqual(used, [[0, 2], [4, 6], [8, 10]]);
  assert.equal(rangeBytes(source, used), 6);
  const later = coverageRanges([{ ranges: [{ startOffset: 0, endOffset: 10, count: 0 }, { startOffset: 2, endOffset: 8, count: 1 }] }], source.length);
  assert.deepEqual(unionRanges([...used, ...later]), [[0, 10]]);
  assert.equal(rangeBytes(source, unionRanges([...used, ...later])), Buffer.byteLength(source));
  assert.throws(() => coverageRanges([{ ranges: [{ startOffset: 0, endOffset: 11, count: 1 }] }], source.length));
});

test('unmapped generated tails never inherit the last native source location', () => {
  const map = { version: 3, sources: ['runtime/example.mjs'], sourcesContent: ['export function real() {}'], names: [], mappings: 'AAAA' };
  const mapped = sourceFrame({ url: 'http://app.test/shared.js', lineNumber: 0, columnNumber: 0 }, map);
  assert.equal(mapped.originalSource, 'runtime/example.mjs');
  assert.equal(mapped.originalName, 'real');
  const tail = sourceFrame({ url: 'http://app.test/shared.js', lineNumber: 0, columnNumber: 100 }, map);
  assert.equal(tail.sourceMapUnavailable, true);
  assert.equal(tail.originalSource, undefined);
});

test('CPU samples are weighted by actual time deltas and never infer cost from function hit counts', () => {
  const result = summarizeCPU({ startTime: 0, endTime: 2000, nodes: [
    { id: 1, callFrame: { functionName: '(root)', url: '' } },
    { id: 2, callFrame: { functionName: 'each', url: 'http://app.test/a.js', lineNumber: 0, columnNumber: 0 } },
    { id: 3, callFrame: { functionName: '(idle)', url: '' } },
  ], samples: [2, 2, 3], timeDeltas: [100, 200, 1000] }, 'http://app.test/');
  assert.equal(result.appSampledMs, 1.2);
  assert.equal(result.totalSampledMs, 1.9);
  assert.equal(result.functions[0].samples, 2);
  assert.equal(result.functions[0].selfMs, 1.2);
  assert.throws(() => summarizeCPU({ nodes: [], samples: [1], timeDeltas: [] }, 'http://app.test/'));
});

test('out-of-order CPU timestamps are sorted without clamping or discarding samples', () => {
  const profile = { startTime: 0, endTime: 400, nodes: [
    { id: 2, callFrame: { functionName: 'each', url: 'http://app.test/a.js' } },
    { id: 3, callFrame: { functionName: '(idle)', url: '' } },
  ], samples: [2, 2, 3, 2], timeDeltas: [100, 100, -50, 100] };
  const result = summarizeCPU(profile, 'http://app.test/');
  assert.equal(result.negativeDeltasSorted, 1);
  assert.equal(result.appSampledMs, 0.25);
  assert.equal(result.totalSampledMs, 0.3);
  assert.equal(result.functions[0].samples, 3);
});
