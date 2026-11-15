import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// A container query that matches nothing in the checked range (W_CSS_CONTAINER_QUERY_NEVER).
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = css => analyzeHTML('<html lang="en"><body><div class="p"><div class="w"><div class="c"></div></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.w{${g}}.c{height:10px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const never = report => (report.layoutWarnings ?? []).filter(w => w.code === 'W_CSS_CONTAINER_QUERY_NEVER').map(w => [w.query, w.reason]);

test('no container, a missing name, or a container that is never that wide', () => {
  assert.deepEqual(never(run('@container (min-width: 400px){.c{height:30px}}')), [['(min-width: 400px)', 'no-container']]);
  assert.deepEqual(never(run('.w{container-type:inline-size;container-name:side}@container card (min-width: 400px){.c{height:30px}}')), [['card (min-width: 400px)', 'no-container']]);
  assert.deepEqual(never(run('.p{grid-template-columns:300px}.w{container-type:inline-size}@container (min-width: 400px){.c{height:30px}}')), [['(min-width: 400px)', 'size']]);
});

test('a query that matches somewhere is not reported', () => {
  assert.deepEqual(never(run('.w{container-type:inline-size}@container (min-width: 400px){.c{height:30px}}')), []);
  assert.deepEqual(never(run('.w{container-type:inline-size;container-name:card}@container card (max-width: 500px){.c{height:30px}}')), []);
});
