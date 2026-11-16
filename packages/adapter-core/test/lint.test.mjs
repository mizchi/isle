import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {analyzeVue} from '../../vue-adapter/src/index.mjs';
import {analyzeReact} from '../../react-adapter/src/index.mjs';
import {lint, formatText, recommended} from '../src/index.mjs';

const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
const vue = `<template>
  <main class="page">
    <div v-if="compact" class="bar"></div>
    <div v-else class="bar wide"></div>
    <p class="note">Saved</p>
  </main>
</template>
<style scoped>.page{display:grid;grid-template-columns:minmax(0,1fr)}.bar{height:40px}.wide{width:480px}.note{display:block}.gone{color:red}</style>`;

test('lint: recommended findings carry the element source line and the states they hold in', () => {
  const messages = lint(analyzeVue(vue, {pageCSS, viewport, selectors: true, assumeText: true, sourceLines: true}), {file: 'Wide.vue', source: vue});
  const overflow = messages.find(m => m.code === 'E_LAYOUT_ITEM_SIZE');
  assert.equal(overflow.line, 4);
  assert.equal(overflow.states, 'compact=false');
  assert.equal(overflow.severity, 'error');
  assert.ok(overflow.fix);
  assert.ok(messages.some(m => m.code === 'W_CSS_SELECTOR_UNMATCHED' && m.line === 8));
  // The text assumption is stated, never silent.
  assert.ok(messages.some(m => m.code === 'ASSUMPTION' && /text box/.test(m.message)));
  assert.match(formatText(messages), /Wide\.vue:4\s+error\s+E_LAYOUT_ITEM_SIZE/);
});

test('lint: Unknowns are listed as not checked; profile all keeps the other rules', () => {
  const r = analyzeReact('export default function C({kind}) { return <main className={kind}></main>; }', {pageCSS, viewport});
  assert.ok(lint(r, {file: 'C.jsx'}).some(m => m.severity === 'info' && m.code === 'U_REACT_DYNAMIC_CLASS'));
  assert.ok(Object.keys(recommended).length > 30);
});

