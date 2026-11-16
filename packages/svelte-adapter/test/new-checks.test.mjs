import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from 'svelte/compiler';
import {expandSvelte, analyzeSvelte} from '../src/index.mjs';

// The newer CSS×DOM checks through the Svelte adapter: each finding is listed with the template states it holds in.
const source = readFileSync(new URL('../fixtures/Settings.svelte', import.meta.url), 'utf8');
const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}body{font-size:18px}';
const options = {pageCSS, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, accessibility: true, integrity: true, selectors: true,
  scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], boxes: {'.title': {minInlineSize: 40, intrinsicBlockSize: 24}}, eachCounts: [0, 2]};
const report = analyzeSvelte(source, options);
const finding = (code, box) => report.findings.find(f => f.code === code && f.box === box);
const always = f => f && f.states.length === report.states.length;
const only = (f, key, value) => f && f.states.length > 0 && f.states.every(s => s[key] === value) && report.states.filter(s => s.choices[key] === value).length === f.states.length;

test('a literal conditional attribute (dir={rtl ? "rtl" : "ltr"}) is a choice', () => {
  const {states, unknowns} = expandSvelte(source, {eachCounts: [0, 2]});
  assert.deepEqual(unknowns, []);
  assert.equal(states.length, 2 ** 4 * 2);
  for (const s of states) assert.ok(s.html.includes(`dir="${s.choices.rtl ? 'rtl' : 'ltr'}"`));
});

test('each new check fires in exactly the states the template makes it true', () => {
  assert.notEqual(report.status, 'unknown', JSON.stringify(report.states.find(s => s.report.status === 'unknown')?.report.diagnostics.map(d => d.message)));
  // grid-column on a flex item: only where class:wide={wide} applies .wide.
  assert.ok(only(finding('W_LAYOUT_DECLARATION_INERT', '.save.wide'), 'wide', true), JSON.stringify(report.findings.map(f => f.code + ' ' + f.box)));
  // The real checkbox is display: none (class:hidden={!agree}) while its label shows.
  assert.ok(only(finding('E_A11Y_CONTROL_HIDDEN', '.box.hidden'), 'agree', false));
  // padding-left in rtl content: only in the rtl states.
  assert.ok(only(finding('W_LAYOUT_PHYSICAL_IN_RTL', '.title'), 'rtl', true));
  // Always: the sticky head in an overflow-x: auto wrapper, buttons that keep the UA font size, the see-through bar.
  assert.ok(always(finding('W_LAYOUT_STICKY_SCROLLER', '.thead')));
  assert.ok(always(finding('W_LAYOUT_CONTROL_FONT', '.reset')));
  assert.ok(always(finding('W_A11Y_BAR_TRANSPARENT', '.bar')));
});

test('selector usage over the states agrees with the Svelte compiler', () => {
  const ours = report.selectors.warnings.map(w => w.selector).filter(s => !/^(?:html|body|\*)/.test(s)).sort();
  const svelte = compile(source, {}).warnings.filter(w => w.code === 'css_unused_selector').map(w => /"(.*)"/.exec(w.message)[1]).sort();
  assert.deepEqual(ours, svelte);
  assert.deepEqual(ours, ['.unused > .row']);
});

test('attribute selectors follow attribute states; a dynamic attribute value is Unknown', async () => {
  const {analyzeSvelte} = await import('../src/index.mjs');
  const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
  const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
  const source = `<script>let { open = false } = $props();</script>
<div class="w"><button class="t" type="button" aria-expanded={open ? 'true' : 'false'}>Menu</button><div class="m"></div></div>
<style>.w{display:grid;grid-template-columns:minmax(0,1fr)}.t{appearance:none;display:block;border:0;padding:0;min-width:0;min-height:0;height:24px}.m{height:10px;width:200px}.t[aria-expanded="true"] + .m{width:2000px}</style>`;
  const r = analyzeSvelte(source, {pageCSS, viewport, assumeText: true});
  const bad = r.states.filter(s => s.report.diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE'));
  assert.deepEqual(bad.map(s => s.choices.open), [true]);
  const dynamic = analyzeSvelte(source.replace(`{open ? 'true' : 'false'}`, '{open}'), {pageCSS, viewport, assumeText: true});
  assert.equal(dynamic.status, 'unknown');
});
