// Differential check: one declaration at a time on small grid, flex, block and column-flex layouts. Wherever the
// analysis says verified, every box's rectangle must be Chromium's (a verified result with another geometry is a
// soundness bug: tr { height }, flex-grow with a width and a column item's min-height were found this way).
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

// A rectangle value is affine in the viewport: constant + coefficient × width + heightCoefficient × height.
const num = t => t === undefined ? 0 : Number(String(t).split('/').reduce((x, y) => x / y));
const val = a => a == null ? null : num(a.constant) + num(a.coefficient) * 400 + num(a.heightCoefficient) * 300;
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
// WebKit rounds positions to 1/64px (LayoutUnit), which accumulates over a few boxes (docs/css-baseline.md).
const tolerance = () => test.info().project.name === 'webkit' ? 2 / 64 : 0.02;
const layouts = {
  grid: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:grid;grid-template-columns:100px 1fr;gap:10px;width:300px}.a,.b{height:20px}'],
  flex: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:flex;gap:10px;width:300px}.a,.b{height:20px;width:50px}'],
  block: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:block;width:300px}.a,.b{height:20px}'],
  col: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:flex;flex-direction:column;height:200px;width:300px}.a,.b{height:20px}'],
  autofill: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;width:300px}.a,.b{height:20px}'],
  frs: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:grid;grid-template-columns:1fr 2fr;grid-template-rows:40px 1fr;height:150px;width:300px}'],
  nested: ['<main class="p"><div class="a"><div class="k"></div></div><div class="b"></div></main>', '.p{display:flex;gap:10px;width:300px}.a{display:grid;grid-template-columns:minmax(0,1fr);flex:1}.k{height:30px}.b{width:60px;height:20px}'],
  abs: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:block;position:relative;width:300px;height:120px}.a{position:absolute;top:10px;left:20px;width:50px;height:20px}.b{height:20px}'],
  wrap: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:flex;flex-wrap:wrap;gap:10px;width:300px}.a,.b{height:20px;width:180px}'],
  pct: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:grid;grid-template-columns:minmax(0,1fr);height:200px;width:300px}.a{height:25%}.b{height:20px}'],
  flexgrid: ['<main class="p"><div class="a"><div class="k"></div><div class="k"></div></div><div class="b"></div></main>', '.p{display:flex;flex-direction:column;height:240px;width:300px}.a{display:grid;grid-template-columns:1fr 1fr;gap:6px;min-height:80px}.k{height:30px}.b{height:20px}'],
  gridflex: ['<main class="p"><div class="a"><div class="k"></div><div class="k"></div></div><div class="b"></div></main>', '.p{display:grid;grid-template-columns:200px 1fr;width:300px}.a{display:flex;gap:8px}.k{width:40px;height:30px}.b{height:20px}'],
  deep: ['<main class="p"><div class="a"><div class="m"><div class="k"></div></div></div><div class="b"></div></main>', '.p{display:grid;grid-template-columns:minmax(0,1fr);width:300px}.a{display:flex;padding:4px}.m{display:grid;grid-template-columns:minmax(0,1fr);flex:1;padding:3px}.k{height:24px}.b{height:20px}'],
  rowflexgrid: ['<main class="p"><div class="a"><div class="k"></div></div><div class="b"></div></main>', '.p{display:flex;gap:10px;width:300px;height:120px}.a{display:grid;grid-template-columns:minmax(0,1fr);flex:1;min-height:60px}.k{height:30px}.b{width:60px;height:20px}'],
};
const decls = ['.a{margin:auto}', '.a{margin-left:auto}', '.a{margin:-5px}', '.a{min-width:200px}', '.a{max-width:20px}', '.a{max-height:5px}', '.a{min-height:50px}', '.a{padding:5px}', '.a{border:3px solid #000}', '.a{box-sizing:content-box;padding:4px;width:40px}', '.a{flex:1}', '.a{flex-grow:2}', '.a{flex-shrink:0;width:400px}', '.a{align-self:center}', '.a{align-self:end}', '.a{justify-self:end}', '.a{justify-self:center;width:30px}', '.p{align-items:center}', '.p{justify-content:space-between}', '.p{justify-content:center}', '.p{align-content:center;height:100px}', '.p{padding:10px}', '.p{border:2px solid #000}', '.a{order:-1}', '.a{position:relative;top:5px}', '.a{transform:translateX(5px)}', '.a{width:50%}', '.a{height:50%}', '.p{height:100px}.a{height:50%}', '.a{aspect-ratio:2;height:auto;width:40px}', '.a{grid-column:span 2}', '.a{grid-row:2}', '.p{grid-auto-flow:column}', '.p{place-items:center}', '.a{margin-block:10px}', '.a{inset:0;position:absolute}', '.p{position:relative}.a{position:absolute;right:0;width:10px}', '.a{float:right}', '.a{display:none}', '.a{visibility:hidden}', '.a{width:fit-content}', '.a{width:min-content}', '.a{width:calc(100% - 20px)}', '.a{width:clamp(10px,50%,100px)}', '.a{min-width:min(100px,50%)}', '.p{flex-wrap:wrap}.a{width:250px}', '.p{column-gap:30px}', '.p{row-gap:30px}', '.a{margin-top:10px}.b{margin-top:15px}', '.a{margin-bottom:10px}.b{margin-top:15px}',
  '.a{width:120%}', '.a{height:auto}', '.a{min-width:0}', '.a{max-width:none}', '.a{flex:none}', '.a{flex:0 0 100px}', '.a{flex:1 1 0}', '.a{flex-basis:80px}', '.a{flex-basis:30%}', '.p{flex-direction:row-reverse}', '.p{flex-direction:column-reverse}', '.p{justify-content:flex-end}', '.p{justify-content:space-around}', '.p{justify-content:space-evenly}', '.p{align-items:flex-end;height:80px}', '.p{align-items:stretch;height:80px}', '.p{align-items:baseline}', '.a{align-self:stretch;height:auto}', '.p{justify-items:end}', '.p{justify-items:center}', '.a{grid-column:1/-1}', '.a{grid-column:2}', '.a{grid-row:span 2}', '.p{grid-auto-rows:50px}', '.p{grid-template-columns:repeat(3,1fr)}', '.p{grid-template-columns:200px 200px}', '.p{grid-template-columns:minmax(50px,100px) 1fr}', '.p{grid-template-columns:fit-content(80px) 1fr}', '.p{grid-template-rows:30px 30px}', '.p{width:auto}', '.p{max-width:250px}', '.p{min-width:350px}', '.p{margin:0 auto}', '.p{margin-left:auto}', '.p{box-sizing:content-box;padding:5px}', '.a{border-width:0 0 4px}', '.a{padding:0 10px}', '.a{margin:5px 10px}', '.b{margin-left:auto}', '.b{position:relative;left:-5px}', '.b{display:none}', '.a{position:sticky;top:0}', '.a{inline-size:100px;block-size:40px}', '.a{width:calc(50% + 10px)}', '.a{height:calc(10px * 3)}', '.a{width:max(30px,20%)}', '.a{width:100vw}', '.a{height:10vh}', '.a{width:10rem}', '.a{width:5em}', '.a{overflow:hidden;height:5px}', '.a{contain:size}', '.a{container-type:inline-size;width:100px}', '.a{min-height:150px}', '.a{min-height:10px}', '.p{height:60px}', '.p{height:auto}', '.a{min-height:90px}.p{height:100px}', '.a{flex-shrink:0}.p{height:60px}', '.b{min-height:40px}', '.k{height:70px}'];

