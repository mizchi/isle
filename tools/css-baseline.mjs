#!/usr/bin/env node
// The CSS baseline the static checks assume, measured in Chromium, Firefox and WebKit: user-agent styles (form
// controls, headings, lists, tables), defaults (font, line-height, scrollbars, canvas colors) and behaviours the engine
// models (automatic minimums, stacking contexts, containing blocks for fixed boxes). Each fact is one measurement on
// one small page; the output lists every fact per browser and marks the ones the browsers disagree on.
//
//   node tools/css-baseline.mjs [--out evals/results/css-baseline] [--browsers chromium,firefox,webkit]
//
// The engine's own value for a fact (what css-verifier assumes today) is given beside it where it has one.
import {chromium, firefox, webkit} from 'playwright';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const out = join(root, opt.out ?? 'evals/results/css-baseline');
const engines = {chromium, firefox, webkit};
const browsers = (opt.browsers ?? 'chromium,firefox,webkit').split(',');
const font = readFileSync(join(root, 'packages/css-verifier/text-metrics/fixtures/roboto-variable.ttf')).toString('base64');
const face = `@font-face{font-family:Roboto;src:url(data:font/ttf;base64,${font})}`;

// [group, fact, page HTML, function in the page returning the value, the engine's assumption]
const style = (sel, props) => `(() => { const c = getComputedStyle(document.querySelector(${JSON.stringify(sel)})); return ${JSON.stringify(props)}.map(p => c.getPropertyValue(p)).join(' | '); })()`;
const width = sel => `Math.round(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().width * 100) / 100`;
const box = sel => `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return Math.round(r.width * 100) / 100 + ' × ' + Math.round(r.height * 100) / 100; })()`;
const hit = (x, y) => `document.elementFromPoint(${x}, ${y})?.className || document.elementFromPoint(${x}, ${y})?.tagName`;
const stack = decl => `<style>*{margin:0}.bar{${decl};height:40px;background:#eee}.menu{position:absolute;top:40px;left:0;width:200px;height:100px;z-index:100;background:#333}.main{position:relative;z-index:1;background:#fff;height:300px}</style><header class="bar"><div class="menu"></div></header><main class="main">x</main>`;
const trap = decl => `<style>*{margin:0}.bar{margin-top:100px;height:48px;${decl}}.toast{position:fixed;bottom:0;left:0;width:200px;height:40px}</style><header class="bar"><div class="toast"></div></header>`;
const facts = [
  // Page defaults
  ['page', 'body margin', '<p>x</p>', style('body', ['margin-top', 'margin-left']), '8px | 8px'],
  ['page', 'default font family and size', '<p>x</p>', style('body', ['font-family', 'font-size']), 'ua-default | 16px'],
  ['page', 'line-height normal of Roboto 16px (px)', `<style>${face}p{font:16px Roboto}</style><p>x</p>`, `document.fonts.ready.then(() => document.querySelector('p').getBoundingClientRect().height)`, '(font metrics)'],
  ['page', 'classic scrollbar width (overflow: scroll)', '<div style="width:100px;height:50px;overflow:scroll"></div>', `(() => { const d = document.querySelector('div'); return d.offsetWidth - d.clientWidth; })()`, '(scrollbar profile)'],
  ['page', 'canvas color (light)', '<p>x</p>', `getComputedStyle(document.documentElement).getPropertyValue('color')`, 'canvastext black'],
  // Headings, text, lists
  ['text', 'h1 size and weight', '<h1>x</h1>', style('h1', ['font-size', 'font-weight', 'margin-top']), '2em | bold | 0.67em'],
  ['text', 'h3 size and weight', '<h3>x</h3>', style('h3', ['font-size', 'font-weight', 'margin-top']), '1.17em | bold | 1em'],
  ['text', 'p margin', '<p>x</p>', style('p', ['margin-top', 'margin-bottom']), '1em | 1em'],
  ['text', 'small and strong', '<p><small>x</small><strong>y</strong></p>', `(() => [getComputedStyle(document.querySelector('small')).fontSize, getComputedStyle(document.querySelector('strong')).fontWeight].join(' | '))()`, 'smaller | bolder'],
  ['text', 'ul padding-left and margin', '<ul><li>x</li></ul>', style('ul', ['padding-left', 'margin-top', 'list-style-type']), '40px | 1em | disc'],
  ['text', 'dd margin-left', '<dl><dt>a</dt><dd>b</dd></dl>', style('dd', ['margin-left']), '40px'],
  ['text', 'th weight and alignment', '<table><tr><th>x</th></tr></table>', style('th', ['font-weight', 'text-align', 'padding-top']), 'bold | center (-internal) | 1px'],
  ['text', 'table border-spacing', '<table><tr><td>x</td></tr></table>', style('table', ['border-spacing', 'border-collapse']), '2px | separate'],
  // Form controls
  ['controls', 'button font', '<button>Go</button>', style('button', ['font-family', 'font-size', 'font-weight', 'line-height']), 'Arial | 13.33px | 400 | normal'],
  ['controls', 'button box', '<button>Go</button>', style('button', ['display', 'box-sizing', 'padding-top', 'padding-left', 'border-top-width']), 'inline-block | border-box | 1px | 6px | 2px'],
  ['controls', 'button min-width as a flex item', '<div style="display:flex"><button>Go</button></div>', style('button', ['min-width']), 'auto'],
  ['controls', 'button as a flex item with a 120px basis and a long label', '<div style="display:flex"><button style="flex:0 0 120px;white-space:nowrap">Delete permanently now please</button></div>', width('button'), 'grows to its min-content'],
  ['controls', 'button inherits the page font-family?', '<style>html{font-family:monospace}</style><button>Go</button>', style('button', ['font-family']), 'no (UA control font)'],
  ['controls', 'text input box', '<input type="text">', style('input', ['display', 'box-sizing', 'padding-top', 'padding-left', 'border-top-width']), 'inline-block | content-box | 1px | 2px | 2px'],
  ['controls', 'text input default size', '<input type="text">', box('input'), '(intrinsic: not modeled)'],
  ['controls', 'text input font', '<input type="text">', style('input', ['font-family', 'font-size']), 'Arial | 13.33px'],
  ['controls', 'search input box-sizing', '<input type="search">', style('input', ['box-sizing']), 'border-box'],
  ['controls', 'checkbox size and margin', '<input type="checkbox">', `(() => { const e = document.querySelector('input'), c = getComputedStyle(e), r = e.getBoundingClientRect(); return [r.width + ' × ' + r.height, c.margin].join(' | '); })()`, '13 × 13 | 3px 3px 3px 4px'],
  ['controls', 'radio margin', '<input type="radio">', style('input', ['margin']), '3px 3px 0px 5px'],
  ['controls', 'range input box', '<input type="range">', `(() => { const e = document.querySelector('input'), c = getComputedStyle(e), r = e.getBoundingClientRect(); return [r.width + ' × ' + r.height, c.margin, c.padding, c.borderTopWidth].join(' | '); })()`, '(size) | 2px | 0 | 0'],
  ['controls', 'select font and box', '<select><option>One</option></select>', style('select', ['font-family', 'font-size', 'padding-left', 'border-top-width']), 'Arial | 13.33px | (ua) | (ua)'],
  ['controls', 'textarea font', '<textarea></textarea>', style('textarea', ['font-family', 'font-size']), 'monospace | 13.33px'],
  ['controls', 'placeholder color', '<input placeholder="x">', `getComputedStyle(document.querySelector('input'), '::placeholder').color`, '(ua: darkgray)'],
  ['controls', 'fieldset padding, border and min-inline-size', '<fieldset><legend>x</legend></fieldset>', style('fieldset', ['padding-top', 'padding-left', 'border-top-width', 'min-inline-size', 'margin-left']), '(ua)'],
  // Elements
  ['elements', 'details and summary display', '<details><summary>x</summary>y</details>', `[getComputedStyle(document.querySelector('details')).display, getComputedStyle(document.querySelector('summary')).display].join(' | ')`, 'block | list-item'],
  ['elements', 'closed dialog display', '<dialog>x</dialog>', style('dialog', ['display']), 'none'],
  ['elements', 'svg without a size', '<svg></svg>', box('svg'), '300 × 150'],
  ['elements', 'img display', '<img alt="">', style('img', ['display']), 'inline'],
  ['elements', 'focus outline of a button (focus-visible)', '<button>Go</button>', `(() => { const b = document.querySelector('button'); b.focus({focusVisible: true}); const c = getComputedStyle(b); return [c.outlineStyle, c.outlineWidth, c.outlineOffset].join(' | '); })()`, '(ua focus ring)'],
  // Layout behaviours the engine models
  ['behaviour', 'minmax(0,1fr) grid as a shrinking 50% flex item (150px content, 254px wide)', '<style>*{box-sizing:border-box;margin:0}.n{display:flex;column-gap:8px;width:254px}.b{flex:1 1 50%;display:grid;grid-template-columns:minmax(0,1fr)}.t{inline-size:150px;block-size:10px}</style><main class="n"><div class="b"><div class="t"></div></div><div class="b"><div class="t"></div></div></main>', width('.b'), '123'],
  ['behaviour', 'sticky (no inset) is a stacking context', stack('position:sticky'), hit(50, 90), 'main'],
  ['behaviour', 'backdrop-filter is a stacking context', stack('backdrop-filter:blur(4px)'), hit(50, 90), 'main'],
  ['behaviour', 'will-change: opacity is a stacking context', stack('will-change:opacity'), hit(50, 90), 'main'],
  ['behaviour', 'will-change: scroll-position is not', stack('will-change:scroll-position'), hit(50, 90), 'menu'],
  ['behaviour', 'backdrop-filter traps a fixed descendant (its top, viewport 600)', trap('backdrop-filter:blur(8px)'), `document.querySelector('.toast').getBoundingClientRect().top`, '108'],
  ['behaviour', 'will-change: transform traps a fixed descendant', trap('will-change:transform'), `document.querySelector('.toast').getBoundingClientRect().top`, '108'],
  ['behaviour', 'will-change: opacity does not', trap('will-change:opacity'), `document.querySelector('.toast').getBoundingClientRect().top`, '560'],
];

