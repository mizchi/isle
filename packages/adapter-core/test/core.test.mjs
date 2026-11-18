import test from 'node:test';
import assert from 'node:assert/strict';
import {product, conditionKey, analyzeStates} from '../src/index.mjs';

test('product combines variants and drops contradictory choices', () => {
  const a = [{html: '<a></a>', choices: {open: true}}, {html: '', choices: {open: false}}];
  const b = [{html: '<b></b>', choices: {open: true}}, {html: '<c></c>', choices: {open: false}}];
  assert.deepEqual(product([a, b]).map(v => v.html), ['<a></a><b></b>', '<c></c>']);
  let limited = false;
  assert.equal(product([a, a, a].map(l => l.map((v, i) => ({...v, choices: {[`k${Math.random()}`]: i}}))), {maxStates: 4, onLimit: () => { limited = true; }}).length, 4);
  assert.ok(limited);
});

test('conditionKey: negation and parentheses name the same condition', () => {
  assert.deepEqual(conditionKey('!(open)'), {key: 'open', negate: true});
  assert.deepEqual(conditionKey('!!open'), {key: 'open', negate: false});
});

test('analyzeStates: verified only if every state is, findings list their states', () => {
  const css = '.page{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.w{width:900px;height:20px}';
  const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
  const viewport = {min: 320, max: 800, height: {min: 480, max: 900}};
  const ok = analyzeStates({states: [{html: '<main class="page"><div class="a"></div></main>', choices: {}}], css}, {pageCSS, viewport});
  assert.equal(ok.status, 'verified');
  const two = analyzeStates({states: [{html: '<main class="page"><div class="a"></div></main>', choices: {wide: false}}, {html: '<main class="page"><div class="w"></div></main>', choices: {wide: true}}], css}, {pageCSS, viewport});
  assert.equal(two.status, 'violated');
  assert.deepEqual(two.findings.find(f => f.box === '.w').states, [{wide: true}]);
  assert.equal(analyzeStates({states: [], css}, {pageCSS, viewport}).status, 'unknown');
});

test('a state change that makes the page overflow the viewport shifts it by the scrollbar (W_LAYOUT_SCROLLBAR_SHIFT)', () => {
  const css = '*{margin:0}.short{height:100px}.long{height:900px}';
  const viewport = {min: 400, max: 400, height: {min: 600, max: 600}};
  const states = [{html: '<div class="short"></div>', choices: {open: false}}, {html: '<div class="long"></div>', choices: {open: true}}];
  const shift = analyzeStates({states, css}, {viewport}).findings.find(f => f.code === 'W_LAYOUT_SCROLLBAR_SHIFT');
  assert.ok(shift, 'reported');
  assert.equal(shift.states.length, 2);
  assert.equal(analyzeStates({states, css: css + 'html{scrollbar-gutter:stable}'}, {viewport}).findings.some(f => f.code === 'W_LAYOUT_SCROLLBAR_SHIFT'), false);
  assert.equal(analyzeStates({states: [states[0], {html: '<div class="short"></div><p></p>', choices: {open: true}}], css}, {viewport}).findings.some(f => f.code === 'W_LAYOUT_SCROLLBAR_SHIFT'), false);
});

test('a size transitioned between auto in one state and a length in another jumps (W_CSS_TRANSITION_AUTO)', () => {
  const css = '*{margin:0}.panel{width:100px;transition:height .3s}.panel.open{height:120px}';
  const viewport = {min: 400, max: 400, height: {min: 600, max: 600}};
  const states = [{html: '<div class="panel"></div>', choices: {open: false}}, {html: '<div class="panel open"></div>', choices: {open: true}}];
  const w = analyzeStates({states, css}, {viewport}).findings.find(f => f.code === 'W_CSS_TRANSITION_AUTO');
  assert.ok(w, 'reported'); assert.equal(w.states.length, 2);
  assert.equal(analyzeStates({states, css: css.replace('transition:height .3s', 'transition:height .3s;height:0')}, {viewport}).findings.some(f => f.code === 'W_CSS_TRANSITION_AUTO'), false);
  assert.equal(analyzeStates({states, css: css.replace('transition:height .3s', '')}, {viewport}).findings.some(f => f.code === 'W_CSS_TRANSITION_AUTO'), false);
});
