import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {analyzeStates} from '../src/index.mjs';
import {loadTextMetrics} from '../../css-verifier/src/text-node.mjs';

// With font files, the component's texts whose computed font is one of them are measured (widths and line breaks)
// instead of assumed: a content-sized column of text can then be checked.
const file = fileURLToPath(new URL('../../css-verifier/text-metrics/fixtures/roboto-variable.ttf', import.meta.url));
const fonts = {Roboto: {file}};
const css = '.row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:8px}.label,.value{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;color:#000}';
const states = [{html: '<div class="row"><span class="label">Account name</span><span class="value">Example</span></div>', choices: {}}];
const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}span{display:block}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};

test('an auto column of text is Unknown with assumed text, checked with the font file', async () => {
  assert.equal(analyzeStates({states, css}, {pageCSS, viewport, assumeText: true}).status, 'unknown');
  const textMetrics = await loadTextMetrics({fonts});
  const result = analyzeStates({states, css}, {pageCSS, viewport, assumeText: true, textMetrics, fonts});
  assert.equal(result.status, 'verified', JSON.stringify(result.states.map(s => s.report.diagnostics.map(d => d.message))));
  assert.ok(result.coverage.assumptions.some(a => /measured with the given font files/.test(a)));
  // A family that was not given stays assumed (and the column Unknown).
  assert.equal(analyzeStates({states, css: css.replace(/Roboto/g, 'Inter')}, {pageCSS, viewport, assumeText: true, textMetrics, fonts}).status, 'unknown');
  // Dynamic text (the adapters' '…' placeholder) is never measured: its real length is not known.
  const dynamic = [{html: '<div class="row"><span class="label">Hello …</span><span class="value">Example</span></div>', choices: {}}];
  assert.equal(analyzeStates({states: dynamic, css}, {pageCSS, viewport, assumeText: true, textMetrics, fonts}).status, 'unknown');
});
