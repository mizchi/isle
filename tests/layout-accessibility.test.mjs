// Accessibility rules over Isle templates: attribute facts come from the IR
// (static values) and stay Unknown when a dynamic value decides them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compile, requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '../lib/layout.mjs';

const css = '*{box-sizing:border-box;margin:0}.bar{display:grid;grid-template-columns:100px 100px;grid-template-rows:40px}.b,.c{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0}';
const options = {component: 'Bar', css, viewport: {min: 320, max: 800, height: {min: 400, max: 800}}, accessibility: true};
const run = (template, extra = {}) => analyzeLayout(requireIR(compile(`component Bar(label: string) {\n  ${template}\n}`)), {...options, ...extra});
const codes = report => report.diagnostics.map(d => d.code);

test('static name attributes in a template name an empty button; a missing one is an error', () => {
  assert.ok(!codes(run('<main class="bar"><button class="b" aria-label="Close"></button></main>')).includes('E_A11Y_NAME'));
  const report = run('<main class="bar"><button class="b"></button><a class="c" href="/x"></a></main>');
  assert.deepEqual(report.diagnostics.filter(d => d.code === 'E_A11Y_NAME').map(d => d.box), ['.b', '.c']);
});

test('a dynamic name or aria-hidden value is Unknown, never verified', () => {
  const named = run('<main class="bar"><button class="b" aria-label={label}></button></main>');
  assert.equal(named.status, 'unknown');
  assert.ok(codes(named).includes('U_A11Y_NAME'));
  const hidden = run('<main class="bar" aria-hidden={label}><button class="b" aria-label="x"></button></main>');
  assert.equal(hidden.status, 'unknown');
  assert.ok(codes(hidden).includes('U_A11Y_HIDDEN_FOCUSABLE'));
});
