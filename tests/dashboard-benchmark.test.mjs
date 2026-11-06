import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tasks, projectSchema } from '../benchmarks/dashboard/model.mjs';
import { summary, networkTransfers } from '../benchmarks/dashboard/statistics.mjs';
import { compile, requireIR } from '../lib/compiler.mjs';
import { toSchemaIR } from '../lib/schema.mjs';
import { renderComponent, generateComponent } from '../lib/codegen.mjs';

test('dashboard has deterministic isolated tasks and one shared form contract', async () => {
  assert.equal(tasks.length, 64);
  assert.equal(new Set(tasks.map(task => task.id)).size, 64);
  const ir = requireIR(compile(await readFile(new URL('../benchmarks/variants/isle/dashboard.isle', import.meta.url), 'utf8')));
  assert.deepEqual(toSchemaIR(ir.schemas.find(schema => schema.name === 'ProjectInput')), projectSchema);
  const task = ir.components.find(component => component.name === 'WorkItem');
  const generated = generateComponent(task);
  assert.deepEqual(generated.handlers.map(handler => handler.id), ['WorkItem.increment', 'WorkItem.reset', 'WorkItem.lock', 'WorkItem.save']);
  assert.ok(generated.fields.every(field => !['description', 'title', 'team'].includes(field.name)), 'static content is never captured');
  const first = renderComponent(task, tasks[0], { scopeId: 'first' });
  const second = renderComponent(task, tasks[1], { scopeId: 'second' });
  assert.notEqual(first.snapshot[2], second.snapshot[2]);
  assert.match(first.html, /data-value="hours"/);
  const plain = renderComponent(task, tasks[0], { mode: 'ssr' });
  assert.equal(plain.snapshot, null);
  assert.doesNotMatch(plain.html, /data-isle-|<!--i:/);
});

test('latency summaries use median and nearest-rank p95 without dropping invalid samples', () => {
  assert.deepEqual(summary([4, 1, 3, 2]), { n: 4, median: 2.5, p95: 4, min: 1, max: 4 });
  assert.equal(summary(Array.from({ length: 20 }, (_, i) => i + 1)).p95, 19);
  for (const sample of [[], [NaN], [Infinity], [-1]]) assert.throws(() => summary(sample));
});

test('transfer accounting includes worker responses, uses browser clocks and counts each asset once', () => {
  const trial = { timeOrigin: 1000000, operations: [{ name: 'cold-increment', start: 50 }], networkResponses: [
    { url: 'http://app.test/', start: 1000000, bytes: 1000, status: 200, type: 'text/html' },
    { url: 'http://app.test/main.js', start: 1000010, bytes: 200, status: 200, type: 'text/javascript' },
    { url: 'http://app.test/worker-loaded.js', start: 1000030, bytes: 300, status: 200, type: 'text/javascript' },
    { url: 'http://app.test/worker-loaded.js', start: 1000060, bytes: 300, status: 200, type: 'text/javascript' },
    { url: 'http://app.test/lazy.js', start: 1000080, bytes: 100, status: 200, type: 'text/javascript' },
    { url: 'http://app.test/graph.json', start: 1000010, bytes: 50, status: 200, type: 'application/json' },
    { url: 'http://app.test/__isle/action/savePlan', start: 1000100, bytes: null, status: 200, type: 'application/json' },
  ] };
  const result = networkTransfers(trial);
  assert.equal(result.html, 1000); assert.equal(result.initialJS, 500); assert.equal(result.allJS, 600);
  assert.equal(result.auxiliary, 50); assert.equal(result.totalAssets, 1650);
  assert.equal(result.requestedJS.length, 3);
  assert.throws(() => networkTransfers({ ...trial, networkResponses: [{ ...trial.networkResponses[1], bytes: null }] }), /payload size/);
});
