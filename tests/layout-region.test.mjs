import test from 'node:test';
import assert from 'node:assert/strict';
import { q, cmp } from '../lib/layout/linear.mjs';
import { rectangle, partition, sample, evaluate, projection,clip,serialize } from '../lib/layout/region.mjs';

test('serialized constraints remove repeated positive scaling while preserving strict boundaries',()=>{
  let region=rectangle({min:q(0),max:q(100)},{min:q(0),max:q(100)});
  for(const [x,b,strict] of [[2,-20,false],[1,-10,true],[0,1,false],[4,-40,false]]) region=clip(region,{x:q(x),y:q(0),b:q(b)},strict);
  const report=serialize(region);
  assert.deepEqual(report.constraints,[{coefficient:'1',constant:'-10',strict:true}]);
  for(const width of [0,10,10.5,100]) {
    const actual=report.constraints.every(c=>Number(c.coefficient)*width+Number(c.constant)>(c.strict ? 0 : -Number.EPSILON));
    assert.equal(actual,width>10);
  }
});

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
