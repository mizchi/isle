import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {analyzeHTML} from '../src/html.mjs';
import {loadTextMetrics} from '../src/text-node.mjs';

// wrap: 'one-line': the text is expected to fit on one line although its white-space lets it wrap. It is measured
// unwrapped; where the box is narrower than that width the text would wrap (E_LAYOUT_CONTENT), and the CSS is not
// required to say nowrap (no E_LAYOUT_WRAP).
const file = fileURLToPath(new URL('../text-metrics/fixtures/roboto-variable.ttf', import.meta.url));
const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = async (width, contract) => {
  const m = await loadTextMetrics({fonts: {Roboto: {file}}});
  return analyzeHTML('<html lang="en"><body><div class="p"><button class="b" type="button">Save all changes</button></div></body></html>', m.resolveOptions({name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{display:grid;grid-template-columns:${width}}.b{appearance:none;display:block;padding:0 8px;border:0;min-width:0;min-height:0;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.b': contract}}));
};
const codes = r => [...new Set(r.diagnostics.map(d => d.code))].sort();

test('one-line: checked against the unwrapped width, with white-space: normal', async () => {
  assert.deepEqual(codes(await run('80px', {text: {font, content: 'Save all changes'}, wrap: 'one-line'})), ['E_LAYOUT_CONTENT']);
  const wide = await run('200px', {text: {font, content: 'Save all changes'}, wrap: 'one-line'});
  assert.equal(wide.status, 'verified', JSON.stringify(wide.diagnostics.map(d => d.message)));
  // nowrap still asks the CSS to say so.
  assert.ok(codes(await run('200px', {text: {font, content: 'Save all changes'}, wrap: 'nowrap'})).includes('E_LAYOUT_WRAP'));
  // A string length: every string of up to 12 of these characters fits on one line in 200px, not in 80px.
  assert.equal((await run('200px', {text: {font, characters: 'abcdefghij ', maxLength: 12}, wrap: 'one-line'})).status, 'verified');
  assert.deepEqual(codes(await run('80px', {text: {font, characters: 'abcdefghij ', maxLength: 12}, wrap: 'one-line'})), ['E_LAYOUT_CONTENT']);
});

test('a control does not inherit the page font (family, weight, line-height, spacing): its text is not measured with the page family', async () => {
  const m = await loadTextMetrics({fonts: {Roboto: {file}}});
  const html = '<html lang="en"><body><div class="p"><button class="b" type="button">Save all changes</button></div></body></html>';
  const report = css => analyzeHTML(html, m.resolveOptions({name: 'P', css: `*{box-sizing:border-box;margin:0}html{font-family:Roboto;font-weight:400;line-height:24px}html,body{${g}}.p{display:grid;grid-template-columns:200px}.b{appearance:none;display:block;padding:0 8px;border:0;min-width:0;min-height:0;font-size:16px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.b': {text: {font, content: 'Save all changes'}, wrap: 'one-line'}}}));
  // Chromium draws the button in its control font (Arial at 13.33px; normal weight and line-height), not Roboto.
  const inherited = report('');
  assert.ok(inherited.diagnostics.some(d => d.severity === 'unknown' && /user-agent control font/.test(d.message)), JSON.stringify(inherited.diagnostics.map(d => d.message)));
  // font: inherit (or each longhand) takes the page font: measured.
  const reset = report('.b{font-family:inherit;line-height:inherit;font-weight:inherit}');
  assert.equal(reset.status, 'verified', JSON.stringify(reset.diagnostics.map(d => d.message)));
});
