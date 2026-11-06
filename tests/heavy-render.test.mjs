import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { analyzeCosts, checkCostBudgets } from '../lib/cost.mjs';
import { makeHeavySource, products, expectedProduct, scenarioSizes } from '../benchmarks/heavy-render/scenario.mjs';

test('the real catalog workload scales static patch bounds and preserves a cheap independent action', () => {
  assert.deepEqual(scenarioSizes, [128, 1024, 4096]);
  for (const rows of [1, 32, 256]) {
    const input = requireIR(compile(makeHeavySource(rows)));
    const report = analyzeCosts(input, { mounts: [{ component: 'Page' }] });
    const sheet = report.entries.find(entry => entry.id === 'Sheet.addAll');
    const audit = report.entries.find(entry => entry.id === 'Audit.check');
    assert.equal(sheet.work.textPatchCalls.value, rows * 3 + 1);
    assert.equal(sheet.work.attributePatchCalls.value, rows);
    assert.equal(sheet.work.createdElements.value, 0);
    assert.equal(audit.work.textPatchCalls.value, 1);
    assert.equal(sheet.restore.snapshotSlots, 1);
    assert.equal(sheet.restore.childOwners, 0);
    assert.equal(report.scenario.resumableOwners, 2);
    assert.ok(!JSON.stringify(sheet.reasons).includes('unused'));
    assert.equal(checkCostBudgets(report, [{ entry: 'Sheet.addAll', metric: 'textPatchCalls', max: 385 }]).ok, rows <= 128);
  }
});

test('catalog handlers execute the predicted work and calculate all rows rather than a dummy busy loop', async () => {
  for (const rows of [1, 32, 128]) {
    const input = requireIR(compile(makeHeavySource(rows))), program = prepareProgram(input);
    const generated = program.get('Sheet').generate(), handler = generated.handlers[0];
    const entry = analyzeCosts(input).entries.find(entry => entry.id === handler.id);
    const snapshot = program.render('Sheet', { initialAdjustment: 0 }).snapshot;
    let reads = 0;
    const values = new Proxy(handler.captures.map(index => snapshot[3][index]), { get(target, key, receiver) {
      if (/^\d+$/.test(String(key))) reads++;
      return Reflect.get(target, key, receiver);
    } });
    const text = [], attributes = [];
    const module = await import(`data:text/javascript,${encodeURIComponent(handler.code)}`);
    await module.run(values, (key, value) => { values[key] = value; }, (id, value) => text.push(value), (id, name, value) => attributes.push([name, value]));
    assert.equal(reads, entry.work.slotReads.value);
    assert.equal(text.length, entry.work.textPatchCalls.value);
    assert.equal(attributes.length, entry.work.attributePatchCalls.value);
    assert.equal(text[0], '1');
    for (let index = 0; index < rows; index++) {
      const expected = expectedProduct(products[index], 1);
      assert.deepEqual(text.slice(1 + index * 3, 4 + index * 3), [String(expected.quantity), String(expected.cost), String(expected.weight)]);
      assert.deepEqual(attributes[index], ['data-cost', expected.cost]);
    }
  }
});

test('the workload bounds its generated catalog and does not ship benchmark instrumentation', () => {
  for (const rows of [0, -1, 1.5, NaN, Infinity, 4097]) assert.throws(() => makeHeavySource(rows), /rows/i);
  const source = makeHeavySource(4);
  assert.ok(!/setTimeout|performance\.|while\s*\(|inline\(/.test(source));
  assert.equal(products.length, 4096);
});
