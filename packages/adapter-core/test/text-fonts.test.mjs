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

test('data-text-max-length measures dynamic text by its longest string; data-text-one-line expects one line', async () => {
  const textMetrics = await loadTextMetrics({fonts});
  const card = (attrs, label = 'Hello …', width = '120px') => analyzeStates({states: [{html: `<div class="c"><span class="name" ${attrs}>${label}</span></div>`, choices: {}}], css: `.c{display:grid;grid-template-columns:${width}}.name{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;color:#000}`}, {pageCSS, viewport, assumeText: true, textMetrics, fonts});
  const codes = r => [...new Set(r.findings.map(f => f.code))];
  // Up to 8 characters of a-z fit in 120px on one line; up to 30 do not.
  assert.equal(card('data-text-max-length="8" data-text-chars="abcdefghijklmnopqrstuvwxyz" data-text-one-line').status, 'verified');
  assert.ok(codes(card('data-text-max-length="30" data-text-chars="abcdefghijklmnopqrstuvwxyz" data-text-one-line')).includes('E_LAYOUT_CONTENT'));
  // A length without one-line (the CSS lets it wrap) has no known line breaks: left to the assumption.
  const wrapping = card('data-text-max-length="8"');
  assert.ok(!wrapping.coverage.assumptions.some(a => /measured with the given font files/.test(a)) && wrapping.coverage.assumptions.some(a => /sized by assumption/.test(a)));
  // A fixed label expected on one line.
  assert.ok(codes(card('data-text-one-line', 'Notification preferences')).includes('E_LAYOUT_CONTENT'));
  assert.equal(card('data-text-one-line', 'Notify', '120px').status, 'verified');
});

test('a placeholder wider than its field is cut off (measured with the field font)', async () => {
  const textMetrics = await loadTextMetrics({fonts});
  const field = (placeholder, width) => analyzeStates({states: [{html: `<div class="f"><label class="l" for="e">Email</label><input class="i" id="e" type="email" placeholder="${placeholder}"></div>`, choices: {}}], css: `.f{display:grid;grid-template-columns:${width}}.i{display:block;width:100%;height:34px;padding:4px 8px;border:1px solid #666;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;color:#000;background:#fff}`}, {pageCSS: pageCSS + 'label{display:block;color:#000;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400}', viewport, assumeText: true, textMetrics, fonts});
  const clipped = r => r.findings.some(f => f.code === 'W_A11Y_PLACEHOLDER_CLIPPED');
  assert.ok(clipped(field('Enter the email address you use at work', '200px')));
  assert.ok(!clipped(field('you@example.com', '200px')));
});