for (const [ln, [html, lcss]] of Object.entries(layouts)) test(`${ln}: every verified declaration lays the boxes out as Chromium does`, async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const mismatches = [];
  let checked = 0;
  for (const d of decls) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}${lcss}${d}`;
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    if (r.status !== 'verified') continue;
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    for (const sel of ['.p', '.a', '.b', '.m', '.k']) {
      const row = r.sizes.find(s => s.box.startsWith(sel) && s.rect);
      if (!row) continue;
      const m = [row.rect.inlineStart, row.rect.blockStart, row.rect.inlineSize, row.rect.blockSize].map(val);
      const br = await page.evaluate(s => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
      if (!br) continue;
      checked++;
      if (m.some((v, i) => !Number.isNaN(v) && Math.abs(v - br[i]) > tolerance())) mismatches.push(`${d} ${sel}: model ${m}, Chromium ${br}`);
    }
  }
  expect(checked).toBeGreaterThan(0);
  expect(mismatches).toEqual([]);
});

// Pairs of declarations (a fixed pseudo-random sample, the same on every run): interactions single declarations miss.
const pick = seed => { let s = seed; return n => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; }; };
for (const [ln, [html, lcss]] of Object.entries(layouts)) test(`${ln}: every verified pair of declarations lays the boxes out as Chromium does`, async ({page}) => {
  test.setTimeout(240000);
  await page.setViewportSize({width: 400, height: 300});
  const rand = pick(ln.length * 7919 + 17), mismatches = [];
  for (let k = 0; k < 120; k++) {
    const d = decls[rand(decls.length)] + decls[rand(decls.length)];
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}${lcss}${d}`;
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    if (r.status !== 'verified') continue;
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    for (const sel of ['.p', '.a', '.b', '.m', '.k']) {
      const row = r.sizes.find(s => s.box.startsWith(sel) && s.rect);
      if (!row) continue;
      const m = [row.rect.inlineStart, row.rect.blockStart, row.rect.inlineSize, row.rect.blockSize].map(val);
      const br = await page.evaluate(s => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
      if (br && m.some((v, i) => !Number.isNaN(v) && Math.abs(v - br[i]) > tolerance())) mismatches.push(`${d} ${sel}: model ${m}, Chromium ${br}`);
    }
  }
  expect(mismatches).toEqual([]);
});
