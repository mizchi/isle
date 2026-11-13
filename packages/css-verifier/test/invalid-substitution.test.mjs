// CSS Variables 1 section 3: a declaration whose var() reference is
// guaranteed-invalid is invalid at computed-value time and behaves as unset.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLayout} from '../src/index.mjs';

const tree = () => ({tag: 'main', classes: ['row'], children: Array.from({length: 4}, () => ({tag: 'div', classes: ['cell']}))});
const base = '* { box-sizing: border-box; }\n.row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }\n';
// The ancestor chain closes the environment: nothing can be inherited from outside html.
const run = css => analyzeLayout(tree(), {name: 'Four', css: base + css, viewport: {min: 160, max: 640}, ancestors: [{tag: 'html'}]});
const status = (report, expected) => assert.equal(report.status, expected, JSON.stringify(report.diagnostics));

test('a missing reference without fallback makes the declaration unset, not the earlier value', () => {
  // 80px would fail at 160px; unset (auto) has no minimum.
  const report = run('.cell { min-width: 80px; min-width: var(--missing); }\n');
  status(report, 'verified');
  assert.deepEqual(report.invalidSubstitutions.map(({path, property, longhands, css, reason, resolution}) => [path, property, longhands, css.line, reason, resolution]),
    [0, 1, 2, 3].map(i => [`Four/${i}`, 'min-width', ['min-inline-size'], 3, 'guaranteed-invalid', 'unset']));
});

test('an invalid shorthand resets every longhand it writes and loses to later longhands as usual', () => {
  const report = run('.row { gap: 40px; } .row { gap: var(--missing); }\n.cell { min-width: 40px; }\n');
  status(report, 'verified'); // gap normal = 0: 4 × 40px fits from 160px
  const later = run('.row { gap: var(--missing); }\n.row { column-gap: 8px; }\n.cell { min-width: 40px; }\n');
  status(later, 'violated');
  assert.ok(later.diagnostics.every(d => d.code === 'E_LAYOUT_ITEM_SIZE'), JSON.stringify(later.diagnostics));
  assert.deepEqual(later.invalidSubstitutions[0].longhands, ['row-gap']);
  const padding = run('.cell { box-sizing: content-box; width: 100%; padding: 8px; padding: var(--missing); }\n');
  status(padding, 'verified');
});

test('unset keeps inherited properties inherited', () => {
  const report = analyzeLayout({tag: 'main', classes: ['row'], children: [{tag: 'p', classes: ['t'], text: true}]}, {name: 'Text',
    css: '* { box-sizing: border-box; margin: 0; }\n.row { display: grid; grid-template-columns: minmax(0, 1fr); white-space: nowrap; }\n.t { white-space: var(--missing); }\n',
    viewport: {min: 100, max: 400}, ancestors: [{tag: 'html'}], boxes: {'.t': {minInlineSize: 50, wrap: 'nowrap'}}});
  status(report, 'verified');
});

test('a non-conditional reference cycle is guaranteed-invalid', () => {
  const cycle = run('.row { --a: var(--b); --b: var(--a); }\n.cell { min-width: 80px; min-width: var(--a); }\n');
  status(cycle, 'verified');
  assert.equal(cycle.invalidSubstitutions[0].reason, 'cycle');
  status(run('.cell { --self: var(--self); min-width: var(--self, 80px); }\n'), 'violated');
});

test('unknown inputs stay unknown', () => {
  // External inheritance cannot be decided without the ancestor chain.
  status(analyzeLayout(tree(), {name: 'Four', css: base + '.cell { min-width: var(--x); }\n', viewport: {min: 160, max: 640}, ancestors: undefined}), 'unknown');
  // A cycle through a dormant fallback is outside the portable subset.
  status(run('.row { --safe: 80px; --a: var(--safe, var(--b)); --b: var(--a); }\n.cell { min-width: var(--a); }\n'), 'unknown');
  // Substituted tokens outside the layout subset are not assumed invalid.
  status(run('.row { --n: 40; }\n.cell { min-width: var(--n)px; }\n'), 'unknown');
});
