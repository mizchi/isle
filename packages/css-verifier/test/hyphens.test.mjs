import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// hyphens: auto needs the content language (the lang attribute on the element or an ancestor): with none, browsers do
// not hyphenate, so the text breaks like hyphens: manual and the declaration does nothing (W_LAYOUT_HYPHENS_NO_LANG).
// With a language, where the words break is the hyphenation dictionary's, which is not modeled: Unknown.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (doc, css) => analyzeHTML(doc, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.page{${g}}.t{line-height:20px;${css}}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.t': {minInlineSize: 40, intrinsicBlockSize: 20}}});
const warned = report => (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_HYPHENS_NO_LANG').map(w => w.box);
const body = '<body><main class="page"><p class="t">Internationalization</p></main></body>';

test('hyphens: auto without a language is manual, with a warning; with one it stays Unknown', () => {
  const none = run(`<html>${body}</html>`, 'hyphens:auto');
  assert.notEqual(none.status, 'unknown', JSON.stringify(none.diagnostics.map(d => d.message)));
  assert.deepEqual(warned(none), ['.t']);
  // Inherited from an ancestor.
  const inherited = analyzeHTML(`<html>${body}</html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.page{${g};hyphens:auto}.t{line-height:20px}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.t': {minInlineSize: 40, intrinsicBlockSize: 20}}});
  assert.deepEqual(warned(inherited), ['.t']);
  // A language on the html element or the element: Unknown, no warning.
  for (const doc of [`<html lang="en">${body}</html>`, `<html>${body.replace('class="t"', 'class="t" lang="de"')}</html>`]) {
    const report = run(doc, 'hyphens:auto');
    assert.equal(report.status, 'unknown');
    assert.match(report.diagnostics.map(d => d.message).join(' '), /hyphens: auto/);
    assert.deepEqual(warned(report), []);
  }
  // A fragment (no html element): the document's language is not known, Unknown.
  assert.equal(run('<main class="page"><p class="t">Internationalization</p></main>', 'hyphens:auto').status, 'unknown');
  assert.deepEqual(warned(run(`<html>${body}</html>`, 'hyphens:manual')), []);
});