mkdirSync(out, {recursive: true});
const results = {};
for (const name of browsers) {
  const browser = await engines[name].launch(name === 'chromium' && process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  const page = await browser.newPage({viewport: {width: 400, height: 600}});
  results[name] = {version: browser.version(), facts: {}};
  for (const [group, fact, html, expr] of facts) {
    await page.setContent(`<!doctype html><html lang="en"><head></head><body>${html}</body></html>`);
    try { results[name].facts[fact] = String(await page.evaluate(expr)); } catch (error) { results[name].facts[fact] = `error: ${error.message.split('\n')[0]}`; }
  }
  await browser.close();
}
const rows = facts.map(([group, fact, , , assumed]) => ({group, fact, assumed, values: Object.fromEntries(browsers.map(b => [b, results[b].facts[fact]])), differs: new Set(browsers.map(b => results[b].facts[fact])).size > 1}));
writeFileSync(join(out, 'baseline.json'), JSON.stringify({browsers: Object.fromEntries(browsers.map(b => [b, results[b].version])), rows}, null, 2) + '\n');
const md = [`# CSS ベースライン(${browsers.map(b => `${b} ${results[b].version}`).join('、')})`, '', `違うものは ${rows.filter(r => r.differs).length} / ${rows.length} 項目。「エンジンの前提」は css-verifier が今置いている値です。`, '',
  `| 分類 | 項目 | エンジンの前提 | ${browsers.join(' | ')} | 違い |`, `|---|---|---|${browsers.map(() => '---').join('|')}|---|`,
  ...rows.map(r => `| ${r.group} | ${r.fact} | ${String(r.assumed).replace(/\|/g, '/')} | ${browsers.map(b => String(r.values[b]).replace(/\|/g, '/')).join(' | ')} | ${r.differs ? '**違う**' : ''} |`)].join('\n');
writeFileSync(join(out, 'baseline.md'), md + '\n');
console.log(`${rows.filter(r => r.differs).length} of ${rows.length} facts differ; written to ${out}`);
