// The individual transform properties (translate, rotate, scale) compose with transform as
// translate · rotate · scale · transform (CSS Transforms 2 §6): the analysis of each combination is the analysis of
// that one transform list.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = c => analyzeHTML('<html lang="en"><body><main class="p"><button class="a" aria-label="A"></button><button class="b" aria-label="B"></button></main></body></html>', {name: 'P', css: `*{margin:0}html,body{${g}}.p{display:grid;grid-template-columns:100px;grid-auto-rows:40px;background:#fff;color:#000}.a,.b{border:0;padding:0;background:#ddd;color:#000;width:100px;height:40px}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, accessibility: true, integrity: true});
const same = (a, b) => assert.deepEqual(JSON.stringify(run(a).diagnostics), JSON.stringify(run(b).diagnostics), `${a} vs ${b}`);

test('translate, rotate and scale compose as translate · rotate · scale · transform', () => {
  same('.a{translate:0 30px}', '.a{transform:translate(0,30px)}');
  same('.a{translate:40px;scale:2}', '.a{transform:translate(40px) scale(2)}');
  same('.a{scale:2;translate:40px}', '.a{transform:translate(40px) scale(2)}');
  same('.a{rotate:90deg;scale:1 2}', '.a{transform:rotate(90deg) scale(1,2)}');
  same('.a{translate:10px 20%;rotate:0.25turn;scale:150%;transform:translateY(5px)}', '.a{transform:translate(10px,20%) rotate(0.25turn) scale(1.5) translateY(5px)}');
  // Order matters: the reverse is another map.
  assert.notEqual(JSON.stringify(run('.a{translate:40px;scale:2}').diagnostics), JSON.stringify(run('.a{transform:scale(2) translate(40px)}').diagnostics));
  assert.equal(run('.a{translate:0 30px}').status, 'violated');
  assert.equal(run('.a{translate:none;rotate:none;scale:none}').status, run('').status);
});

test('3D values and an arbitrary rotation with another transform stay Unknown', () => {
  for (const c of ['.a{translate:1px 2px 3px}', '.a{scale:1 1 2}', '.a{rotate:x 90deg}', '.a{rotate:30deg;translate:1px}']) assert.equal(run(c).status, 'unknown', c);
});
