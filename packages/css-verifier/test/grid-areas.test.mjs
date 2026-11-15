import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// grid-template-areas with grid-area: <name> (and a name in grid-row / grid-column) place items in named areas.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const html = '<html lang="en"><body><div class="p"><header class="h"></header><nav class="n"></nav><main class="m"></main></div></body></html>';
const run = css => analyzeHTML(html, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:grid;grid-template-columns:200px minmax(0,1fr);grid-template-areas:"head head" "nav main";grid-auto-rows:40px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const rect = (report, box) => { const r = report.sizes.find(row => row.box === box && row.rect); return [r.rect.inlineStart.constant, r.rect.blockStart.constant, r.rect.inlineSize.coefficient, r.rect.inlineSize.constant]; };

test('named areas place the items', () => {
  const report = run('.h{grid-area:head}.n{grid-area:nav}.m{grid-area:main}');
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics));
  assert.deepEqual(rect(report, '.h'), ['0', '0', '1', '0']);
  assert.deepEqual(rect(report, '.n'), ['0', '40', '0', '200']);
  assert.deepEqual(rect(report, '.m'), ['200', '40', '1', '-200']);
  // DOM order differs from the areas: still placed by name.
  assert.deepEqual(rect(run('.h{grid-area:main}.n{grid-area:nav}.m{grid-area:head}'), '.m'), ['0', '0', '1', '0']);
  // A name in grid-column / grid-row is the area's lines.
  assert.deepEqual(rect(run('.h{grid-column:head;grid-row:head}.n{grid-area:nav}.m{grid-area:main}'), '.h'), ['0', '0', '1', '0']);
});

test('an undefined area name is a warning and Unknown; invalid templates are Unknown', () => {
  const report = run('.h{grid-area:header}.n{grid-area:nav}.m{grid-area:main}');
  assert.equal(report.status, 'unknown');
  assert.deepEqual((report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_GRID_AREA_UNKNOWN').map(w => [w.box, w.area]), [['.h', 'header']]);
  assert.equal(run('.p{grid-template-areas:"a b" "b b"}.h{grid-area:a}').status, 'unknown');
  assert.equal(run('.p{grid-template-areas:"a b c"}.h{grid-area:a}').status, 'unknown');
});
