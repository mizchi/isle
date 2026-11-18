// Checklist F: CSS the browser accepts but that does nothing. Each warning holds exactly where the browser shows no
// effect of the declaration.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
import {analyzeStates} from '../packages/adapter-core/src/index.mjs';

const base = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;color:rgb(0, 0, 0)}';
const warns = (css, code) => (analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === code);
const load = async (page, css) => page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body><div class="a"></div></body></html>`);

test('F1, F2: an animation that never runs', async ({page}) => {
  for (const [css, code] of [['.a{animation:spin 1s infinite}', 'W_CSS_KEYFRAMES_MISSING'], ['.a{animation:spn 1s infinite}@keyframes spin{to{opacity:.5}}', 'W_CSS_KEYFRAMES_MISSING'], ['.a{animation:spin 1s infinite}@keyframes spin{to{opacity:.5}}', null],
    ['.a{animation:spin infinite}@keyframes spin{to{opacity:.5}}', 'W_CSS_ANIMATION_NO_DURATION'], ['.a{animation:spin 0s forwards}@keyframes spin{to{opacity:.5}}', null]]) {
    await load(page, css);
    // Running for some time: a missing @keyframes gives no animation; a 0s one never shows a frame between its ends.
    const running = await page.evaluate(() => document.getAnimations().some(a => a.effect.getComputedTiming().duration > 0));
    for (const c of ['W_CSS_KEYFRAMES_MISSING', 'W_CSS_ANIMATION_NO_DURATION']) expect(warns(css, c), `${css} ${c}`).toBe(c === code);
    if (code) expect(running, css).toBe(false);
    else if (!css.includes('0s')) expect(running, css).toBe(true);
  }
});

test('F3: a var() with no value and no fallback leaves the property unset', async ({page}) => {
  for (const [css, invalid] of [['.a{color:var(--brand)}', true], ['.a{color:var(--brand, rgb(255, 0, 0))}', false], [':root{--brand:rgb(255, 0, 0)}.a{color:var(--brand)}', false]]) {
    await load(page, `body{color:rgb(0, 0, 255)}${css}`);
    const color = await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color);
    expect(warns(`body{color:rgb(0, 0, 255)}${css}`, 'W_CSS_VAR_INVALID'), css).toBe(invalid);
    // Unset: color inherits from body.
    expect(color === 'rgb(0, 0, 255)', `${css}: ${color}`).toBe(invalid);
  }
});

test('F4: a max size below the min size fixes the box at the min', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const [css, fixed] of [['.a{min-width:50px;max-width:10px;justify-self:start}', true], ['.a{min-width:10px;max-width:50px;justify-self:start}', false]]) {
    expect(warns(css + '.a{width:30px}', 'W_LAYOUT_MIN_ABOVE_MAX'), css).toBe(fixed);
    // Whatever the width, the box is the min wide where min is above max.
    const widths = [];
    for (const width of [5, 30, 80]) { await load(page, `${css}.a{width:${width}px}`); widths.push(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().width)); }
    expect(widths.every(w => w === 50), `${css}: ${widths}`).toBe(fixed);
  }
});

test('F5: a media query that no viewport matches', async ({page}) => {
  for (const [query, never] of [['(min-width:900px) and (max-width:600px)', true], ['(width > 600px) and (width < 600px)', true], ['(min-width:600px) and (max-width:900px)', false], ['(min-height:800px) and (max-height:400px)', true]]) {
    const css = `@media ${query}{.a{color:rgb(255, 0, 0)}}`;
    expect(warns(css, 'W_CSS_MEDIA_NEVER'), query).toBe(never);
    let matched = false;
    for (const [w, h] of [[320, 300], [600, 400], [750, 600], [900, 800], [1200, 900]]) { await page.setViewportSize({width: w, height: h}); matched ||= await page.evaluate(q => matchMedia(q).matches, query); }
    expect(matched, query).toBe(!never);
  }
});

test('F6: a property declared twice in one rule: the browser uses the one the warning keeps', async ({page}) => {
  for (const [css, kept] of [['.a{color:rgb(255, 0, 0);color:rgb(0, 0, 255)}', 'rgb(0, 0, 255)'], ['.a{color:rgb(255, 0, 0) !important;color:rgb(0, 0, 255)}', 'rgb(255, 0, 0)'], ['.a{color:rgb(0, 128, 0);color:rgb(0, 128, 0)}', 'rgb(0, 128, 0)']]) {
    await load(page, css);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color), css).toBe(kept);
    const w = (analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).find(x => x.code === 'W_CSS_DUPLICATE_DECLARATION');
    expect(w, css).toBeTruthy();
    // The message names the declaration that wins as the browser's value.
    expect(w.message.includes(`(${kept}`) || w.message.includes(`${kept} twice`), `${css}: ${w.message}`).toBe(true);
  }
});

test('F7: z-index stacks a box only where it is positioned or a flex or grid item', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  // .a has z-index 5 and comes first; .b overlaps it (moved up 20px) and comes after. Painting order puts .b on top
  // unless .a's z-index applies.
  const html = '<div class="p"><div class="a"></div><div class="b"></div></div>';
  for (const [css, inert] of [['.p{display:block}', true], ['.p{display:block}.a{position:relative}', false], ['.p{display:flex;flex-direction:column}.a,.b{flex:none}', false], ['.p{display:grid;grid-template-columns:minmax(0,1fr)}', false]]) {
    const full = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a,.b{height:40px;background:#888}.a{z-index:5;background:#f00}.b{position:relative;top:-20px}${css}`;
    await page.setContent(`<!doctype html><html lang="en"><head><style>${full}</style></head><body>${html}</body></html>`);
    const top = await page.evaluate(() => document.elementFromPoint(10, 30)?.className);
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: full, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('z-index'));
    expect(warned, css).toBe(inert);
    expect(top, css).toBe(inert ? 'b' : 'a');
  }
});

