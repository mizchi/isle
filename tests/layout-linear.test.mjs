import test from 'node:test';
import assert from 'node:assert/strict';
import { q, negativeRange, contains } from '../lib/layout/linear.mjs';

test('exact interval solving agrees with an independent bounded arithmetic oracle', () => {
  for (const [minInclusive, maxInclusive] of [[true, true], [true, false], [false, true], [false, false]]) {
    const domain = { min: q(0), max: q(8), minInclusive, maxInclusive };
    for (let slope = -5; slope <= 5; slope++) for (let offset = -10; offset <= 10; offset++) {
      const solved = negativeRange({ a: q(slope), b: q(offset) }, domain);
      for (let quarter = 0; quarter <= 32; quarter++) {
        const width = quarter / 4;
        const inside = (width > 0 || minInclusive) && (width < 8 || maxInclusive);
        assert.equal(Boolean(solved && contains(solved, q(width))), inside && slope * quarter + offset * 4 < 0);
      }
    }
  }
});
