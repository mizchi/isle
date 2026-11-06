import test from 'node:test';
import assert from 'node:assert/strict';
import { q, cmp } from '../lib/layout/linear.mjs';
import { rectangle, partition, sample, evaluate, projection } from '../lib/layout/region.mjs';

test('convex region partitions agree with an independent 2-D integer oracle', () => {
  const domain = rectangle({ min: q(0), max: q(4) }, { min: q(0), max: q(4) });
  for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let offset = -4; offset <= 4; offset++) {
    const expression = { x: q(x), y: q(y), b: q(offset) };
    for (const relation of ['<', '<=', '>', '>=', '=']) {
      const result = partition(domain, expression, relation);
      for (const region of [...result.yes, ...result.no]) assert.ok(region.constraints.every(c => cmp(evaluate(c.slack, sample(region)), q(0)) >= (c.strict ? 1 : 0)));
      for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8; b++) {
        const point = { x: q(a / 2), y: q(b / 2) }, value = x * a + y * b + offset * 2;
        const expected = relation === '<' ? value < 0 : relation === '<=' ? value <= 0 : relation === '>' ? value > 0 : relation === '>=' ? value >= 0 : value === 0;
        const inside = regions => regions.some(region => region.constraints.every(c => cmp(evaluate(c.slack, point), q(0)) >= (c.strict ? 1 : 0)));
        assert.equal(inside(result.yes), expected);
        assert.equal(inside(result.no), !expected);
      }
    }
  }
});

test('strict diagonal cuts retain open projections and degenerate equality regions', () => {
  const domain = rectangle({ min: q(0), max: q(4) }, { min: q(0), max: q(4) });
  const { yes } = partition(domain, { x: q(1), y: q(1), b: q(-4) }, '>');
  assert.equal(projection(yes[0], 'x').minInclusive, false);
  const equality = partition(domain, { x: q(1), y: q(1), b: q(-4) }, '=').yes[0];
  assert.equal(equality.vertices.length, 2);
  assert.equal(projection(equality, 'y').maxInclusive, true);
});
