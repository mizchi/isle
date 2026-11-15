import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// position: fixed is fixed to the viewport only when no ancestor has a transform (or another property that makes it
// the containing block of fixed descendants): under one, it is placed against that ancestor and scrolls with it.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = card => analyzeHTML(`<html lang="en"><body><main class="page"><div class="card"><div class="bar"></div></div></main></body></html>`,
  {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.page{${g}}.card{${g};height:200px;${card}}.bar{position:fixed;left:0;bottom:0;width:100%;height:56px;background:#123}`, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, accessibility: true});
const contained = report => report.diagnostics.filter(d => d.code === 'U_LAYOUT_FIXED_CONTAINED');

test('a fixed bar inside a transformed ancestor is Unknown, and the diagnostic names the ancestor and why', () => {
  const report = run('transform:translateX(0px)');
  assert.equal(report.status, 'unknown');
  const [d] = contained(report);
  assert.ok(d, JSON.stringify(report.diagnostics.map(x => x.code)));
  assert.equal(d.ancestor, '.card');
  assert.equal(d.property, 'transform');
  assert.match(d.message, /scrolls with/);
  // Without the transform it is modeled against the viewport.
  assert.deepEqual(contained(run('')), []);
  assert.notEqual(run('').status, 'unknown');
  // A scrolling ancestor is a different (unmodeled) case.
  assert.deepEqual(contained(run('overflow:hidden')), []);
});
