import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { measureBytes, sumSizes } from '../benchmarks/todomvc/metrics.mjs';

test('TodoMVC sizes sum independently compressed byte bodies, including tiny chunks', () => {
  const a = Buffer.from('export const café = 1;'), b = Buffer.from('export const x = 2;');
  const sizes = [measureBytes(a), measureBytes(b)];
  const total = sumSizes(sizes);
  assert.equal(total.raw, a.length + b.length);
  assert.equal(total.gzip, gzipSync(a, { level: 6 }).length + gzipSync(b, { level: 6 }).length);
  assert.equal(total.br, sizes[0].br + sizes[1].br);
  assert.notEqual(total.gzip, measureBytes(Buffer.concat([a, b])).gzip);
  assert.deepEqual(sumSizes([]), { raw: 0, gzip: 0, br: 0 });
});
