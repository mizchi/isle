import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setImmediate } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { createResourceOwner } from '../runtime/resource-owner.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
// Obtain current witnesses from the executable MoonBit model, rather than a stored fixture.
const run = spawnSync('moon', ['run', 'cmd/verify', '--target', 'js'], { encoding: 'utf8', timeout: 60000 });
if (run.error) throw run.error;
assert.equal(run.status, 0, run.stderr);
const report = JSON.parse(run.stdout), results = [];
const schedules = report.cases.filter(entry => entry.name.startsWith('resource-disposal/') && entry.category === 'broken-implementation');
assert.equal(schedules.length, 9);

for (const scenario of schedules) test(`correct cleanup kernel handles the model schedule: ${scenario.name}`, async () => {
  assert.equal(scenario.witness_replayed, true);
  const errors = [], owners = [createResourceOwner({ onError: error => errors.push(error) })], records = [];
  let current = owners[0];
  function invariants() {
    for (const record of records) {
      if (!record) continue;
      assert.ok(record.releases <= 1); assert.ok(record.aborts <= 1);
      if (record.releases) { assert.equal(record.acquired, true); assert.equal(record.owner.disposed, true); }
      if (record.owner.disposed) {
        assert.equal(record.handle.state, 'disposed'); assert.throws(() => record.handle.read(), /disposed/);
        if (record.acquired) assert.equal(record.releases, 1, 'late acquisition must be released after its fulfillment has been delivered');
      } else if (record.acquired) assert.equal(record.handle.read(), record.value);
    }
  }
  for (const action of scenario.witness_actions) {
    const match = /^(Start|Acquire|AcquireFails|Publish|BeginRelease|FinishRelease|FailRelease)([01])$/.exec(action);
    const index = match ? Number(match[2]) : undefined, record = records[index];
    if (action === 'Unmount') current.dispose();
    else if (action === 'Recreate') { current = createResourceOwner({ onError: error => errors.push(error) }); owners.push(current); }
    else if (match?.[1] === 'Start') {
      const r = { owner: current, acquisition: deferred(), cleanup: deferred(), value: { id: index }, acquired: false, acquisitionDone: false, cleanupDone: false, releases: 0, aborts: 0 };
      r.handle = current.acquire(signal => {
        signal.addEventListener('abort', () => { r.aborts++; }, { once: true }); return r.acquisition.promise;
      }, value => { assert.equal(value, r.value); r.releases++; return r.cleanup.promise; });
      records[index] = r;
    } else if (match?.[1] === 'Acquire') {
      record.acquired = true; record.acquisitionDone = true; record.acquisition.resolve(record.value);
    } else if (match?.[1] === 'AcquireFails') {
      record.acquisitionDone = true; record.acquisition.reject(new Error('acquisition failed'));
    } else if (match?.[1] === 'FinishRelease' && record.releases && !record.cleanupDone) {
      record.cleanupDone = true; record.cleanup.resolve();
    } else if (match?.[1] === 'FailRelease' && record.releases && !record.cleanupDone) {
      record.cleanupDone = true; record.cleanup.reject(new Error('destructor failed'));
    }
    // Publish/BeginRelease belong to the kernel, never to the external driver. Its
    // synchronous paths and fulfilled-promise jobs refine those abstract steps.
    await setImmediate(); invariants();
  }
  for (const owner of owners) owner.dispose();
  for (const record of records) if (record) {
    if (!record.acquisitionDone) { record.acquisitionDone = true; record.acquisition.reject(new Error('cancelled')); }
    if (!record.cleanupDone) { record.cleanupDone = true; record.cleanup.resolve(); }
  }
  await Promise.all(owners.map(owner => owner.settled())); invariants();
  results.push({ name: scenario.name, actions: scenario.witness_actions, passed: true,
    interpretation: 'External schedule replay against the corrected kernel; internal publish/release steps are automatic, not an equivalence proof.',
    resources: records.map(record => record ? { acquired: record.acquired, releases: record.releases, aborts: record.aborts, state: record.handle.state } : null),
    cleanupErrors: errors.length });
});

after(async () => {
  const directory = new URL('../evals/results/resource-disposal/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('replay.json', directory), JSON.stringify({ version: 1, expectedSchedules: 9, passed: results.length === 9 && results.every(result => result.passed), results }, null, 2) + '\n');
});
