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

test('rotation angles: a leading-dot number and grad units are the same turns', () => {
  same('.a{transform:rotate(.25turn)}', '.a{transform:rotate(90deg)}');
  same('.a{rotate:.5turn}', '.a{transform:rotate(180deg)}');
  same('.a{transform:rotate(100grad)}', '.a{transform:rotate(90deg)}');
  same('.a{rotate:-100grad}', '.a{transform:rotate(-90deg)}');
});

test('rad angles: zero is no turn; any other is an arbitrary rotation (accessibility only), not a quarter turn', () => {
  same('.a{transform:rotate(0rad)}', '.a{transform:rotate(0deg)}');
  const acc = c => analyzeHTML('<html lang="en"><body><main class="p"><button class="a" aria-label="A"></button></main></body></html>', {name: 'P', css: `*{margin:0}html,body{${g}}.p{display:grid;grid-template-columns:100px;grid-auto-rows:40px;background:#fff;color:#000}.a{border:0;padding:0;background:#ddd;color:#000;width:100px;height:40px}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, accessibility: true});
  assert.equal(JSON.stringify(acc('.a{rotate:0.5rad}').diagnostics), JSON.stringify(acc(`.a{rotate:${0.5 * 180 / Math.PI}deg}`).diagnostics));
  assert.notEqual(acc('.a{rotate:1.5708rad}').status, 'unknown');
  assert.equal(run('.a{rotate:1rad;translate:1px}').status, 'unknown');
});

test('an angle too small to write without an exponent stays Unknown', () => {
  assert.equal(run('.a{rotate:0.0000001rad}').status, 'unknown');
});
