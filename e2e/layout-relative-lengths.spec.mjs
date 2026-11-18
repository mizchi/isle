// Checklist D2: em lengths (against the element's px font-size) and a flex item's percentage width with flex-basis
// auto: every box is where the browser puts it, as wide.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const frac = v => String(v).split('/').map(Number).reduce((a, b) => a / b);
const body = '<div class="p"><div class="a"></div><div class="b"></div><div class="c"></div></div>';
const base = `*{box-sizing:border-box;margin:0}html{font-size:16px}body{${g}}.a,.b,.c{height:20px}`;
const cases = [
  '.p{display:flex;width:300px}.a{font-size:20px;width:5em;flex:none}.b{width:50px;flex:none}.c{width:3em;flex:none}',
  '.p{display:block;width:300px}.a{font-size:10px;width:6.5em;padding-left:1em}.b{font-size:12px;padding:0.5em 2em;width:10em}',
  '.p{display:flex;width:300px;gap:1em}.a{width:40%;flex:none}.b{width:50px;flex:none}.c{width:25%;flex:none}',
  '.p{display:flex;width:300px}.a{width:40%;flex-grow:1;flex-shrink:0}.b{width:50px;flex:none}.c{width:10%;flex:none}',
  '.p{display:flex;width:300px}.a{width:40%;min-width:0}.b{width:50px;flex:none}.c{width:70%;min-width:20px}',
  '.p{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:300px}.a{font-size:14px;width:5em}.b{margin-left:1em;font-size:8px}',
];

test('em lengths and percentage flex widths: every box is where the browser puts it', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const c of cases) {
    const css = base + c;
    const r = analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status === 'unknown', `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).toBe(false);
    const model = Object.fromEntries(r.sizes.filter(s => s.rect && /^\.(?:a|b|c)$/.test(s.box)).map(s => [s.box, [frac(s.rect.inlineStart.constant), frac(s.rect.inlineSize.constant)]]));
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${body}</body></html>`);
    const browser = await page.evaluate(() => Object.fromEntries(['.a', '.b', '.c'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [r.left, r.width]]; })));
    // Browsers round positions to 1/64px (LayoutUnit), which a shrinking flex line's fractions show: 2/64px is allowed.
    for (const k of Object.keys(model)) model[k].forEach((v, i) => expect(Math.abs(v - browser[k][i]), `${c} ${k}[${i}]: model ${v}, browser ${browser[k][i]}`).toBeLessThanOrEqual(2 / 64 + 1e-9));
    expect(Object.keys(model).length).toBe(3);
  }
});
