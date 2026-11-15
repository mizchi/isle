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