test('F8: a transition between auto (or none) and a length jumps', async ({page}) => {
  for (const [css, jumps] of [['.a{width:100px;height:auto;transition:height 1s linear}.a:hover{height:100px}', true], ['.a{width:100px;height:20px;transition:height 1s linear}.a:hover{height:100px}', false], ['.a{width:100px;max-height:none;transition:max-height 1s linear}.a:hover{max-height:10px}', true]]) {
    expect(warns(css, 'W_CSS_TRANSITION_AUTO'), css).toBe(jumps);
    // The hovered state, applied after a first frame: a transition runs, or the box is at its end value at once.
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css.replace(':hover', '.on')}</style></head><body><div class="a">x</div></body></html>`);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const running = await page.evaluate(() => { document.querySelector('.a').classList.add('on'); return document.getAnimations().length > 0; });
    expect(running, css).toBe(!jumps);
  }
});

test('F9, F10: a pseudo-element without content, and content on an element', async ({page}) => {
  for (const [css, generated] of [['.a::before{display:block;width:10px;height:10px}', false], ['.a::before{content:"";display:block;height:10px}', true]]) {
    await load(page, css);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a'), '::before').content !== 'none'), css).toBe(generated);
    expect(warns(css, 'W_CSS_PSEUDO_NO_CONTENT'), css).toBe(!generated);
  }
  await load(page, '.a{content:"hi"}');
  expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().height)).toBe(20);
  expect((analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + '.a{content:"hi"}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('content'))).toBe(true);
});

test('F8 between component states: a class toggle that changes a size between auto and a length jumps', async ({page}) => {
  const viewport = {min: 400, max: 400, height: {min: 600, max: 600}};
  for (const [css, jumps] of [['*{margin:0}.panel{width:100px;transition:height 1s linear}.panel.open{height:120px}', true], ['*{margin:0}.panel{width:100px;height:0;transition:height 1s linear}.panel.open{height:120px}', false]]) {
    const states = [{html: '<div class="panel"></div>', choices: {open: false}}, {html: '<div class="panel open"></div>', choices: {open: true}}];
    expect(analyzeStates({states, css}, {viewport}).findings.some(f => f.code === 'W_CSS_TRANSITION_AUTO'), css).toBe(jumps);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="panel">x</div></body></html>`);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => { document.querySelector('.panel').classList.add('open'); return document.getAnimations().length > 0; }), css).toBe(!jumps);
  }
});

test('F12: a transition with no duration changes at once', async ({page}) => {
  for (const [css, instant] of [['.a{transition:opacity}.a.on{opacity:.2}', true], ['.a{transition:opacity 1s}.a.on{opacity:.2}', false]]) {
    expect(warns(css.replace('.a.on', '.a:hover'), 'W_CSS_TRANSITION_NO_DURATION'), css).toBe(instant);
    await load(page, css);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => { document.querySelector('.a').classList.add('on'); return document.getAnimations().length > 0; }), css).toBe(!instant);
  }
});

test('F13: an over-constrained absolute box ignores its end inset', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const html = '<div class="p"><div class="a"></div></div>';
  const rect = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}.p{position:relative;height:100px}${css}</style></head><body>${html}</body></html>`); return page.evaluate(() => JSON.stringify(document.querySelector('.a').getBoundingClientRect())); };
  for (const [css, ignored] of [['.a{position:absolute;top:0;left:10px;right:10px;width:50px;height:10px}', 'right'], ['.p{direction:rtl}.a{position:absolute;top:0;left:10px;right:10px;width:50px;height:10px}', 'left'], ['.a{position:absolute;top:5px;bottom:5px;left:0;width:10px;height:30px}', 'bottom'], ['.a{position:absolute;top:0;left:10px;right:10px;height:10px}', null]]) {
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{position:relative;height:100px}${css}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    const warned = (r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_DECLARATION_INERT').flatMap(w => w.properties).find(p => ['left', 'right', 'bottom', 'top'].includes(p)) ?? null;
    expect(warned, css).toBe(ignored);
    if (ignored) expect(await rect(css.replace(/\.a\{/, `.a{${ignored}:auto!important;`)), css).toBe(await rect(css));
  }
});

test('F14: a border width with no border style draws no border', async ({page}) => {
  for (const [css, none] of [['.a{border-width:4px}', true], ['.a{border-width:0 4px}', true], ['.a{border-width:4px;border-style:solid}', false]]) {
    await load(page, `.a{box-sizing:content-box;width:50px}${css}`);
    const b = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.a')); return {top: s.borderTopWidth, right: s.borderRightWidth, width: document.querySelector('.a').getBoundingClientRect().width}; });
    expect(warns(`.a{box-sizing:content-box;width:50px}${css}`, 'W_CSS_BORDER_NO_STYLE'), css).toBe(none);
    expect(b.width === 50 && b.right === '0px', `${css}: ${JSON.stringify(b)}`).toBe(none);
  }
});
