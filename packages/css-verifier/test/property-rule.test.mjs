// @property: a registered custom property's inherits and initial-value decide what var() reads where it is not set
// (CSS Properties and Values API 1 §2). Checked in Chromium, Firefox and WebKit by e2e/layout-property-rule.spec.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const height = (c, box = '.k') => { const r = analyzeHTML('<html lang="en"><body><div class="m"><div class="k"></div></div></body></html>', {name: 'P', css: `*{margin:0}html,body,.m{${g}}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}); return r.status === 'unknown' ? 'unknown' : r.sizes.find(s => s.box === box && s.rect).rect.blockSize.constant; };

test('inherits: false keeps a value set on the parent from reaching the child; it reads initial-value', () => {
  assert.equal(height('@property --h{syntax:"<length>";inherits:false;initial-value:10px}.m{--h:40px}.k{height:var(--h)}'), '10');
  assert.equal(height('@property --h{syntax:"<length>";inherits:true;initial-value:10px}.m{--h:40px}.k{height:var(--h)}'), '40');
  assert.equal(height('@property --h{syntax:"<length>";inherits:false;initial-value:10px}.k{--h:30px;height:var(--h)}'), '30');
});

test('initial-value is what var() reads where nothing sets the property, and for initial', () => {
  assert.equal(height('@property --h{syntax:"<length>";inherits:true;initial-value:15px}.k{height:var(--h)}'), '15');
  assert.equal(height('@property --h{syntax:"<length>";inherits:true;initial-value:15px}.m{--h:40px}.k{--h:initial;height:var(--h)}'), '15');
  // Unregistered, the same var() has no value: the declaration is invalid and height stays auto (0 here).
  assert.equal(height('.k{height:var(--h)}'), '0');
  // syntax "*" without initial-value: as unregistered, except for inherits.
  assert.equal(height('@property --h{syntax:"*";inherits:false}.m{--h:40px}.k{height:var(--h,5px)}'), '5');
});

test('typed values that compute differently (em, var(), calc) and malformed rules stay Unknown', () => {
  assert.equal(height('@property --h{syntax:"<length>";inherits:true;initial-value:10px}.m{--h:2em}.k{height:var(--h)}'), 'unknown');
  assert.equal(height('@property --h{syntax:"<length>";inherits:true;initial-value:10px}.m{--h:var(--x)}.k{height:var(--h)}'), 'unknown');
  assert.equal(height('@property --h{syntax:"<length>";inherits:true}.k{height:var(--h)}'), 'unknown');
  assert.equal(height('@property --h{syntax:"<length>";initial-value:10px}.k{height:var(--h)}'), 'unknown');
});
