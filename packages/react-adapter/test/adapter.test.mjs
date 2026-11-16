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
  const {code} = await compileLinaria(source);
  // Attribute order and class order do not change what the CSS matches.
  const canon = html => html.replace(/<(\w+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>/g, (m, tag, attrs) => `<${tag}${[...attrs.matchAll(/\s+([\w-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => k === 'class' ? ` class="${v.split(' ').sort().join(' ')}"` : ` ${k}${v === undefined ? '' : `="${v}"`}`).sort().join('')}>`);
  // Linaria's build hashes class names (ours are lx-name): generated classes compare as '#', literal ones as themselves.
  const generated = html => html.replace(/class="([^"]*)"/g, (m, list) => `class="${list.split(' ').map(c => /^lx-/.test(c) || /^[a-z][a-z0-9]{6,8}$/.test(c) && c !== 'active' ? '#' : c).join(' ')}"`);
  for (const s of states) assert.equal(canon(generated(await render(code, propsOf(s.choices)))), canon(generated(s.html)), JSON.stringify(s.choices));
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

test('SVG props: camelCase presentation props become the attributes react-dom renders', async () => {
  const source = `export default function Icon({open}) {
  return <main className="p"><button className="b" type="button" aria-label="Close"><svg className="i" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{open && <path d="M6 6l12 12" fillRule="evenodd" clipRule="evenodd" />}</svg></button></main>;
}`;
  const {states, unknowns} = expandReact(source);
  assert.deepEqual(unknowns, []);
  const canon = html => html.replace(/<(\w+)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>/g, (m, tag, attrs) => `<${tag}${[...attrs.matchAll(/\s+([\w:-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => ` ${k}${v === undefined ? '' : `="${v}"`}`).sort().join('')}>`).replace(/<\/path>/g, '');
  for (const s of states) assert.equal(canon(await render(source, propsOf(s.choices))), canon(s.html), JSON.stringify(s.choices));
});

test('Linaria interpolations: module constants, object members and class references are evaluated like its build', async () => {
  const source = fixture('LinariaSettings.jsx'), {states, unknowns, css} = expandReact(source);
  assert.deepEqual(unknowns, []);
  assert.match(css, /\.lx-page\{[^}]*row-gap:8px;background:#fff;color:#111\}/);
  assert.match(css, /\.lx-Save\{[^}]*width:96px;height:40px;background:#246\}/);
  assert.match(css, /\.lx-wrap > \.lx-row\{color:#111\}/);
  // The real build gives the same declarations.
  const real = await compileLinaria(source);
  for (const decl of ['row-gap:8px', 'width:96px', 'background:#246', 'color:#111']) assert.ok(real.css.includes(decl), decl);
  // A function of props, or an imported value, is not evaluated: Unknown.
  assert.ok(expandReact("import { css } from '@linaria/core';\nimport { size } from './tokens';\nconst a = css`width: ${size};`;\nexport default function A() { return <div className={a} />; }").unknowns.some(u => u.code === 'U_LINARIA_INTERPOLATION'));
});

test('StyleX: a longhand wins over its shorthand in either order (a second rule of higher specificity), with no write conflict', () => {
  const src = `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ a: { display: 'block', height: 20, paddingBottom: 40, padding: 16 } });
export default function C() { return <main {...stylex.props(s.a)} />; }`;
  const {css} = expandReact(src);
  assert.match(css, /\.(sx-\w+)\{[^}]*padding:16px[^}]*\}\.\1\.\1\{padding-bottom:40px\}/);
  const r = analyzeReact(src, {pageCSS: '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}', viewport: {min: 320, max: 800}});
  assert.ok(!r.states.some(s => s.report.diagnostics.some(d => d.code === 'E_CSS_SHORTHAND_CONFLICT')));
});

test('Linaria: a template literal joining classes with spaces is their class list; a class glued to text stays Unknown', () => {
  const source = `import { css } from '@linaria/core';
const bar = css\`height: 4px;\`;
const on = css\`background: red;\`;
export default function M({active}) { return <div><span className={\`\${bar} \${active ? on : ''} wide\`}></span><span className={\`btn-\${bar}\`}></span></div>; }`;
  const {states, unknowns} = expandReact(source);
  assert.equal(states.length, 2);
  const lists = states.map(s => /<span class="([^"]*)"/.exec(s.html)[1].split(' ').length).sort();
  assert.deepEqual(lists, [2, 3]);
  assert.deepEqual(unknowns.map(u => u.code), ['U_REACT_DYNAMIC_CLASS']);
});

test('props typed as literal unions: their text is each value, and comparisons of them agree with the value', () => {
  const source = `type Props = { status: 'Active' | 'Pending review'; note?: 'x' | 'y' };
export default function Badge({ status, note }: Props) {
  return <div><span className="label">{status}</span>{status === 'Active' && <i className="dot"></i>}<b>{note}</b></div>;
}`;
  const {states, assumptions} = expandReact(source);
  const htmls = states.map(s => s.html).sort();
  assert.equal(states.length, 2);
  assert.ok(htmls.some(h => h.includes('>Pending review<') && !h.includes('dot')), htmls.join('\n'));
  assert.ok(htmls.some(h => h.includes('>Active<') && h.includes('dot')), htmls.join('\n'));
  // An optional prop may be absent: still placeholder text.
  assert.ok(htmls.every(h => h.includes('<b>…</b>')));
  assert.ok(assumptions.some(a => /literal unions \(status\)/.test(a)));
  // props.status reads the same.
  assert.equal(expandReact(`interface P { size: 1 | 2 }\nexport default function C(props: P) { return <p>{props.size}</p>; }`).states.map(s => s.html).sort().join(), '<p>1</p>,<p>2</p>');
});
