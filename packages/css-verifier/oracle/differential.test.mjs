// Run with `just css-oracle-check`; the oracle must be built first.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOracle, compareCase, generateCase, divergenceKinds} from './differential.mjs';

const oracle = await loadOracle();
const seeds = Number(process.env.CSS_ORACLE_SEEDS ?? 2000);
const html = children => ({tag: 'html', children: [{tag: 'main', classes: ['a'], children}]});
const row = (result, path, property) => result.rows.find(r => r.path === path && r.property === property);

test('the generated corpus has no unexplained cascade differences and enough shared coverage', () => {
  const counts = {}, kinds = {};
  let compared = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const result = compareCase(oracle, generateCase(seed));
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    for (const r of result.rows) {
      if (r.status === 'different') assert.fail(`seed ${seed} ${r.path} ${r.property}: verifier ${JSON.stringify(r.verifier)} vs mizchi/css ${JSON.stringify(r.oracle)}`);
      if (r.status !== 'verifier-unsupported') compared++;
      if (r.divergence) kinds[r.divergence] = (kinds[r.divergence] ?? 0) + 1;
    }
  }
  // A vacuous pass (everything rejected or explained away) is not evidence.
  assert.ok((counts.same ?? 0) > seeds * 0.4, JSON.stringify(counts));
  assert.ok((counts['verifier-unsupported'] ?? 0) < seeds * 0.2, JSON.stringify(counts));
  assert.ok(compared > seeds * 50, `compared ${compared} property values`);
  for (const kind of Object.keys(kinds)) assert.ok(Object.hasOwn(divergenceKinds, kind), kind);
});

test('deliberately broken verifier cascades are reported as differences', () => {
  const each = f => rules => { for (const rule of rules) for (const d of rule.declarations) f(d, rule); return rules; };
  const mutants = {
    'ignore !important': each(d => { d.important = 0; }),
    'ignore specificity': rules => { for (const rule of rules) for (const s of rule.selectors) s.specificity = [0, 0, 0]; return rules; },
    'reverse source order': rules => rules.toReversed(),
    'ignore media conditions': Object.assign(rules => rules, {active: () => true}),
    'swap physical padding sides': each(d => { d.property = {'padding-left': 'padding-right', 'padding-right': 'padding-left'}[d.property] ?? d.property; }),
    'drop column gaps': each(d => { if (d.property === 'column-gap' && d.value !== 'normal' && !d.pending) d.value = '0'; }),
  };
  for (const [name, mutate] of Object.entries(mutants)) {
    let detected = false;
    for (let seed = 1; seed <= 500 && !detected; seed++) detected = compareCase(oracle, generateCase(seed), {mutate}).status === 'different';
    assert.ok(detected, `${name} was not detected`);
  }
});

test('shared semantics agree on a grid with gap, padding and a media override', () => {
  const result = compareCase(oracle, {
    css: '*{box-sizing:border-box}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:4px 2px}.cell{min-width:40px;border:1px solid red}@media (min-width: 500px){.cell{min-width:80px}}',
    tree: html([{tag: 'div', classes: ['row'], children: [{tag: 'div', classes: ['cell']}]}]), width: 600,
  });
  assert.equal(result.status, 'same');
  assert.deepEqual(row(result, 'Doc/0/0', 'grid-template-columns').verifier, ['fr:0px:1', 'fr:0px:1', 'fr:0px:1', 'fr:0px:1']);
  assert.equal(row(result, 'Doc/0/0/0', 'min-inline-size').oracle, '80px');
});

// Each known divergence is pinned with a minimal case so an upstream fix is
// noticed (the case then becomes `same`) and the classifier cannot drift.
const pinned = [
  ['source-order-over-precedence', '.a.b{padding:2px} div{padding-left:9px}', [{tag: 'div', classes: ['a', 'b']}], 'Doc/0/0', 'padding-left', '2px', '9px'],
  ['source-order-over-precedence', '.b{padding-left:3px !important} .b{padding:1px}', [{tag: 'div', classes: ['b']}], 'Doc/0/0', 'padding-left', '3px', '1px'],
  ['overflow-not-coerced', '.b{overflow:visible auto}', [{tag: 'div', classes: ['b']}], 'Doc/0/0', 'overflow-x', 'auto', 'visible'],
  ['wide-keyword-initial', '.b{padding-left:4px} .b{padding-left:initial}', [{tag: 'div', classes: ['b']}], 'Doc/0/0', 'padding-left', '0px', 'auto'],
  ['wide-keyword-initial', '.b{display:initial}', [{tag: 'div', classes: ['b']}], 'Doc/0/0', 'display', 'inline', 'block'],
  ['explicit-normal-gap', '.b{column-gap:normal}', [{tag: 'div', classes: ['b']}], 'Doc/0/0', 'column-gap', 'normal', 'auto'],
  ['inherit-non-inherited', '.a{padding-left:6px} .b{padding-left:inherit}', [{tag: 'div', classes: ['b']}], 'Doc/0/0', 'padding-left', '6px', 'auto'],
  ['var-fallback', '.b{gap:var(--none, 4px)}', [{tag: 'div', classes: ['b']}], 'Doc/0/0', 'column-gap', '4px', 'auto'],
  ['inherited-var-rebinding', ':root{--g:1px;--h:var(--g)} .a{--g:7px} .b{padding-left:var(--h)}', [{tag: 'div', classes: ['b']}], 'Doc/0/0', 'padding-left', '1px', '7px'],
];
for (const [kind, css, children, path, property, verifier, other] of pinned) {
  test(`pinned mizchi/css divergence: ${kind} (${property})`, () => {
    const r = row(compareCase(oracle, {css, tree: html(children), width: 800}), path, property);
    assert.deepEqual({status: r.status, divergence: r.divergence, verifier: r.verifier, oracle: r.oracle},
      {status: 'known-oracle-divergence', divergence: kind, verifier, oracle: other});
  });
}
