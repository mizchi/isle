import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compile, requireIR } from '../lib/compiler.mjs';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';

const source = await readFile(new URL('../evals/scenarios/forms/shared.isle', import.meta.url), 'utf8');

test('a schema form projects native constraints and a lazy form boundary without duplicate state', () => {
  const ir = requireIR(compile(source)), component = ir.components[0], generated = generateComponent(component);
  assert.deepEqual(generated.fields, []);
  assert.deepEqual(generated.events, ['input', 'change', 'focusout', 'invalid', 'submit', 'reset']);
  assert.equal(generated.handlers.length, 1);
  assert.equal(generated.handlers[0].form.action, 'register');
  assert.deepEqual(generated.handlers[0].captures, []);
  const html = renderComponent(component, {}, { scopeId: 'a' }).html;
  const email = html.match(/<input[^>]*name="email"[^>]*>/)[0];
  for (const attribute of [/type="email"/, /minlength="3"/, /maxlength="80"/, / required/]) assert.match(email, attribute);
  assert.match(html, /name="accepted"[^>]*type="checkbox"[^>]*required/);
  assert.match(html, /data-isle-form/);
  assert.match(html, /role="alert"/);
  assert.match(html, /data-isle-error="confirmation"/);
  assert.doesNotMatch(html, / schema=| submit=/);
  const ssr = renderComponent(component, {}, { mode: 'ssr' });
  assert.equal(ssr.snapshot, null);
  assert.doesNotMatch(ssr.html, /data-isle-|<!--i:/);
});

test('form contracts reject unknown schemas, conflicting native rules and ambiguous controls', () => {
  for (const [text, code] of [
    [source.replace('schema="Registration"', 'schema="Missing"'), 'E_FORM_SCHEMA'],
    [source.replace('submit="register"', 'submit="missing"'), 'E_FORM_SCHEMA'],
    [source.replace('name="email" autocomplete', 'name="email" maxlength="2" autocomplete'), 'E_FORM_SCHEMA'],
    [source.replace('name="confirmation"', 'name="email"'), 'E_FORM_SCHEMA'],
    [source.replace('<button type="submit">', '<button type="submit" name="intent">'), 'E_FORM_SCHEMA'],
    [source.replaceAll('confirmation', 'querySelectorAll'), 'E_FORM_SCHEMA'],
    [source.replace('client component SchemaSignup', 'server component SchemaSignup'), 'E_FORM_SCHEMA'],
  ]) { const result = compile(text); assert.equal(result.ok, false); assert.equal(result.diagnostics[0].code, code, JSON.stringify(result)); }
  assert.match(compile(source.replace('schema="Registration"', 'schema="Missing"')).diagnostics[0].message, /Missing/);
});
