// Checklist F: CSS that the browser accepts but that does nothing — mistakes a static check can point at.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const run = (css, html = '<div class="a"></div>') => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
const codes = (r, code) => (r.layoutWarnings ?? []).filter(w => w.code === code);

test('F1: an animation whose name has no @keyframes does nothing', () => {
  const [w] = codes(run('.a{animation:spin 1s infinite}'), 'W_CSS_KEYFRAMES_MISSING');
  assert.ok(w); assert.equal(w.keyframes, 'spin'); assert.match(w.message, /@keyframes spin/);
  assert.equal(codes(run('.a{animation:spin 1s infinite}@keyframes spin{to{opacity:.5}}'), 'W_CSS_KEYFRAMES_MISSING').length, 0);
  // A typo in a list: only the missing one.
  assert.deepEqual(codes(run('.a{animation:fade 1s,spn 2s}@keyframes fade{to{opacity:.5}}'), 'W_CSS_KEYFRAMES_MISSING').map(w => w.keyframes), ['spn']);
  assert.equal(codes(run('.a{animation:none}'), 'W_CSS_KEYFRAMES_MISSING').length, 0);
});

test('F2: an animation with no duration runs for 0s', () => {
  assert.equal(codes(run('.a{animation:spin infinite}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 1);
  assert.equal(codes(run('.a{animation:spin 1s infinite}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 0);
  // 0s with fill-mode forwards or both applies the end state on purpose.
  assert.equal(codes(run('.a{animation:spin 0s forwards}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 0);
  // A scroll-driven animation has no time duration.
  assert.equal(codes(run('.a{animation:spin linear;animation-timeline:scroll()}@keyframes spin{to{opacity:.5}}'), 'W_CSS_ANIMATION_NO_DURATION').length, 0);
});

test('F3: a var() with no value and no fallback makes the declaration unset', () => {
  const [w] = codes(run('.a{color:var(--brand)}'), 'W_CSS_VAR_INVALID');
  assert.ok(w); assert.equal(w.property, 'color'); assert.match(w.message, /--brand/);
  assert.equal(codes(run('.a{color:var(--brand, red)}'), 'W_CSS_VAR_INVALID').length, 0);
  assert.equal(codes(run(':root{--brand:red}.a{color:var(--brand)}'), 'W_CSS_VAR_INVALID').length, 0);
});

test('F4: a max size below the min size fixes the box at the min', () => {
  const [w] = codes(run('.a{min-width:50px;max-width:10px}'), 'W_LAYOUT_MIN_ABOVE_MAX');
  assert.ok(w); assert.match(w.message, /always 50px wide/);
  assert.equal(codes(run('.a{min-width:10px;max-width:50px}'), 'W_LAYOUT_MIN_ABOVE_MAX').length, 0);
  assert.equal(codes(run('.a{min-height:50px;max-height:30px;height:auto}'), 'W_LAYOUT_MIN_ABOVE_MAX').length, 1);
});

test('F5: a media query that no viewport matches', () => {
  const [w] = codes(run('@media (min-width:900px) and (max-width:600px){.a{color:red}}'), 'W_CSS_MEDIA_NEVER');
  assert.ok(w); assert.match(w.message, /900/);
  assert.equal(codes(run('@media (min-width:600px) and (max-width:900px){.a{color:red}}'), 'W_CSS_MEDIA_NEVER').length, 0);
  assert.equal(codes(run('@media (width > 600px) and (width < 600px){.a{color:red}}'), 'W_CSS_MEDIA_NEVER').length, 1);
  // A list matches when any query does.
  assert.equal(codes(run('@media (min-width:900px) and (max-width:600px), print{.a{color:red}}'), 'W_CSS_MEDIA_NEVER').length, 0);
});

test('F6: a property declared twice in one rule: the earlier one never applies', () => {
  const [w] = codes(run('.a{color:red;color:blue}'), 'W_CSS_DUPLICATE_DECLARATION');
  assert.ok(w); assert.equal(w.property, 'color'); assert.match(w.message, /color: red never applies/);
  // !important keeps the earlier: the later never applies.
  assert.match(codes(run('.a{color:red !important;color:blue}'), 'W_CSS_DUPLICATE_DECLARATION')[0].message, /color: blue never applies/);
  // The fallback pattern: a later value in a newer function or unit is left alone.
  for (const css of ['.a{height:100vh;height:100dvh}', '.a{width:100%;width:calc(100% - 10px)}', '.a{display:block;display:-webkit-box}', '.a{color:red}.a{color:blue}']) assert.equal(codes(run(css), 'W_CSS_DUPLICATE_DECLARATION').length, 0, css);
});

test('F7: z-index on a box that is neither positioned nor a flex or grid item', () => {
  const html = '<div class="p"><div class="a"></div></div>';
  const inert = css => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('z-index'));
  assert.equal(inert('.p{display:block}.a{z-index:5}'), true);
  assert.equal(inert('.p{display:block}.a{z-index:5;position:relative}'), false);
  assert.equal(inert('.p{display:flex}.a{z-index:5;flex:none;width:10px}'), false);
  assert.equal(inert('.p{display:grid;grid-template-columns:minmax(0,1fr)}.a{z-index:5}'), false);
});

test('F8: a transition between auto (or none) and a length jumps', () => {
  const jump = css => codes(run(`.a{width:100px}${css}`), 'W_CSS_TRANSITION_AUTO');
  const [w] = jump('.a{height:auto;transition:height .3s}.a:hover{height:100px}');
  assert.ok(w); assert.equal(w.property, 'block-size'); assert.match(w.message, /auto/);
  assert.equal(jump('.a{max-height:none;transition:max-height .3s}.a:hover{max-height:10px}').length, 1);
  assert.equal(jump('.a{height:20px;transition:height .3s}.a:hover{height:100px}').length, 0);
  // all covers it; no transition, no warning.
  assert.equal(jump('.a{height:auto;transition:all .3s}.a:hover{height:100px}').length, 1);
  assert.equal(jump('.a{height:auto}.a:hover{height:100px}').length, 0);
});

test('F9: a ::before or ::after with no content is never generated', () => {
  const [w] = codes(run('.a::before{display:block;width:10px;height:10px;background:red}'), 'W_CSS_PSEUDO_NO_CONTENT');
  assert.ok(w); assert.match(w.message, /content/);
  assert.equal(codes(run('.a::before{content:"";display:block;height:10px}'), 'W_CSS_PSEUDO_NO_CONTENT').length, 0);
  // Content from another rule counts.
  assert.equal(codes(run('.a::after{content:""}.a::after{display:block;height:4px}'), 'W_CSS_PSEUDO_NO_CONTENT').length, 0);
});

test('F10: content on an element (not a pseudo-element) does nothing, unless it is an image', () => {
  assert.ok(codes(run('.a{content:"hi"}'), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('content')));
  assert.equal(codes(run('.a{content:normal}'), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('content')).length, 0);
});

test('the mistakes are reported where the layout is Unknown too', () => {
  // A :focus rule that changes the layout keeps the layout Unknown before it runs; a style walk still reports them.
  const r = run('.a{color:var(--x);min-width:50px;max-width:10px;z-index:2}.a:focus{height:30px}', '<div class="p"><div class="a"></div></div>');
  assert.equal(r.status, 'unknown');
  assert.deepEqual(['W_CSS_VAR_INVALID', 'W_LAYOUT_MIN_ABOVE_MAX'].map(code => codes(r, code).length), [1, 1]);
  assert.equal(codes(run('.a::after{display:block;height:4px}.a:focus{height:30px}'), 'W_CSS_PSEUDO_NO_CONTENT').length, 1);
});

test('F12: a transition with no duration is instant', () => {
  assert.equal(codes(run('.a{transition:opacity}'), 'W_CSS_TRANSITION_NO_DURATION').length, 1);
  assert.equal(codes(run('.a{transition-property:opacity}'), 'W_CSS_TRANSITION_NO_DURATION').length, 1);
  assert.deepEqual(codes(run('.a{transition:opacity .2s, transform}'), 'W_CSS_TRANSITION_NO_DURATION').map(w => w.property), ['transform']);
  for (const css of ['.a{transition:opacity .2s}', '.a{transition:none}', '.a{transition-property:opacity;transition-duration:.3s}', '.a{transition:opacity 0s}']) assert.equal(codes(run(css), 'W_CSS_TRANSITION_NO_DURATION').length, 0, css);
});

test('F13: an over-constrained absolutely positioned box ignores its end inset', () => {
  const html = '<div class="p"><div class="a"></div></div>';
  const inert = (css, side) => codes(run(`.p{position:relative;height:100px}${css}`, html), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes(side));
  assert.equal(inert('.a{position:absolute;top:0;left:10px;right:10px;width:50px;height:10px}', 'right'), true);
  assert.equal(inert('.a{position:absolute;top:0;bottom:0;left:0;width:10px;height:30px}', 'bottom'), true);
  assert.equal(inert('.a{position:absolute;top:0;left:10px;right:10px;height:10px}', 'right'), false);
  // Auto margins take up the slack instead (centring).
  assert.equal(inert('.a{position:absolute;top:0;left:0;right:0;width:50px;margin:0 auto;height:10px}', 'right'), false);
});

test('F14: a border width with no border style draws no border', () => {
  const [w] = codes(run('.a{border-width:2px}'), 'W_CSS_BORDER_NO_STYLE');
  assert.ok(w); assert.deepEqual(w.sides, ['top', 'right', 'bottom', 'left']);
  assert.deepEqual(codes(run('.a{border-left-width:4px}'), 'W_CSS_BORDER_NO_STYLE')[0]?.sides, ['left']);
  assert.deepEqual(codes(run('.a{border-width:0 2px}'), 'W_CSS_BORDER_NO_STYLE')[0]?.sides, ['right', 'left']);
  assert.equal(codes(run('.a{border-width:0 2px;border-style:solid}'), 'W_CSS_BORDER_NO_STYLE').length, 0);
  for (const css of ['.a{border-width:2px;border-style:solid}', '.a{border:2px solid red}', '.a{border-width:0}', '.a{border-style:solid;border-width:2px}']) assert.equal(codes(run(css), 'W_CSS_BORDER_NO_STYLE').length, 0, css);
});

test('F15, F16: background-size with no image, text-decoration-color with no line', () => {
  const inert = (css, prop) => codes(run(css), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes(prop));
  assert.equal(inert('.a{background-size:cover}', 'background-size'), true);
  assert.equal(inert('.a{background:url(a.png);background-size:cover}', 'background-size'), false);
  assert.equal(inert('.a{background-position:center;background-color:red}', 'background-position'), true);
  assert.equal(inert('.a{text-decoration-color:red}', 'text-decoration-color'), true);
  assert.equal(inert('.a{text-decoration:underline;text-decoration-color:red}', 'text-decoration-color'), false);
  // An image only on :hover (or in a media condition): the size acts there.
  assert.equal(inert('.a{background-size:cover}.a:hover{background-image:url(a.png)}', 'background-size'), false);
  assert.equal(inert('.a{background-size:cover}@media (min-width:800px){.a{background-image:url(a.png)}}', 'background-size'), false);
  // Another rule for another element is not this one's.
  assert.equal(inert('.b{background-size:cover}', 'background-size'), false);
});

test('F17, F18: a :focus rule on an element that cannot take focus, a :hover on one the pointer never hits', () => {
  const st = (html, css) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE');
  assert.equal(st('<div class="a"></div>', '.a:focus{color:red}').length, 1);
  assert.equal(st('<div class="a" tabindex="0"></div>', '.a:focus{color:red}').length, 0);
  assert.equal(st('<button class="a" type="button">Go</button>', '.a:focus-visible{color:red}').length, 0);
  assert.equal(st('<a class="a" href="#x">Go</a>', '.a:focus{color:red}').length, 0);
  assert.equal(st('<details><summary class="a">More</summary></details>', '.a:focus{color:red}').length, 0);
  assert.equal(st('<a class="a">No href</a>', '.a:focus{color:red}').length, 1);
  assert.equal(st('<div class="a"></div>', '.a{pointer-events:none}.a:hover{color:red}').length, 1);
  assert.equal(st('<div class="a"></div>', '.a:hover{color:red}').length, 0);
});

test('F19: :checked on an element that is never checked, ::placeholder on one that shows none', () => {
  const st = (html, css) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE');
  assert.equal(st('<div class="a"></div>', '.a:checked{color:red}').length, 1);
  assert.equal(st('<input class="a" type="checkbox" aria-label="x">', '.a:checked{color:red}').length, 0);
  assert.equal(st('<input class="a" type="text" aria-label="x">', '.a::placeholder{color:red}').length, 1);
  assert.equal(st('<input class="a" type="text" placeholder="Name" aria-label="x">', '.a::placeholder{color:red}').length, 0);
  assert.equal(st('<div class="a"></div>', '.a::placeholder{color:red}').length, 1);
});

test('F20: :visited applies only colors', () => {
  const html = '<a class="a" href="#x">Docs</a>';
  const run2 = (css, h) => analyzeHTML(`<html lang="en"><body>${h}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}, boxes: {'.a': {minInlineSize: 0, intrinsicBlockSize: 20}}});
  const r = run2('.a{display:block;height:20px}.a:visited{color:purple;font-weight:bold;background-image:url(v.png)}', html);
  assert.deepEqual(codes(r, 'W_CSS_VISITED_IGNORED').map(w => w.property).sort(), ['background-image', 'font-weight']);
  // Dropped as the browser does: not a layout change in a state rule (no Unknown).
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.equal(codes(run('.a{display:block;height:20px}.a:visited{color:purple;border-color:red}', html), 'W_CSS_VISITED_IGNORED').length, 0);
});

test(':disabled and :enabled match form controls by their disabled attribute and a disabled fieldset', () => {
  const color = (html, css) => { const r = analyzeHTML(`<html lang="en"><body><main class="m">${html}</main></body></html>`, {name: 'P', css: `*{margin:0}html,body,.m{display:grid;grid-template-columns:minmax(0,1fr)}.m{background:#fff;color:#000}button{height:20px;font:16px/20px sans-serif;padding:0;border:0}${css}`, viewport: {min: 320, max: 800, height: {min: 300, max: 900}}, boxes: {'button': {minInlineSize: 0, intrinsicBlockSize: 20}}}); return r.status === 'unknown' ? 'unknown:' + r.diagnostics.map(d => d.message).join('|').slice(0, 120) : 'ok'; };
  assert.equal(color('<button type="button" disabled>A</button>', 'button:disabled{display:none}'), 'ok');
  // Parsed (not Unknown any more).
  assert.equal(color('<button type="button">A</button>', 'button:enabled{height:20px}'), 'ok');
});

test(':disabled matching: own attribute, a disabled fieldset, and its first legend excepted', async () => {
  const {htmlBoxTree} = await import('../src/html.mjs');
  const {compileSelector, matches} = await import('../src/layout/selectors.mjs');
  const {normalizeTree} = await import('../src/tree.mjs');
  const {root: tree} = normalizeTree(htmlBoxTree('<html lang="en"><body><form><input class="own" disabled aria-label="a"><fieldset disabled><legend><input class="legend" aria-label="b"></legend><input class="inside" aria-label="c"></fieldset><input class="free" aria-label="d"></form></body></html>').tree, 'P');
  const all = []; (function walk(b) { all.push(b); for (const c of [...(b.children ?? []), ...(b.inline ?? [])]) walk(c); })(tree);
  const by = cls => all.find(b => b.classes?.includes(cls));
  const dis = compileSelector('input:disabled'), en = compileSelector('input:enabled');
  assert.deepEqual(['own', 'legend', 'inside', 'free'].map(c => [matches(dis, by(c)), matches(en, by(c))]), [[true, false], [false, true], [true, false], [false, true]]);
});

test('a :disabled rule on an option in a disabled select (browsers differ) keeps the analysis Unknown', () => {
  const r = analyzeHTML('<html lang="en"><body><fieldset disabled><select aria-label="s"><option>a</option></select></fieldset></body></html>', {name: 'P', css: 'option:disabled{color:gray}', viewport: {min: 320, max: 800, height: {min: 300, max: 900}}});
  assert.ok(r.diagnostics.some(d => d.code === 'U_LAYOUT_ATTRIBUTE' && /browsers decide differently/.test(d.message)), JSON.stringify(r.diagnostics.map(d => d.message)));
});

test('F22: ::marker takes only some properties; on a non-list-item it never applies', () => {
  const html = '<ul class="l"><li class="i"></li></ul><div class="d"></div>';
  const css = '.l{display:block;padding-left:40px}.i{height:20px}.d{height:20px}';
  const r = run(css + '.i::marker{color:red;margin-left:40px;background:blue}', html);
  assert.deepEqual(codes(r, 'W_CSS_MARKER_IGNORED').map(w => w.property).sort(), ['background', 'margin-left']);
  assert.notEqual(r.status, 'unknown', JSON.stringify(r.diagnostics.map(d => d.message)));
  // Sizing the marker: Unknown (the marker box is not modeled).
  assert.equal(run(css + '.i::marker{font-size:40px}', html).status, 'unknown');
  // On an element that is not a list item.
  assert.equal(codes(run(css + '.d::marker{color:red}', html), 'W_CSS_STATE_UNREACHABLE').length, 1);
  assert.equal(codes(run(css + '.i::marker{color:red}', html), 'W_CSS_STATE_UNREACHABLE').length, 0);
});

test('F8 in plain HTML: the class toggle the stylesheet names (.panel.open)', () => {
  const html = '<div class="panel"></div>';
  const jump = css => codes(run(`.panel{width:100px}${css}`, html), 'W_CSS_TRANSITION_AUTO');
  const [w] = jump('.panel{transition:height .3s}.panel.open{height:120px}');
  assert.ok(w); assert.match(w.message, /\.open/);
  assert.equal(jump('.panel{height:0;transition:height .3s}.panel.open{height:120px}').length, 0);
  // A rule for another element (another class it lacks on the subject's ancestor chain) is not a toggle of this one.
  assert.equal(jump('.panel{transition:height .3s}.card .panel{height:120px}').length, 0);
});

test('F23, G1: user-select: none on a text field; a summary that lost its disclosure triangle', () => {
  assert.ok(codes(run('.i{user-select:none}', '<input class="i" aria-label="x">'), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes('user-select')));
  assert.equal(codes(run('.a{user-select:none}'), 'W_LAYOUT_DECLARATION_INERT').filter(w => w.properties.includes('user-select')).length, 0);
  const sum = css => codes(run(css, '<details><summary class="s">More</summary><p>x</p></details>'), 'W_A11Y_SUMMARY_INDICATOR');
  assert.equal(sum('.s{display:block}').length, 1);
  assert.equal(sum('.s{list-style:none}').length, 1);
  assert.equal(sum('.s{display:block}.s::before{content:"+"}').length, 0);
  assert.equal(sum('').length, 0);
});

test('F24, F25: table-layout: fixed with no width, border-spacing with collapsed borders', () => {
  const html = '<table class="t"><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
  const inert = (css, prop) => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').some(w => w.properties.includes(prop));
  assert.equal(inert('.t{table-layout:fixed}', 'table-layout'), true);
  assert.equal(inert('.t{table-layout:fixed;width:300px}', 'table-layout'), false);
  assert.equal(inert('.t{border-collapse:collapse;border-spacing:8px}', 'border-spacing'), true);
  assert.equal(inert('.t{border-spacing:8px}', 'border-spacing'), false);
});

test('F26: table > tr never matches: the parser inserts a tbody', () => {
  const html = '<table class="t"><tr class="r"><td>x</td></tr></table>';
  const w = css => codes(run(css, html), 'W_CSS_SELECTOR_IMPLIED_PARENT');
  assert.equal(w('.t > .r{color:red}').length, 1);
  assert.equal(w('table > tr{color:red}').length, 1);
  assert.equal(w('.t .r{color:red}').length, 0);
  assert.equal(w('.t > tbody > .r{color:red}').length, 0);
  // A tbody written in the source is not implied.
  assert.equal(codes(run('.t > .r{color:red}', '<table class="t"><tbody><tr class="r"><td>x</td></tr></tbody></table>'), 'W_CSS_SELECTOR_IMPLIED_PARENT').length, 0);
});

test('F27: the HTML parser changed the structure written in the source', () => {
  const re = html => codes(run('', html), 'W_HTML_RESTRUCTURED').map(w => w.tag);
  assert.deepEqual(re('<p class="p">text<div class="d">x</div></p>'), ['p']);
  assert.deepEqual(re('<a href="#x">a<a href="#y">b</a></a>'), ['a']);
  assert.deepEqual(re('<table><div class="f">x</div><tr><td>a</td></tr></table>'), ['div']);
  assert.deepEqual(re('<form action="/a"><form action="/b"><input aria-label="x"></form></form>'), ['form']);
  for (const html of ['<table><tr><td><div>ok</div></td></tr></table>', '<form action="/a"></form><form action="/b"></form>', '<p>a</p><p>b</p>', '<ul><li>a<li>b</ul>', '<svg width="10" height="10"><path d="M0 0"/></svg>', '<table><tr><td>x</td></tr></table>', '<img src="a.png" alt="">']) assert.deepEqual(re(html), [], html);
});

test('F28: presentational attributes on elements they do not map to', () => {
  const r = run('.a{height:20px}', '<div class="a" width="100" height="50" bgcolor="red" border="2"></div>');
  assert.deepEqual(codes(r, 'W_HTML_ATTRIBUTE_INERT')[0]?.attributes, ['width', 'height', 'bgcolor', 'border']);
  assert.notEqual(r.status, 'unknown');
  // Where they map (a table's width, a div's align) they still need an adapter: Unknown, no warning.
  assert.equal(codes(run('', '<div class="a" align="center"></div>'), 'W_HTML_ATTRIBUTE_INERT').length, 0);
  assert.equal(codes(run('', '<table width="300"><tr><td>x</td></tr></table>'), 'W_HTML_ATTRIBUTE_INERT').length, 0);
});

test('F29: :empty does not match an element holding whitespace', () => {
  const w = html => codes(run('.x:empty{display:none}', html), 'W_CSS_EMPTY_WHITESPACE');
  assert.equal(w('<div class="x"> </div>').length, 1);
  assert.equal(w('<div class="x">\n  </div>').length, 1);
  assert.equal(w('<div class="x"></div>').length, 0);
  assert.equal(w('<div class="x"><!-- c --></div>').length, 0);
});

test('F30: display: contents on a replaced element or form control removes it', () => {
  const w = (html, css = '.x{display:contents}') => codes(run(css, html), 'W_LAYOUT_CONTENTS_REMOVED');
  const [hit] = w('<input class="x" aria-label="q">');
  assert.ok(hit && /display: none/.test(hit.message));
  assert.equal(w('<img class="x" alt="" src="a.png" width="20" height="20">').length, 1);
  assert.equal(w('<textarea class="x" aria-label="q"></textarea>').length, 1);
  assert.equal(w('<button class="x" type="button"><span class="a"></span></button>').length, 0);
  assert.equal(w('<ul class="x"><li class="a"></li></ul>').length, 0);
  assert.equal(w('<input class="x" aria-label="q">', '.x{display:block;inline-size:100px;block-size:20px}').length, 0);
});

test('F31: overflow: auto or scroll on a table does nothing (the table grows; wrap it to scroll)', () => {
  const table = '<table class="t"><tbody><tr><td class="a"></td></tr></tbody></table>';
  const w = css => codes(run(css, table), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => p.startsWith('overflow')));
  const [hit] = w('.t{overflow-x:auto}');
  assert.ok(hit && /wrap/i.test(hit.message));
  assert.equal(w('.t{overflow:scroll}').length, 1);
  assert.equal(w('.t{overflow:hidden}').length, 0);
  assert.equal(w('.t{display:block;overflow-x:auto}').length, 0);
  assert.equal(codes(run('.w{overflow-x:auto}', `<div class="w">${table}</div>`), 'W_LAYOUT_DECLARATION_INERT').length, 0);
});

test('F32: ::before / ::after on an element that does not render them (img, text input, select, textarea, iframe, video, br, canvas)', () => {
  const pc = '::before{content:"";display:block;height:30px}';
  const field = 'style="display:block;inline-size:100px;block-size:20px"';
  const w = (html, css) => codes(run(css, html), 'W_CSS_PSEUDO_NOT_RENDERED');
  const r = run(`.x${pc}`, `<input class="x" aria-label="q" ${field}>`);
  const [hit] = codes(r, 'W_CSS_PSEUDO_NOT_RENDERED');
  assert.ok(hit && /::before/.test(hit.message));
  assert.equal(codes(r, 'W_CSS_PSEUDO_NO_CONTENT').length, 0);
  assert.equal(w(`<img class="x" alt="" src="a.png" ${field}>`, `.x${pc}`).length, 1);
  assert.equal(w(`<textarea class="x" aria-label="q" ${field}></textarea>`, '.x::after{content:"*"}').length, 1);
  assert.equal(w('<div class="x"></div>', `.x${pc}`).length, 0);
  assert.equal(w('<input class="x" type="checkbox" aria-label="q">', `.x${pc}`).length, 0);
  assert.equal(w(`<button class="x" type="button" ${field}>b</button>`, `.x${pc}`).length, 0);
});

test('F33: :last-child / :first-child / :nth-child miss because of a sibling that never renders (template, script)', () => {
  const list = tail => `<div class="w"><div class="a"></div><div class="a"></div>${tail}</div>`;
  const w = (css, html) => codes(run(css, html), 'W_CSS_CHILD_INDEX_HIDDEN_SIBLING');
  const r = run('.a:last-child{height:50px}', list('<template><b></b></template>'));
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_CSS_CHILD_INDEX_HIDDEN_SIBLING');
  assert.ok(hit && /<template>/.test(hit.message) && hit.selector === '.a:last-child');
  assert.equal(w('.a:last-child{height:50px}', list('<script>1</script>')).length, 1);
  assert.equal(w('.a:first-child{height:50px}', '<div class="w"><template></template><div class="a"></div></div>').length, 1);
  assert.equal(w('.a:nth-child(2){height:50px}', '<div class="w"><template></template><div class="a"></div><div class="a"></div></div>').length, 1);
  assert.equal(w('.a:last-of-type{height:50px}', list('<template></template>')).length, 0);
  assert.equal(w('.a:last-child{height:50px}', list('')).length, 0);
  assert.equal(run('', list('<template></template>')).status, 'verified');
  assert.equal(run('', list('<template shadowrootmode="open"><b></b></template>')).status, 'unknown');
  assert.equal(run('template{display:block}', list('<template></template>')).status, 'unknown');
});

test('F34: columns on a flex or grid container do nothing', () => {
  const items = '<div class="x"><div class="a"></div><div class="a"></div></div>';
  const w = css => codes(run(css, items), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => p.startsWith('column-')));
  const r = run('.x{display:flex;columns:2}', items);
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_LAYOUT_DECLARATION_INERT');
  assert.ok(hit && /multi-column/.test(hit.message) && hit.properties.includes('column-count'));
  assert.equal(w('.x{display:grid;column-count:3}').length, 1);
  assert.equal(w('.x{display:flex;column-width:100px}').length, 1);
  assert.equal(w('.x{display:flex}').length, 0);
  assert.equal(run('.x{columns:2}', items).status, 'unknown');
});

test('F35: :focus-within on an element with nothing focusable inside', () => {
  const w = (css, html) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => x.state === 'focus-within');
  const [hit] = w('.x:focus-within{outline:2px solid}', '<div class="x"><p class="a">t</p></div>');
  assert.ok(hit && /focusable/.test(hit.message));
  assert.equal(w('.x:focus-within{outline:2px solid}', '<div class="x"><button class="a" type="button">b</button></div>').length, 0);
  assert.equal(w('.x:focus-within{outline:2px solid}', '<div class="x"><p class="a">t <a href="/y">y</a></p></div>').length, 0);
  assert.equal(w('.x:focus-within{outline:2px solid}', '<div class="x" tabindex="-1"><p class="a">t</p></div>').length, 0);
  assert.equal(w('.x:focus-within{outline:2px solid}', '<div class="x"><div class="a" tabindex="0"></div></div>').length, 0);
});

test('F17: :focus on a tabindex="-1" element is reachable (a click or focus() focuses it)', () => {
  const w = html => codes(run('.x:focus{outline:2px solid}', html), 'W_CSS_STATE_UNREACHABLE');
  assert.equal(w('<div class="x a" tabindex="-1"></div>').length, 0);
  assert.equal(w('<div class="x a"></div>').length, 1);
});

test('F36: a :hover / :focus transform on an inline box does nothing', () => {
  const w = (css, html) => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.state);
  const [hit] = w('.x:hover{transform:translateY(-2px)}', '<p class="a">t <a class="x" href="/y">y</a></p>');
  assert.ok(hit && hit.state === 'hover' && /inline/.test(hit.message));
  assert.equal(w('.x:focus-visible{scale:1.1}', '<p class="a">t <a class="x" href="/y">y</a></p>').length, 1);
  assert.equal(w('.x:hover{transform:translateY(-2px)}', '<div class="x a"></div>').length, 0);
  assert.equal(w('.x{display:inline-block}.x:hover{transform:translateY(-2px)}', '<p class="a">t <a class="x" href="/y">y</a></p>').length, 0);
  assert.equal(w('.x:hover{transform:translateY(-2px)}', '<p class="a">t <img class="x" alt="" src="a.png" width="10" height="10"></p>').length, 0);
});

test('F37: ::first-letter / ::first-line on a box that is not a block container (inline, flex, grid) never applies', () => {
  const w = (css, html) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => /^::first-/.test(x.state));
  const r = run('.x{display:flex}.x::first-letter{font-size:2em}', '<div class="x"><div class="a"></div></div>');
  assert.equal(r.status, 'verified');
  const [hit] = codes(r, 'W_CSS_STATE_UNREACHABLE');
  assert.ok(hit && hit.state === '::first-letter' && /block container/.test(hit.message));
  assert.equal(w('.x{display:grid}.x::first-line{color:red}', '<div class="x"><div class="a"></div></div>').length, 1);
  assert.equal(w('.x::first-letter{color:red}', '<p class="a">t <span class="x">s</span></p>').length, 1);
  assert.equal(run('.x::first-letter{font-size:2em}', '<p class="x a">text</p>').status, 'unknown');
  assert.equal(w('.x::first-letter{font-size:2em}', '<p class="x a">text</p>').length, 0);
  assert.equal(run('.y::first-letter{font-size:2em}', '<div class="x a"></div>').status, 'verified');
});

test('F38: margin: auto does not centre an absolutely positioned box with an auto inset or size', () => {
  const w = c => codes(run(`.w{position:relative;height:300px}.m{position:absolute;width:200px;height:50px;${c}}`, '<div class="w"><div class="m"></div></div>'), 'W_LAYOUT_AUTO_MARGIN_ABSOLUTE');
  const [hit] = w('margin:auto');
  assert.ok(hit && /inset: 0/.test(hit.message));
  assert.deepEqual(hit.axes, ['horizontal', 'vertical']);
  assert.deepEqual(w('left:0;margin:0 auto')[0]?.axes, ['horizontal']);
  assert.deepEqual(w('inset:0 auto 0 0;margin:auto')[0]?.axes, ['horizontal']);
  assert.equal(w('inset:0;margin:auto').length, 0);
  assert.equal(w('left:0;right:0;margin:0 auto').length, 0);
  assert.equal(w('left:0;top:0').length, 0);
});

test('F39: object-position does nothing under object-fit: fill', () => {
  const img = '<img class="x" alt="" src="a.png" width="40" height="40">';
  const w = css => codes(run(`.x{display:block;width:100px;height:50px;${css}}`, img), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.includes('object-position'));
  const [hit] = w('object-position:left top');
  assert.ok(hit && /object-fit/.test(hit.message));
  assert.equal(w('object-fit:fill;object-position:0 0').length, 1);
  assert.equal(w('object-fit:cover;object-position:left top').length, 0);
  assert.equal(w('object-fit:contain;object-position:right').length, 0);
  assert.equal(w('object-fit:none;object-position:right').length, 0);
});

test('F40: place-items / place-content / place-self read as their align and justify longhands', () => {
  const items = '<div class="x"><div class="a"></div><div class="a"></div></div>';
  const same = (short, long) => {
    const a = run(`.x{display:grid;grid-template-columns:100px 100px;height:100px;${short}}`, items), b = run(`.x{display:grid;grid-template-columns:100px 100px;height:100px;${long}}`, items);
    assert.equal(a.status, b.status, short);
    assert.deepEqual((a.layoutWarnings ?? []).map(w => w.code), (b.layoutWarnings ?? []).map(w => w.code), short);
  };
  same('place-items:center', 'align-items:center;justify-items:center');
  same('place-items:start stretch', 'align-items:start;justify-items:stretch');
  same('place-content:center', 'align-content:center;justify-content:center');
  same('place-content:start space-between', 'align-content:start;justify-content:space-between');
  assert.notEqual(run('.x{display:grid;place-items:center}', items).layoutWarnings?.[0]?.message?.includes('Unsupported'), true);
  const block = codes(run('.x{place-items:center}', '<div class="x a"></div>'), 'W_LAYOUT_DECLARATION_INERT');
  assert.ok(block.some(w => w.properties.includes('align-items')));
});

test('F41: fill / stroke on an svg whose shapes all set their own fill / stroke attribute does nothing', () => {
  const svg = inner => `<svg class="i" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">${inner}</svg>`;
  const w = (css, inner) => codes(run(`.i{display:block}${css}`, svg(inner)), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => p === 'fill' || p === 'stroke'));
  const [hit] = w('.i{fill:red}', '<path fill="#000" d="M0 0h20v20H0z"/>');
  assert.ok(hit && /attribute/.test(hit.message) && hit.properties.includes('fill'));
  assert.equal(w('.i{fill:red}', '<g fill="#000"><path d="M0 0h20v20H0z"/><path d="M0 0h2v2H0z"/></g>').length, 1);
  assert.equal(w('.i{stroke:red}', '<path fill="none" stroke="#000" d="M2 2h16v16H2z"/>').length, 1);
  assert.equal(w('.i{fill:red}', '<path d="M0 0h20v20H0z"/>').length, 0);
  assert.equal(w('.i{fill:red}', '<path fill="#000" d="M0 0h20v20H0z"/><path d="M0 0h2v2H0z"/>').length, 0);
  assert.equal(w('.i{fill:red}', '<path fill="inherit" d="M0 0h20v20H0z"/>').length, 0);
  assert.equal(w('.i{fill:red}.i path{fill:blue}', '<path fill="#000" d="M0 0h20v20H0z"/>').length, 0);
});

test('F42: background, color, border and padding on a checkbox or radio of appearance auto do nothing', () => {
  const html = '<label class="a"><input class="x" type="checkbox"> Accept</label>';
  const w = css => codes(run(css, '<input class="x" type="checkbox" aria-label="q">'), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => /^(?:background-color|color|border|padding|border-.*-radius)/.test(p)));
  const [hit] = w('.x{background-color:red;border:2px solid red}');
  assert.ok(hit && /appearance: none/.test(hit.message) && /accent-color/.test(hit.message));
  assert.ok(hit.properties.includes('background-color'));
  assert.equal(w('.x{color:red}').length, 1);
  assert.equal(w('.x{padding:4px}').length, 1);
  assert.equal(w('.x{appearance:none;background-color:red;width:20px;height:20px}').length, 0);
  assert.equal(w('.x{accent-color:red}').length, 0);
  assert.equal(codes(run('.x{background-color:red}', '<input class="x" type="text" aria-label="q">'), 'W_LAYOUT_DECLARATION_INERT').length, 0);
});

test('F43: min-height / max-height on a table cell do nothing; min-width / max-width neither in a fixed table', () => {
  const t = '<table class="t"><tbody><tr><td class="c"></td><td class="d"></td></tr></tbody></table>';
  const base = '.t{border-spacing:0}td{padding:0;height:20px}';
  const w = css => codes(run(base + css, t), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => /^(?:min|max)-(?:block|inline)-size$/.test(p)));
  const r = run(base + '.c{min-height:80px}', t);
  const [hit] = w('.c{min-height:80px}');
  assert.ok(hit && /table cell/.test(hit.message) && hit.properties.includes('min-block-size'));
  assert.ok(!JSON.stringify(r).includes('min-block-size on a table cell has no defined effect'));
  assert.equal(w('.c{max-height:10px}').length, 1);
  assert.equal(w('.t{table-layout:fixed;width:300px}.c{max-width:60px}').length, 1);
  assert.equal(w('.c{max-width:60px}').length, 0);
});

test('F44: cursor on an element with pointer-events: none never shows', () => {
  const w = (css, html = '<div class="x a"></div>') => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.includes('cursor'));
  const [hit] = w('.x{pointer-events:none;cursor:pointer}');
  assert.ok(hit && /pointer-events: none/.test(hit.message));
  assert.equal(w('.p{pointer-events:none}.x{cursor:not-allowed}', '<div class="p"><div class="x a"></div></div>').length, 1);
  assert.equal(w('.x{cursor:pointer}').length, 0);
  assert.equal(w('.x{pointer-events:none;cursor:pointer}', '<div class="x"><div class="a"></div></div>').length, 0);
  assert.equal(w('.x{pointer-events:none;cursor:auto}').length, 0);
});

test('F45: text-align / text-indent / text-align-last on an inline element do nothing', () => {
  const w = (css, html = '<p class="a">before <span class="x">s</span> after</p>') => codes(run(css, html), 'W_LAYOUT_DECLARATION_INERT').filter(x => x.properties.some(p => /^text-(?:align|indent|align-last)$/.test(p)));
  const [hit] = w('.x{text-align:center}');
  assert.ok(hit && /display: inline/.test(hit.message) && hit.properties.includes('text-align'));
  assert.equal(w('.x{text-indent:2em}', '<p class="a">t <a class="x" href="/y">y</a></p>').length, 1);
  assert.equal(w('.x{display:block;text-align:center}').length, 0);
  assert.equal(w('.x{text-align:center}', '<p class="x a">t</p>').length, 0);
  assert.equal(w('.x{text-align:center}', '<p class="a">t <span class="x">a <b>b</b></span></p>').length, 0);
});

test('F46: ::selection is read (it styles only the selected text, not the layout); its box properties are ignored', () => {
  const r = run('::selection{background:#ff0;color:#000}', '<div class="a"></div>');
  assert.equal(r.status, 'verified');
  const w = css => codes(run(css), 'W_CSS_SELECTION_IGNORED');
  const [hit] = w('.a::selection{padding:4px;font-size:20px;color:red}');
  assert.ok(hit && /::selection/.test(hit.message));
  assert.deepEqual(w('.a::selection{padding:4px;font-size:20px;color:red}').map(x => x.property).sort(), ['font-size', 'padding']);
  assert.equal(w('.a::selection{color:red;background-color:#ff0}').length, 0);
  assert.equal(run('.a::selection{margin:10px}').status, 'verified');
});

test('F47: margin, height, display and position in ::placeholder are ignored', () => {
  const field = '<input class="x" placeholder="Search" aria-label="q">';
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  const w = css => codes(run(base + css, field), 'W_CSS_PLACEHOLDER_IGNORED');
  assert.deepEqual(w('.x::placeholder{margin:10px;height:40px;color:#555}').map(x => x.property).sort(), ['height', 'margin']);
  assert.ok(/::placeholder/.test(w('.x::placeholder{display:block}')[0]?.message));
  assert.equal(w('.x::placeholder{position:absolute}').length, 1);
  assert.equal(w('.x::placeholder{color:#555;font-size:14px}').length, 0);
});

test('F48: :link / :any-link match a link with href; on anything else they never apply', () => {
  const link = '<a class="x a" href="/y" style="display:block"></a>';
  assert.equal(run('.x:any-link{color:red}', link).status, 'verified');
  assert.equal(run('a:link{color:red}', link).status, 'verified');
  const w = (css, html) => codes(run(css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => /link/.test(x.state ?? ''));
  const [hit] = w('.x:any-link{color:red}', '<a class="x a" style="display:block"></a>');
  assert.ok(hit && /href/.test(hit.message));
  assert.equal(w('.x:link{color:red}', '<button class="x a" type="button"></button>').length, 1);
  assert.equal(w('.x:link{color:red}', link).length, 0);
  // :link stops matching once the link is visited: a layout change there depends on the history.
  assert.equal(run('.x:link{padding:4px}', link).status, 'unknown');
});

test('F49: :placeholder-shown needs a placeholder attribute (and an empty value); without one it never applies', () => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  const field = attrs => `<input class="x" aria-label="q" ${attrs}>`;
  assert.equal(run(base + '.x:placeholder-shown{border-color:red}', field('placeholder="Search"')).status, 'verified');
  const w = (css, html) => codes(run(base + css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => x.state === ':placeholder-shown');
  const [hit] = w('.x:placeholder-shown{color:red}', field(''));
  assert.ok(hit && /placeholder attribute/.test(hit.message));
  assert.equal(w('.x:placeholder-shown{color:red}', field('placeholder=""')).length, 0);
  assert.equal(w('.x:placeholder-shown{color:red}', field('placeholder="x" value="v"')).length, 0);
  assert.equal(w('.x:placeholder-shown{color:red}', '<textarea class="x" aria-label="q"></textarea>').length, 1);
  // Typing hides the placeholder: a layout change in :placeholder-shown depends on what the user types.
  assert.equal(run(base + '.x:placeholder-shown{padding:4px}', field('placeholder="Search"')).status, 'unknown');
});

test('F50: :required / :optional match form fields; on anything else they never apply', () => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  assert.equal(run(base + '.x:required{border-color:red}', '<input class="x" aria-label="q" required>').status, 'verified');
  assert.equal(run(base + '.x:optional{border-color:red}', '<input class="x" aria-label="q">').status, 'verified');
  const w = (css, html) => codes(run(base + css, html), 'W_CSS_STATE_UNREACHABLE').filter(x => /^:(?:required|optional)$/.test(x.state ?? ''));
  const [hit] = w('.x:required::after{content:"*"}', '<label class="x">Name</label>');
  assert.ok(hit && /form field/.test(hit.message));
  assert.equal(w('.x:required{color:red}', '<input class="x" type="range" aria-label="q" required>').length, 1);
  assert.equal(w('.x:required{color:red}', '<input class="x" aria-label="q" required>').length, 0);
  assert.equal(w('.x:required{color:red}', '<input class="x" aria-label="q">').length, 0);
  // Firefox does not match :optional on a range input or a button (Chromium and WebKit do): Unknown there.
  assert.equal(run(base + '.x:optional{border-color:red}', '<input class="x" type="range" aria-label="q">').status, 'unknown');
});

test('F50: label:required (a tag selector) is reported too', () => {
  const r = run('label:required::after{content:"*"}', '<label class="a">Name</label>');
  assert.equal(codes(r, 'W_CSS_STATE_UNREACHABLE').filter(x => x.state === ':required').length, 1);
});
