import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from 'svelte/compiler';
import {expandSvelte, analyzeSvelte} from '../src/index.mjs';

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};

test('if/else, class: and each are states; the same condition is one choice', () => {
  const {states, unknowns} = expandSvelte(fixture('Card.svelte'));
  assert.deepEqual(unknowns, []);
  assert.equal(states.length, 2 * 3); // open × {0, 1, 2} items
  for (const s of states) {
    // class:active={open} follows {#if open}: there is never an .empty.active nor a .panel without .active.
    assert.equal(s.html.includes('class="panel active"'), s.choices.open === true);
    assert.equal(s.html.includes('class="empty"'), s.choices.open === false);
    assert.equal((s.html.match(/class="item"/g) ?? []).length, s.choices['#each items']);
  }
});

test('every state is laid out; a violation names the state it is in', () => {
  const card = analyzeSvelte(fixture('Card.svelte'), {pageCSS, viewport});
  assert.equal(card.status, 'verified', JSON.stringify(card.states.map(s => s.report.diagnostics.map(d => d.message))));
  const wide = analyzeSvelte(fixture('Wide.svelte'), {pageCSS, viewport});
  assert.equal(wide.status, 'violated');
  const bad = wide.states.filter(s => s.report.status === 'violated');
  assert.deepEqual(bad.map(s => s.choices), [{compact: false}]);
});

test('unused selectors agree with the Svelte compiler (css_unused_selector)', () => {
  const source = fixture('Card.svelte');
  const ours = analyzeSvelte(source, {pageCSS, viewport, selectors: true}).selectors.warnings.map(w => w.selector).filter(s => !/^(?:html|body|\*)/.test(s)).sort();
  const svelte = compile(source, {}).warnings.filter(w => w.code === 'css_unused_selector').map(w => /"(.*)"/.exec(w.message)[1]).sort();
  assert.deepEqual(ours, svelte);
  assert.deepEqual(ours, ['.empty.active', '.page > .item']);
});

test('what the template does not say statically is Unknown', () => {
  for (const [markup, code] of [
    ['<main class="page"><Child /></main>', 'U_SVELTE_COMPONENT'],
    ['<main class="page">{@html raw}</main>', 'U_SVELTE_HTML'],
    ['<main class={kind}></main>', 'U_SVELTE_DYNAMIC_CLASS'],
    ['<main class="page" style:width={w}></main>', 'U_SVELTE_DYNAMIC_STYLE'],
  ]) {
    const report = analyzeSvelte(`<script>import Child from './Child.svelte'; let { raw, kind, w } = $props();</script>${markup}<style>.page{display:grid;grid-template-columns:minmax(0,1fr)}</style>`, {pageCSS, viewport});
    assert.equal(report.status, 'unknown', markup);
    assert.ok(report.unknowns.some(u => u.code === code), `${markup}: ${JSON.stringify(report.unknowns)}`);
  }
  // A literal conditional class is a choice, not Unknown.
  const {states, unknowns} = expandSvelte(`<script>let { on } = $props();</script><main class={on ? 'a' : 'b'}></main>`);
  assert.deepEqual(unknowns, []);
  assert.deepEqual(states.map(s => s.html).sort(), ['<main class="a"></main>', '<main class="b"></main>']);
});

test('more states than the bound is Unknown, not a silent truncation', () => {
  const many = Array.from({length: 8}, (_, i) => `{#if c${i}}<i></i>{/if}`).join('');
  const report = analyzeSvelte(`<script>let p = $props();</script><main class="page">${many}</main><style>.page{display:grid;grid-template-columns:minmax(0,1fr)}</style>`, {pageCSS, viewport, maxStates: 16});
  assert.equal(report.status, 'unknown');
  assert.ok(report.unknowns.some(u => u.code === 'U_SVELTE_STATES'));
});

test('each expanded state is the markup Svelte server-renders for those props', async () => {
  const {renderSSR, normalize} = await import('./ssr.mjs');
  const source = fixture('Card.svelte');
  for (const state of expandSvelte(source).states) {
    const props = {open: state.choices.open, items: Array.from({length: state.choices['#each items']}, (_, i) => i)};
    const {html} = await renderSSR(source, props);
    assert.equal(normalize(html), normalize(state.html), JSON.stringify(props));
  }
});
