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

test('3D values with depth and an arbitrary rotation with another transform stay Unknown', () => {
  // (A z scale does nothing to a flat box: scale: 1 1 2 is scale: 1 1, checklist B1.)
  for (const c of ['.a{translate:1px 2px 3px}', '.a{rotate:x 90deg}', '.a{rotate:30deg;translate:1px}']) assert.equal(run(c).status, 'unknown', c);
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

// Checklist B1: 3D syntax without depth is the 2D transform (a flat box has z = 0, so a zero z translation and a z scale
// change nothing; a rotation about z is a 2D rotation). translateZ(0) still makes a containing block for fixed boxes,
// as any transform other than none does.
test('3D transforms without depth analyse as their 2D equivalents', () => {
  same('.a{transform:translateZ(0)}', '.a{transform:translate(0)}');
  same('.a{transform:translate3d(10px, 20px, 0)}', '.a{transform:translate(10px, 20px)}');
  same('.a{transform:translate3d(10px, 20px, 0px) scale3d(2, 1, 5)}', '.a{transform:translate(10px, 20px) scale(2, 1)}');
  same('.a{transform:rotateZ(90deg) scaleZ(3)}', '.a{transform:rotate(90deg)}');
  same('.a{transform:rotate3d(0, 0, 1, 90deg)}', '.a{transform:rotate(90deg)}');
  same('.a{transform:rotate3d(0, 0, -2, 90deg)}', '.a{transform:rotate(-90deg)}');
  same('.a{translate:10px 20px 0}', '.a{translate:10px 20px}');
  same('.a{rotate:z 90deg}', '.a{rotate:90deg}');
  same('.a{rotate:0 0 1 90deg}', '.a{rotate:90deg}');
  same('.a{scale:2 1 4}', '.a{scale:2 1}');
  for (const c of ['.a{transform:translateZ(10px)}', '.a{transform:rotateX(45deg)}', '.a{transform:rotate3d(1, 0, 0, 90deg)}', '.a{rotate:x 90deg}', '.a{transform:perspective(500px) translateZ(0)}']) assert.equal(run(c).status, 'unknown', c);
});

// Checklist B2: an arbitrary rotation composed with other transforms. The composed map's circumscribed rectangle (about
// the box's centre, moved by the translation) is what the box may cover — the accessibility checks treat it as
// undecided, as for a lone arbitrary rotation.
test('an arbitrary rotation composed with translations and scales is bounded by the composed rectangle', () => {
  const acc = c => analyzeHTML('<html lang="en"><body><main class="p"><button class="a" aria-label="A"></button><button class="b" aria-label="B"></button></main></body></html>', {name: 'P', css: `*{margin:0}html,body{${g}}.p{display:grid;grid-template-columns:100px;grid-auto-rows:40px;row-gap:100px;background:#fff;color:#000}.a,.b{border:0;padding:0;background:#ddd;color:#000;width:100px;height:40px}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, accessibility: true});
  // Far from .b (row gap 100px) the rotated .a covers nothing: decided.
  for (const c of ['.a{transform:rotate(30deg) translateX(10px)}', '.a{transform:rotate(15deg) scale(1.5)}', '.a{rotate:30deg;scale:1.2}']) assert.notEqual(acc(c).status, 'unknown', `${c}: ${JSON.stringify(acc(c).diagnostics.map(d => d.message))}`);
  // Moved 120px down onto .b, it may cover it: undecided, as for a lone arbitrary rotation over a box.
  const over = acc('.a{transform:translate(0, 120px) rotate(30deg)}');
  assert.equal(over.status, 'unknown');
  assert.match(over.diagnostics[0].message, /\.b lies under the circumscribed rectangle of the rotated \.a/);
  assert.equal(JSON.stringify(acc('.a{rotate:30deg;translate:0 120px}').diagnostics), JSON.stringify(over.diagnostics));
  // The bound follows the translation: 10px across does not reach .b, 60px down with a 1.5 scale does not either.
  assert.notEqual(acc('.a{transform:translate(0, 40px) rotate(10deg)}').status, 'unknown');
  // em translations and the integrity checks (overflow) stay Unknown, as for a lone arbitrary rotation.
  assert.equal(acc('.a{transform:rotate(30deg) translateX(1em)}').status, 'unknown');
});

// Checklist B3: transform-origin. About an origin O the map is O + A(p − O) + t, which is the map about the centre C
// plus the translation (I − A)(O − C); the box here is 100 × 40, its centre (50, 20).
test('transform-origin adds (I − A)(O − C) to the map about the centre', () => {
  same('.a{transform-origin:0 0;transform:scale(2)}', '.a{transform:translate(50px, 20px) scale(2)}');
  same('.a{transform-origin:top left;transform:scale(2)}', '.a{transform:translate(50px, 20px) scale(2)}');
  same('.a{transform-origin:100% 100%;scale:0.5}', '.a{transform:translate(25px, 10px) scale(0.5)}');
  same('.a{transform-origin:right bottom;scale:0.5}', '.a{transform:translate(25px, 10px) scale(0.5)}');
  same('.a{transform-origin:10px 0;transform:rotate(90deg)}', '.a{transform:translate(-60px, 20px) rotate(90deg)}');
  same('.a{transform-origin:center;transform:scale(2)}', '.a{transform:scale(2)}');
  same('.a{transform-origin:0 0 0;transform:scale(2)}', '.a{transform:translate(50px, 20px) scale(2)}');
  for (const c of ['.a{transform-origin:1em 0;transform:scale(2)}', '.a{transform-origin:0 0 5px;transform:scale(2)}']) assert.equal(run(c).status, 'unknown', c);
});