test('css-lint CLI: exit status 1 on errors, file:line output', () => {
  const cli = fileURLToPath(new URL('../../../tools/css-lint.mjs', import.meta.url));
  const fixture = fileURLToPath(new URL('../../vue-adapter/fixtures/Wide.vue', import.meta.url));
  let status = 0, out = '';
  try { out = execFileSync('node', [cli, '--viewport', '320-800', '--height', '600-900', fixture], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch (error) { status = error.status; out = error.stdout; }
  assert.equal(status, 1);
  assert.match(out, /Wide\.vue:4\s+error\s+E_LAYOUT_ITEM_SIZE/);
  const json = JSON.parse((() => { try { return execFileSync('node', [cli, '--format', 'json', '--viewport', '320-800', '--height', '600-900', fixture], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch (error) { return error.stdout; } })());
  assert.ok(json.some(m => m.code === 'E_LAYOUT_PAGE_OVERFLOW' && m.line === 4));
});

test('lint on a realistic Svelte component: icon button, grid areas, auto-fill cards, srcset', async () => {
  const {analyzeSvelte} = await import('../../svelte-adapter/src/index.mjs');
  const {readFileSync} = await import('node:fs');
  const file = fileURLToPath(new URL('../../svelte-adapter/fixtures/Catalog.svelte', import.meta.url));
  const source = readFileSync(file, 'utf8');
  const result = analyzeSvelte(source, {pageCSS: `${pageCSS}body{margin:0}`, viewport: {min: 320, max: 1280, height: {min: 480, max: 900}}, assumeText: true, sourceLines: true, accessibility: true, selectors: true, eachCounts: [0, 2], scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  const found = lint(result, {file: 'Catalog.svelte', source}).filter(m => m.severity !== 'info').map(m => [m.code, m.line]);
  for (const expected of [['E_A11Y_NAME', 7], ['E_LAYOUT_TRACKS', 13], ['W_LAYOUT_GRID_AREA_UNKNOWN', 11], ['W_LAYOUT_SIZES_MISSING', 16]])
    assert.ok(found.some(([code, line]) => code === expected[0] && line === expected[1]), `${expected}: ${JSON.stringify(found)}`);
  // The home link is named by its svg's <title>.
  assert.ok(!found.some(([code, line]) => code === 'E_A11Y_NAME' && line === 8));
});

test('lint: a block-flow component is checked; what it cannot model is listed as not checked, never a silent pass', async () => {
  const {analyzeSvelte} = await import('../../svelte-adapter/src/index.mjs');
  const source = '<section class="box"><div class="a"></div><div class="b"></div></section>\n<style>.box{display:block}.a,.b{height:20px}.b{width:2000px}</style>';
  const messages = lint(analyzeSvelte(source, {pageCSS, viewport, accessibility: true, sourceLines: true}), {file: 'Block.svelte', source});
  assert.ok(messages.some(m => m.code === 'E_LAYOUT_ITEM_SIZE' && m.severity === 'error'), JSON.stringify(messages));
  // Page-level rules are not about a component.
  assert.ok(!messages.some(m => m.code === 'W_A11Y_PAGE_H1'));
  // Inline content in a block container: listed as not checked.
  const inline = '<section class="box"><span class="a"></span></section>\n<style>.box{display:block}</style>';
  assert.ok(lint(analyzeSvelte(inline, {pageCSS, viewport, sourceLines: true}), {file: 'Inline.svelte', source: inline}).some(m => m.severity === 'info' && /not checked/.test(m.message)));
  // A refusal code (E_LAYOUT_CONTAINER) outside the rule set is still listed as not checked.
  const refused = lint({states: [{choices: {}, report: {diagnostics: []}}], unknowns: [], coverage: {}, findings: [{code: 'E_LAYOUT_CONTAINER', severity: 'error', box: '.x', message: 'Layout containers must use grid or the flex subset', states: [{}]}]}, {file: 'X.svelte'});
  assert.ok(refused.some(m => m.code === 'E_LAYOUT_CONTAINER' && /not checked/.test(m.message)));
});

test('lint on a block-flow Vue article: centered wrapper, margins, sr-only names, width: 100% + margin', async () => {
  const {readFileSync} = await import('node:fs');
  const file = fileURLToPath(new URL('../../vue-adapter/fixtures/Article.vue', import.meta.url));
  const source = readFileSync(file, 'utf8');
  const result = analyzeVue(source, {pageCSS: '*{box-sizing:border-box;margin:0}', viewport: {min: 320, max: 1280, height: {min: 480, max: 900}}, assumeText: true, sourceLines: true, accessibility: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
  const found = lint(result, {file: 'Article.vue', source}).map(m => [m.severity, m.code, m.line]);
  for (const expected of [['error', 'E_LAYOUT_ITEM_SIZE', 7], ['warning', 'W_LAYOUT_FULL_WIDTH_MARGIN', 7], ['error', 'E_A11Y_NAME', 8]])
    assert.ok(found.some(f => f.join() === expected.join()), `${expected}: ${JSON.stringify(found)}`);
  // The back link is named by its sr-only text; the hidden text is not judged for fit or contrast.
  assert.ok(!found.some(([, code, line]) => line === 4 && ['E_A11Y_NAME', 'E_LAYOUT_CONTENT', 'W_LAYOUT_CLIPPED', 'U_A11Y_CONTRAST'].includes(code)), JSON.stringify(found));
});

test('assumed text follows the box tree: phrasing inside text is that text, not a box of its own (no crash)', async () => {
  const {analyzeSvelte} = await import('../../svelte-adapter/src/index.mjs');
  const source = '<article class="t"><p class="meta">Posted <strong>today</strong> by <a href="/me">me</a></p></article>\n<style>.t{display:block;padding:8px;background:#fff;color:#222}a{color:#246}</style>';
  const result = analyzeSvelte(source, {pageCSS: '*{box-sizing:border-box;margin:0}', viewport, assumeText: true, accessibility: true, sourceLines: true});
  assert.equal(result.coverage.assumptions.some(a => /1 text box/.test(a)), true, JSON.stringify(result.coverage));
  assert.ok(lint(result, {file: 'T.svelte', source}).every(m => m.code !== 'E_LAYOUT_CONTENT'));
});

test('a state whose analysis throws is Unknown, not a crash', async () => {
  const {analyzeStates} = await import('../src/index.mjs');
  const result = analyzeStates({states: [{html: '<div class="a"></div>', choices: {}}], css: ''}, {pageCSS, viewport, boxes: {'.missing': {minInlineSize: 0}}});
  assert.equal(result.status, 'unknown');
  assert.ok(lint(result, {file: 'X.svelte'}).some(m => m.code === 'W_LINT_ANALYSIS_FAILED' && m.severity === 'warning'));
});

test('lint messages: decimal px, no internal markers, and one finding per root cause', () => {
  const f = (code, path, box, message) => ({code, path, box, severity: 'error', message, states: [{}], html: ''});
  const result = {states: [{choices: {}, report: {diagnostics: []}}], unknowns: [], coverage: {assumptions: []}, findings: [
    f('E_LAYOUT_CONTENT', 'C/0/1', '.title.__text0', '.title.__text0 requires 22065/64px but receives 33329/128px on inline axis at viewport 51761/128px × 690px'),
    f('E_LAYOUT_TRACKS', 'C/1', '.grid', '.grid requires 752px but receives 520px on inline axis at viewport 552px × 690px'),
    f('E_LAYOUT_PAGE_OVERFLOW', 'C/1/0', '.plan', '.plan reaches past the viewport, so the page scrolls horizontally'),
    f('E_LAYOUT_PAGE_OVERFLOW', 'C/1/0/0', '.name.__text1', '.name.__text1 reaches past the viewport, so the page scrolls horizontally'),
    f('E_A11Y_FIXED_HIDES_PART', 'C/2', '.lead', '.lead runs under the fixed .side'),
    f('E_A11Y_TEXT_START_OBSCURED', 'C/2', '.lead', 'the start of .lead\'s text is hidden behind .side'),
    f('W_A11Y_PLACEHOLDER_CLIPPED', 'C/3', '.input.__ph0', '.input.__ph0\'s placeholder needs 246.5px'),
  ]};
  result.findings.at(-1).severity = 'warning';
  const messages = lint(result, {file: 'X.svelte'});
  const content = messages.find(m => m.code === 'E_LAYOUT_CONTENT');
  assert.equal(content.message, '.title requires 344.77px but receives 260.38px on inline axis at viewport 404.38px × 690px');
  assert.ok(!messages.some(m => /__ph|__text/.test(m.message)), JSON.stringify(messages));
  // The tracks overflow explains its descendants reaching past the viewport: they are folded into it.
  assert.deepEqual(messages.filter(m => /PAGE_OVERFLOW|TRACKS/.test(m.code)).map(m => m.code), ['E_LAYOUT_TRACKS']);
  assert.match(messages.find(m => m.code === 'E_LAYOUT_TRACKS').message, /\(also: 2 boxes inside it reach past the viewport\)/);
  // The fixed bar hiding part of the text includes its start: one finding.
  assert.deepEqual(messages.filter(m => m.code.startsWith('E_A11Y')).map(m => m.code), ['E_A11Y_FIXED_HIDES_PART']);
});

test('lint fix: a table whose columns overflow is told to wrap its cells or scroll, not to use grid tracks', () => {
  const result = {states: [{choices: {}, report: {diagnostics: []}}], unknowns: [], coverage: {assumptions: []}, findings: [
    {code: 'E_LAYOUT_TRACKS', path: 'Component/0/0', box: '.plans', severity: 'error', message: '.plans requires 400px but receives 360px on inline axis at viewport 360px × 690px', states: [{}], html: '<table class="plans"><tbody><tr><td>a</td></tr></tbody></table>'},
    {code: 'E_LAYOUT_TRACKS', path: 'Component/0/1', box: '.g', severity: 'error', message: '.g requires 400px but receives 360px on inline axis at viewport 360px × 690px', states: [{}], html: '<table class="plans"></table><div class="g"></div>'},
  ]};
  const [table, grid] = lint(result, {file: 'T.svelte'}).filter(m => m.code === 'E_LAYOUT_TRACKS');
  assert.match(table.fix, /overflow-x: auto/);
  assert.match(grid.fix, /minmax\(0, 1fr\)/);
  const flex = lint({...result, findings: [{...result.findings[1], layout: 'flex'}]}, {file: 'T.svelte'}).find(m => m.code === 'E_LAYOUT_TRACKS');
  assert.match(flex.fix, /flex-wrap: wrap/);
});

test('css-lint assumes the UA default colors (stated), and --default-colors none keeps them Unknown', () => {
  const file = fileURLToPath(new URL('../../svelte-adapter/fixtures/Card.svelte', import.meta.url));
  const cli = fileURLToPath(new URL('../../../tools/css-lint.mjs', import.meta.url));
  const out = args => { try { return JSON.parse(execFileSync('node', [cli, '--format', 'json', ...args, file], {encoding: 'utf8'})); } catch (e) { return JSON.parse(e.stdout); } };
  const on = out([]), off = out(['--default-colors', 'none']);
  assert.ok(on.some(m => m.code === 'ASSUMPTION' && /user-agent default colors/.test(m.message)));
  assert.ok(!off.some(m => m.code === 'ASSUMPTION' && /user-agent default colors/.test(m.message)));
});

test('lint: an analysis that failed with an internal error is a warning that names it as the checker\'s failure, not a quiet "not checked"', () => {
  const result = {states: [{choices: {}, report: {status: 'unknown', diagnostics: [{code: 'U_ADAPTER_ANALYSIS', severity: 'unknown', message: 'the analysis of this state failed: Layout numbers require at most twelve integer and six decimal digits'}]}}], unknowns: [], coverage: {assumptions: []}, findings: []};
  const [m] = lint(result, {file: 'X.jsx'}).filter(m => /ANALYSIS/.test(m.code));
  assert.equal(m.severity, 'warning');
  assert.equal(m.code, 'W_LINT_ANALYSIS_FAILED');
  assert.match(m.message, /the checker failed/);
  assert.match(m.fix, /report/);
});

test('lint: WAI-ARIA conformance errors no rendering can confirm are a separate "spec" tier of warnings', () => {
  const f = (code, message) => ({code, path: 'C/0/0', box: '.sw', severity: 'error', message, states: [{}], html: '<div class="sw"></div>'});
  const result = {states: [{choices: {}, report: {diagnostics: []}}], unknowns: [], coverage: {assumptions: []}, findings: [f('E_A11Y_ROLE_ATTR', '.sw has role switch without aria-checked'), f('E_A11Y_ARIA_VALUE', '.sw has aria-checked="yes", not a valid value')]};
  const out = lint(result, {file: 'S.jsx'});
  for (const code of ['E_A11Y_ROLE_ATTR', 'E_A11Y_ARIA_VALUE']) {
    const m = out.find(m => m.code === code);
    assert.equal(m.severity, 'warning', code);
    assert.equal(m.tier, 'spec');
    assert.match(m.message, /^spec:/);
    assert.ok(m.fix);
  }
});

// Component scope: selectors and the parent-child relations they rely on are closed in the component.
import {analyzeSvelte} from '../../svelte-adapter/src/index.mjs';
const scopeOptions = {viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, pageCSS: '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}', assumeText: true};
const scopeCodes = result => result.findings.filter(f => /^E_SCOPE_/.test(f.code)).map(f => [f.code, f.box]).sort();

test('scope (Svelte): :global reaches past the component; an ancestor outside it is scoped too (unused, not a leak)', () => {
  const g = 'display: grid; grid-template-columns: minmax(0, 1fr);';
  const svelte = css => analyzeSvelte(`<script>let { open = false } = $props();</script>\n<div class="card" class:open><ul class="list"><Item /></ul></div>\n<style>.card, .list { ${g} } ${css}</style>`, scopeOptions);
  assert.deepEqual(scopeCodes(svelte('.list :global(li) { padding: 4px; }')), [['E_SCOPE_ESCAPE', '.list :global(li)']]);
  assert.deepEqual(scopeCodes(svelte('.theme-dark .card { padding: 4px; }')), []);
  assert.deepEqual(scopeCodes(svelte(':global(.theme-dark) .card { padding: 4px; }')), [['E_SCOPE_ESCAPE', ':global(.theme-dark) .card']]);
  // A class one state sets on the component's own element closes the relation.
  assert.deepEqual(scopeCodes(svelte('.open .list { padding: 4px; }')), []);
});

test('scope (Vue): :deep/:slotted escape; a plain <style> is global, so a selector can reach a child component', () => {
  const g = 'display: grid; grid-template-columns: minmax(0, 1fr);';
  const vue = (css, attrs = 'scoped') => analyzeVue(`<template><ul class="list"><Item /></ul></template>\n<style ${attrs}>.list { ${g} } ${css}</style>`, scopeOptions);
  assert.deepEqual(scopeCodes(vue(':deep(li) { padding: 4px; }')), [['E_SCOPE_ESCAPE', ':deep(li)']]);
  assert.deepEqual(scopeCodes(vue('.list > li { padding: 4px; }')), []);
  // Vue scopes only the styled element: an ancestor the component does not render comes from the page.
  assert.deepEqual(scopeCodes(vue('.theme-dark .list { padding: 4px; }')), [['E_SCOPE_OUTSIDE', '.theme-dark .list']]);
  assert.deepEqual(scopeCodes(vue('.list > li { padding: 4px; }', '')), [['E_SCOPE_REACHES', '.list > li']]);
});

test('scope (Linaria): a nested selector may not style the li another component renders; its own li is fine', () => {
  const linaria = body => analyzeReact(`import { css } from '@linaria/core';\nconst list = css\`display: grid; grid-template-columns: minmax(0, 1fr); padding: 0; & > li { padding: 4px; }\`;\nexport default function L() { return ${body}; }`, scopeOptions);
  assert.deepEqual(scopeCodes(linaria('<ul className={list}><Item /></ul>')).map(([c]) => c), ['E_SCOPE_REACHES']);
  assert.deepEqual(scopeCodes(linaria('<ul className={list}><li>a</li></ul>')), []);
  assert.deepEqual(scopeCodes(linaria('<ul className={list}>{children}</ul>')).map(([c]) => c), ['E_SCOPE_REACHES']);
  const out = lint(linaria('<ul className={list}><Item /></ul>'), {file: 'L.jsx'});
  assert.equal(out.find(m => m.code === 'E_SCOPE_REACHES')?.severity, 'error');
});
