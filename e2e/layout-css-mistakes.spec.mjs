// Checklist F: CSS the browser accepts but that does nothing. Each warning holds exactly where the browser shows no
// effect of the declaration.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

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
