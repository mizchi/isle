import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expandReact, analyzeReact} from '../src/index.mjs';
import {compileStylex, compileLinaria, render} from './ssr.mjs';

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
// Structure without class values (StyleX's atomic names differ from the adapter's merged classes).
const shape = html => html.replace(/ class="[^"]*"/g, '').replace(/>\s+</g, '><').trim();
const propsOf = c => Object.fromEntries(Object.entries(c).map(([k, v]) => k.startsWith('#map ') ? [k.slice(5), Array.from({length: v}, (_, i) => i)] : [k, v]));

test('StyleX: conditional props, ternaries and .map are states; merged classes follow the last argument', () => {
  const {states, unknowns, css} = expandReact(fixture('StylexCard.jsx'));
  assert.deepEqual(unknowns, []);
  assert.equal(states.length, 3 * 3); // open×wide (wide only matters when open: 3 combos) × {0,1,2} items
  // panel then compact: compact's height 60 wins over panel's 120.
  assert.match(css, /height:60px/);
  const closed = states.find(s => s.choices.open === false);
  const cls = /<div class="([^"]+)"/.exec(closed.html)[1];
  assert.match(css, new RegExp(`\\.${cls}\\{[^}]*height:60px`));
  assert.doesNotMatch(css, new RegExp(`\\.${cls}\\{[^}]*height:120px`));
});

test('StyleX: every state has the structure react-dom/server renders from StyleX\'s own compiled output', async () => {
  const source = fixture('StylexCard.jsx'), {code} = compileStylex(source);
  for (const s of expandReact(source).states) assert.equal(shape(await render(code, propsOf(s.choices))), shape(s.html), JSON.stringify(s.choices));
});

test('StyleX: the wide open panel is the violated state', () => {
  const report = analyzeReact(fixture('StylexCard.jsx'), {pageCSS, viewport});
  assert.equal(report.status, 'violated');
  assert.ok(report.states.filter(s => s.report.status === 'violated').every(s => s.choices.open === true && s.choices.wide === true));
});

test('Linaria: css`` and styled classes, cx() conditions and nesting; markup equals the rendered component', async () => {
  const source = fixture('LinariaCard.jsx'), {states, unknowns, css} = expandReact(source);
  assert.deepEqual(unknowns, []);
  assert.match(css, /\.lx-panel\.active\{background:#eef\}/);
  assert.match(css, /@media \(min-width: 600px\)\{\.lx-panel\{height:80px\}\}/);
  const {code} = compileLinaria(source);
  // Attribute order and class order do not change what the CSS matches.
  const canon = html => html.replace(/<(\w+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>/g, (m, tag, attrs) => `<${tag}${[...attrs.matchAll(/\s+([\w-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => k === 'class' ? ` class="${v.split(' ').sort().join(' ')}"` : ` ${k}${v === undefined ? '' : `="${v}"`}`).sort().join('')}>`);
  for (const s of states) assert.equal(canon(await render(code, propsOf(s.choices))), canon(s.html), JSON.stringify(s.choices));
  const report = analyzeReact(source, {pageCSS, viewport, selectors: true});
  assert.deepEqual(report.states.filter(s => s.report.status === 'violated').map(s => s.choices.big), report.states.filter(s => s.report.status === 'violated').map(() => true));
});

test('what the component does not say statically is Unknown', () => {
  for (const [jsx, code] of [
    ['<main><Child /></main>', 'U_REACT_COMPONENT'],
    ['<main className={kind}></main>', 'U_REACT_DYNAMIC_CLASS'],
    ['<main style={s}></main>', 'U_REACT_DYNAMIC_STYLE'],
    ['<main {...rest}></main>', 'U_REACT_SPREAD'],
    ['<main dangerouslySetInnerHTML={{__html: raw}}></main>', 'U_REACT_HTML'],
  ]) assert.ok(expandReact(`export default function C({kind, s, rest, raw}) { return ${jsx}; }`).unknowns.some(u => u.code === code), jsx);
  // Plain classNames with an external stylesheet.
  const report = analyzeReact('export default function C({on}) { return <main className="page"><div className={on ? "a" : "b"} /></main>; }', {pageCSS, viewport, css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.b{height:20px;width:900px}'});
  assert.deepEqual(report.states.filter(s => s.report.status === 'violated').map(s => s.choices), [{on: false}]);
});
