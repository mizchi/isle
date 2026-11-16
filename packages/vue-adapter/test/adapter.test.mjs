import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {parse} from 'vue/compiler-sfc';
import {expandVue, analyzeVue} from '../src/index.mjs';

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
// Vue's own server rendering of the template with given data, for fidelity.
const ssr = async (source, data) => renderToString(createSSRApp({template: parse(source).descriptor.template.content, data: () => data}));
// Class order and an empty style attribute (v-show true) do not change what the CSS matches.
const normalize = html => html.replace(/<!--[^]*?-->/g, '').replace(/\s*data-v-[a-z0-9]+(?:="")?/g, '').replace(/ style=""/g, '').replace(/style="display:\s*none;?"/g, 'style="display: none"').replace(/class="([^"]*)"/g, (m, c) => `class="${c.split(/\s+/).filter(Boolean).sort().join(' ')}"`).replace(/>\s+</g, '><').trim();

test('v-if/v-else, :class, v-for and v-show are states; the same condition is one choice', () => {
  const {states, unknowns} = expandVue(fixture('Card.vue'));
  assert.deepEqual(unknowns, []);
  assert.equal(states.length, 2 * 3 * 2);
  for (const s of states) {
    assert.equal(s.html.includes('class="panel active"'), s.choices.open === true);
    assert.equal((s.html.match(/class="item"/g) ?? []).length, s.choices['#for item in items']);
    assert.equal(s.html.includes('style="display: none"'), s.choices.hidden === true);
  }
});

test('each expanded state is the markup Vue server-renders for that data', async () => {
  const source = fixture('Card.vue');
  for (const s of expandVue(source).states) {
    const data = {open: s.choices.open, hidden: s.choices.hidden, items: Array.from({length: s.choices['#for item in items']}, (_, i) => i)};
    assert.equal(normalize(await ssr(source, data)), normalize(s.html), JSON.stringify(data));
  }
});

test('every state is laid out; the violation names its state; unused scoped selectors', () => {
  assert.equal(analyzeVue(fixture('Card.vue'), {pageCSS, viewport}).status, 'verified');
  const wide = analyzeVue(fixture('Wide.vue'), {pageCSS, viewport});
  assert.equal(wide.status, 'violated');
  assert.deepEqual(wide.states.filter(s => s.report.status === 'violated').map(s => s.choices), [{compact: false}]);
  const unused = analyzeVue(fixture('Card.vue'), {pageCSS, viewport, selectors: true}).selectors.warnings.map(w => w.selector).filter(s => !/^(?:html|body|\*)/.test(s)).sort();
  assert.deepEqual(unused, ['.empty.active', '.page > .item']);
});

test('what the template does not say statically is Unknown', () => {
  for (const [template, code] of [
    ['<main class="page"><Child /></main>', 'U_VUE_COMPONENT'],
    ['<main class="page"><div v-html="raw"></div></main>', 'U_VUE_HTML'],
    ['<main :class="kind"></main>', 'U_VUE_DYNAMIC_CLASS'],
    ['<main class="page" :style="{width: w}"></main>', 'U_VUE_DYNAMIC_STYLE'],
    ['<main class="page"><slot /></main>', 'U_VUE_SLOT'],
  ]) {
    const report = analyzeVue(`<template>${template}</template><style>.page{display:grid;grid-template-columns:minmax(0,1fr)}</style>`, {pageCSS, viewport});
    assert.equal(report.status, 'unknown', template);
    assert.ok(report.unknowns.some(u => u.code === code), `${template}: ${JSON.stringify(report.unknowns)}`);
  }
  // A ternary of literals and an array of them are choices.
  const {states, unknowns} = expandVue(`<template><main :class="[on ? 'a' : 'b', 'c']" :dir="rtl ? 'rtl' : 'ltr'"></main></template>`);
  assert.deepEqual(unknowns, []);
  assert.deepEqual(states.map(s => s.html).sort(), ['<main class="a c" dir="ltr"></main>', '<main class="a c" dir="rtl"></main>', '<main class="b c" dir="ltr"></main>', '<main class="b c" dir="rtl"></main>']);
});

test('props typed as literal unions (defineProps<…>()): each value is a state, and the markup equals Vue SSR for it', async () => {
  const source = `<template><div class="badge"><span class="label">{{ status }}</span><i v-if="status === 'Active'" class="dot"></i></div></template>
<script setup lang="ts">
type Props = { status: 'Active' | 'Pending review' };
defineProps<Props>();
</script>
<style scoped>.badge { display: block; }</style>`;
  const {states, assumptions} = expandVue(source);
  assert.equal(states.length, 2, JSON.stringify(states));
  for (const state of states) assert.equal(normalize(state.html), normalize(await ssr(source, state.choices)), JSON.stringify(state.choices));
  assert.ok(assumptions.some(a => /literal unions \(status\)/.test(a)));
});

test('props with a literal default (withDefaults, or a runtime default): the default is a state, equal to Vue SSR without the prop', async () => {
  for (const script of [`<script setup lang="ts">\nwithDefaults(defineProps<{ label?: string }>(), { label: 'Save changes' });\n</script>`, `<script setup>\ndefineProps({ label: { type: String, default: 'Save changes' } });\n</script>`]) {
    const source = `<template><button class="b" type="button">{{ label }}</button></template>\n${script}\n<style scoped>.b { display: block; }</style>`;
    const {states} = expandVue(source);
    assert.deepEqual(states.map(s => s.html).sort(), ['<button class="b" type="button">Save changes</button>', '<button class="b" type="button">…</button>']);
    assert.equal(normalize(states.find(s => s.choices['label given'] === false).html), normalize(await ssr(source, {label: 'Save changes'})));
  }
});
