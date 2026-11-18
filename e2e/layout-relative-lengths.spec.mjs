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
  // Linear flex widths and bases: calc() of px and %, and vw (the rest of checklist D2).
  '.p{display:flex;width:300px}.a{width:20vw;flex:none}.b{width:50px;flex:none}.c{width:calc(10vw + 7px);flex:none}',
  '.p{display:flex;width:300px}.a{width:calc(50% - 10px);flex:none}.b{width:50px;flex:none}.c{flex:0 0 calc(10% + 3px)}',
  '.p{display:flex;width:300px;gap:6px}.a{flex:1 1 calc(40% + 20px);min-width:0}.b{width:50px;flex:none}.c{flex:2 0 calc(5% + 1px)}',
  '.p{display:flex;width:300px}.a{flex:1 1 calc(20% + 20px);min-width:10px}.b{width:50px;flex:none}.c{flex:1 1 30%;min-width:0}',
  '.p{display:flex;width:90vw}.a{width:calc(50% + 10px);flex:none;padding:0 5px}.b{width:10vw;flex:none}.c{flex:1 0 0;min-width:0}',
  // Percentage grid columns and column-gap in a px-wide grid.
  '.p{display:grid;width:300px;grid-template-columns:25% minmax(0,1fr) 10%;column-gap:5%}',
  '.p{display:grid;width:300px;grid-template-columns:repeat(2,33.5%) minmax(0,1fr)}',
];

test('em lengths and percentage flex widths: every box is where the browser puts it', async ({page}) => {
  for (const W of [400, 640]) {
  await page.setViewportSize({width: W, height: 300});
  for (const c of cases) {
    const css = base + c;
    const r = analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: W, max: W, height: {min: 300, max: 300}}});
    expect(r.status === 'unknown', `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).toBe(false);
    const model = Object.fromEntries(r.sizes.filter(s => s.rect && /^\.(?:a|b|c)$/.test(s.box)).map(s => [s.box, [frac(s.rect.inlineStart.constant) + frac(s.rect.inlineStart.coefficient) * W, frac(s.rect.inlineSize.constant) + frac(s.rect.inlineSize.coefficient) * W]]));
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${body}</body></html>`);
    const browser = await page.evaluate(() => Object.fromEntries(['.a', '.b', '.c'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [r.left, r.width]]; })));
    // Browsers round positions to 1/64px (LayoutUnit), which a shrinking flex line's fractions show: 2/64px is allowed.
    for (const k of Object.keys(model)) model[k].forEach((v, i) => expect(Math.abs(v - browser[k][i]), `${W} ${c} ${k}[${i}]: model ${v}, browser ${browser[k][i]}`).toBeLessThanOrEqual(2 / 64 + 1e-9));
    expect(Object.keys(model).length).toBe(3);
  }
  }
});

// Checklist D2: a percentage height in block flow, against a parent with a declared (px or vh) height, and px and %
// mixed in calc(): every box's top and height are where the browser puts them.
const heightCases = [
  '.p{height:200px}.a{height:50%}',
  '.p{height:200px;padding-top:10px}.a{height:25%;margin-top:5px}',
  '.p{height:200px}.a{height:calc(50% - 10px)}.c{height:calc(10% + 4px)}',
  '.p{height:50vh}.a{height:50%}',
  '.p{height:200px;max-height:120px}.a{height:50%}',
  '.p{height:220px;box-sizing:content-box;padding:10px 0}.a{height:50%}.c{min-height:10%}',
  // Percentage grid rows and row-gap in a grid of a declared height.
  '.p{height:200px;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:50% minmax(0,1fr) 10%;row-gap:5%}.a,.b,.c{height:auto}',
  '.p{height:200px;max-height:160px;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:25% 30px 25%}',
];
test('percentage heights in block flow against a declared height: every box is where the browser puts it', async ({page}) => {
  const at = (v, W, H) => frac(v.constant) + frac(v.coefficient) * W + frac(v.heightCoefficient ?? 0) * H;
  for (const [W, H] of [[400, 300], [400, 500]]) {
    await page.setViewportSize({width: W, height: H});
    for (const c of heightCases) {
      const css = base + c;
      const r = analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 500}}});
      expect(r.status === 'unknown', `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).toBe(false);
      const model = Object.fromEntries(r.sizes.filter(s => s.rect && /^\.(?:a|b|c)$/.test(s.box)).map(s => [s.box, [at(s.rect.blockStart, W, H), at(s.rect.blockSize, W, H)]]));
      await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${body}</body></html>`);
      const browser = await page.evaluate(() => Object.fromEntries(['.a', '.b', '.c'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [r.top, r.height]]; })));
      for (const k of Object.keys(model)) model[k].forEach((v, i) => expect(Math.abs(v - browser[k][i]), `${W}x${H} ${c} ${k}[${i}]: model ${v}, browser ${browser[k][i]}`).toBeLessThanOrEqual(2 / 64 + 1e-9));
      expect(Object.keys(model).length).toBe(3);
    }
  }
});
