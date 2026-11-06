import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { q, exact } from '../lib/layout/linear.mjs';
import { scalar, times } from '../lib/layout/region.mjs';
import { inheritTracks } from '../lib/layout/subgrid.mjs';

test('the build-only geometry kernel matches all 162 MoonBit/veri configurations and nested axes', () => {
  const report = JSON.parse(execFileSync('moon', ['run', 'cmd/subgrid-model', '--target', 'js'], { encoding: 'utf8' }));
  assert.equal(report.veri_version, '0.2.1');
  assert.ok(report.complete && report.strict_safe && report.independent_counterexample_replayed);
  assert.equal(report.reachable_configurations, 162);
  assert.equal(report.cases.length, 162);
  for (const row of report.cases) {
    const { start, span, gap, before, after } = row.configuration;
    const values = inheritTracks({ values: [4, 8, 12].slice(start, start + span).map(scalar), gap: q(2) }, q(gap), q(before), q(after));
    assert.deepEqual(values.map(value => exact(times(value, q(2)).b)), row.doubled.map(String));
    const nested = inheritTracks({ values, gap: q(gap) }, q(1), q(1), q(0));
    assert.deepEqual(nested.map(value => exact(times(value, q(4)).b)), row.nested_quadrupled.map(String));
  }
});
