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

test('textResize: what breaks only at 200% text size is E_A11Y_TEXT_RESIZE', async () => {
  const textMetrics = await loadTextMetrics({fonts});
  const button = (label, css) => analyzeStates({states: [{html: `<div class="w"><button class="b" type="button">${label}</button></div>`, choices: {}}], css: `.w{display:grid;grid-template-columns:200px}.b{display:block;width:100%;padding:0 8px;border:0;font-family:Roboto;font-size:1rem;line-height:1.5;font-weight:400;color:#000;background:#eee;white-space:nowrap;${css}}`}, {pageCSS, viewport, assumeText: true, textMetrics, fonts, defaultFontSize: 16, textResize: true});
  const codes = r => r.findings.map(f => f.code);
  // "Save changes" fits 200px at 16px, not at 32px.
  assert.ok(codes(button('Save changes', '')).includes('E_A11Y_TEXT_RESIZE'));
  assert.ok(!codes(button('Save changes', '')).includes('E_LAYOUT_CONTENT'));
  // A short label fits at both sizes; a px font size does not resize.
  assert.ok(!codes(button('OK', '')).includes('E_A11Y_TEXT_RESIZE'));
  assert.ok(!codes(button('Save changes', 'font-size:16px;line-height:24px')).includes('E_A11Y_TEXT_RESIZE'));
});

test('the assumed-text count counts only text boxes: a marked inline run laid out as a grid (spans as items) is not one', async () => {
  const textMetrics = await loadTextMetrics({fonts});
  const states = [{html: '<ul class="f"><li class="r"><span class="a">quarterly.pdf</span><span class="b">2 MB</span></li></ul>', choices: {}}];
  const css = '.f{display:grid;grid-template-columns:minmax(0,1fr);padding:0;margin:0;list-style:none}.r{display:grid;grid-template-columns:minmax(0,1fr) 80px}.a,.b{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;color:#000;white-space:nowrap}';
  const result = analyzeStates({states, css}, {pageCSS, viewport, assumeText: true, textMetrics, fonts});
  assert.ok(result.coverage.assumptions.some(a => /2 text box\(es\) measured/.test(a)), JSON.stringify(result.coverage.assumptions));
  assert.ok(!result.coverage.assumptions.some(a => /sized by assumption/.test(a)), JSON.stringify(result.coverage.assumptions));
});

test('dynamic text with no length bound in a nowrap box is a warning (a long value overflows); a length, an ellipsis or wrapping clears it', async () => {
  const textMetrics = await loadTextMetrics({fonts});
  const run = (attrs, extra = '') => analyzeStates({states: [{html: `<div class="c"><span class="name" ${attrs}>…</span></div>`, choices: {}}], css: `.c{display:grid;grid-template-columns:minmax(0,1fr)}.name{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;color:#000;white-space:nowrap}${extra}`}, {pageCSS, viewport, assumeText: true, textMetrics, fonts});
  const has = r => r.findings.some(f => f.code === 'W_TEXT_DYNAMIC_UNBOUNDED');
  assert.ok(has(run('')));
  assert.ok(!has(run('data-text-max-length="20"')));
  assert.ok(!has(run('', '.name{overflow:hidden;text-overflow:ellipsis}')));
  assert.ok(!has(run('', '.name{white-space:normal}')));
});
