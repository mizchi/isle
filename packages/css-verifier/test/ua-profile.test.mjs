import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {resolveUAProfile, suggestReset} from '../src/index.mjs';

const css = '*{margin:0}html,body{margin:0;display:grid;grid-template-columns:minmax(0,1fr)}.g{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start;align-content:start}.f{display:block;box-sizing:content-box;inline-size:120px;block-size:24px}';
const width = ua => { const r = analyzeHTML('<html lang="en"><body><main class="g"><button class="f" type="button" aria-label="Go"></button></main></body></html>', {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ...(ua ? {ua} : {})}); return Number(r.sizes.find(x => x.box === '.f').rect.inlineSize.constant); };

test('ua profiles: the button box follows the browser (Chromium 1px 6px, Firefox 1px 4px), and overrides replace values', () => {
  assert.equal(width(), 136); // the historical Chromium default
  assert.equal(width('chromium'), 136);
  assert.equal(width('firefox'), 132);
  assert.equal(width({base: 'webkit', button: {padding: ['0px', '10px', '0px', '10px']}}), 144);
  assert.deepEqual(resolveUAProfile({base: 'firefox', checkbox: {size: 16}}).checkbox, {margin: ['3px', '3px', '3px', '4px'], size: 16});
  assert.throws(() => resolveUAProfile('ie'), /ua must be one of chromium, firefox, webkit/);
});

test('suggestReset: one rule per value the browsers disagree on, none for the values they share', () => {
  const all = suggestReset();
  assert.match(all.css, /font: inherit/);
  assert.match(all.css, /input\[type="checkbox"\], input\[type="radio"\]\) \{\n  margin: 0;/); // WebKit's margins
  assert.doesNotMatch(all.css, /range/); // the range margin is 2px everywhere
  // Chromium and Firefox share the checkbox margins and the text field padding: no rule for them.
  const two = suggestReset({browsers: ['chromium', 'firefox']}).css;
  assert.doesNotMatch(two, /margin: 0/);
  assert.doesNotMatch(two, /input:not\(\[type\]\)/);
  // One browser: nothing differs, nothing to reset.
  assert.equal(suggestReset({browsers: ['webkit']}).rules.length, 0);
  assert.ok(all.notes.some(n => /button colors differ/.test(n)));
});

// Tables and text layout are modeled as Chromium lays them out (measured); Firefox and WebKit differ there (rowspan
// rows, automatic column widths, line breaking, CJK punctuation trimming, spacing, right-to-left shaping). With
// another browser's profile those analyses are Unknown, not Chromium's verdict.
const tableHTML = '<html lang="en"><body><table class="t"><tbody><tr><td class="c"></td><td class="c"></td></tr></tbody></table></body></html>';
const tableCSS = '*{margin:0;padding:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.t{table-layout:fixed;inline-size:200px;border-spacing:0}.c{inline-size:100px;block-size:20px}';
const tableReport = ua => analyzeHTML(tableHTML, {name: 'P', css: tableCSS, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ...(ua ? {ua} : {})});

test('ua profiles: a table is laid out as Chromium does, so it is Unknown with the Firefox or WebKit profile', () => {
  assert.notEqual(tableReport().status, 'unknown');
  assert.notEqual(tableReport('chromium').status, 'unknown');
  assert.notEqual(tableReport({base: 'chromium', button: {padding: ['0px', '0px', '0px', '0px']}}).status, 'unknown');
  for (const ua of ['firefox', 'webkit', {base: 'webkit'}]) {
    const report = tableReport(ua);
    assert.equal(report.status, 'unknown');
    assert.ok(report.diagnostics.some(d => d.code === 'U_LAYOUT_BROWSER' && /table/.test(d.message)), JSON.stringify(report.diagnostics));
  }
});

test('ua profiles: wrapping lines, CJK punctuation, spacing and right-to-left text are Unknown outside Chromium; plain one-line text is not', async () => {
  const {loadTextMetrics} = await import('../src/text-node.mjs');
  const fixture = name => new URL(`../text-metrics/fixtures/${name}`, import.meta.url).pathname;
  const metrics = await loadTextMetrics({fonts: {Roboto: {file: fixture('roboto-variable.ttf')}, 'Noto Sans JP': {file: fixture('japanese-variable.ttf')}, 'Noto Sans Hebrew': {file: fixture('hebrew-variable.ttf')}}});
  const run = (content, ua, {wrap = 'nowrap', extra = '', lang = 'en', fontExtra = {}, family = 'Roboto'} = {}) => { const font = {family, size: 16, lineHeight: 24, weight: 400}; return analyzeHTML(`<html lang="${lang}"><body><main class="g"><p class="t">${content}</p></main></body></html>`,
    metrics.resolveOptions({name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.g{display:grid;grid-template-columns:300px}.t{font-family:${family};font-size:16px;line-height:24px;${wrap === 'nowrap' ? 'white-space:nowrap;' : ''}${extra}}`,
      viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ...(ua ? {ua} : {}), boxes: {'.t': {text: {font: {...font, ...fontExtra}, content, lang}, wrap}}})); };
  const browserUnknown = (report, pattern) => report.status === 'unknown' && report.diagnostics.some(d => d.code === 'U_LAYOUT_BROWSER' && pattern.test(d.message));
  // Plain one-line Latin text: the shaped advance is the same in every browser.
  for (const ua of [undefined, 'chromium', 'firefox', 'webkit']) assert.notEqual(run('Publish now', ua).status, 'unknown', String(ua));
  // Wrapping text: line breaking.
  const words = 'Static checks lay out this paragraph as Chromium breaks its lines into several rows';
  assert.notEqual(run(words, 'chromium', {wrap: 'normal'}).status, 'unknown');
  assert.ok(browserUnknown(run(words, 'firefox', {wrap: 'normal'}), /line breaking/));
  // A closing CJK punctuation mark: Chromium trims it at a line end (text-spacing-trim), Firefox and WebKit do not.
  assert.ok(browserUnknown(run('検査。', 'webkit', {lang: 'ja', family: 'Noto Sans JP'}), /punctuation/));
  // Spacing.
  assert.notEqual(run('Publish now', 'chromium', {extra: 'letter-spacing:2px', fontExtra: {letterSpacing: 2}}).status, 'unknown');
  assert.ok(browserUnknown(run('Publish now', 'firefox', {extra: 'letter-spacing:2px', fontExtra: {letterSpacing: 2}}), /spacing/));
  assert.notEqual(run('検査。', 'chromium', {lang: 'ja', family: 'Noto Sans JP'}).status, 'unknown');
  // Right-to-left text.
  assert.ok(browserUnknown(run('שלום', 'firefox', {lang: 'he', family: 'Noto Sans Hebrew', extra: 'direction:rtl'}), /right-to-left/));
});
