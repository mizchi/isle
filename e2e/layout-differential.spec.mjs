// Differential check: one declaration at a time on small grid, flex, block and column-flex layouts. Wherever the
// analysis says verified, every box's rectangle must be Chromium's (a verified result with another geometry is a
// soundness bug: tr { height }, flex-grow with a width and a column item's min-height were found this way).
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const val = a => a == null ? null : Number(String(a.constant).split('/').reduce((x, y) => x / y)) + (a.coefficient && Number(a.coefficient) ? NaN : 0);
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const layouts = {
  grid: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:grid;grid-template-columns:100px 1fr;gap:10px;width:300px}.a,.b{height:20px}'],
  flex: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:flex;gap:10px;width:300px}.a,.b{height:20px;width:50px}'],
  block: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:block;width:300px}.a,.b{height:20px}'],
  col: ['<main class="p"><div class="a"></div><div class="b"></div></main>', '.p{display:flex;flex-direction:column;height:200px;width:300px}.a,.b{height:20px}'],
};
const decls = ['.a{margin:auto}', '.a{margin-left:auto}', '.a{margin:-5px}', '.a{min-width:200px}', '.a{max-width:20px}', '.a{max-height:5px}', '.a{min-height:50px}', '.a{padding:5px}', '.a{border:3px solid #000}', '.a{box-sizing:content-box;padding:4px;width:40px}', '.a{flex:1}', '.a{flex-grow:2}', '.a{flex-shrink:0;width:400px}', '.a{align-self:center}', '.a{align-self:end}', '.a{justify-self:end}', '.a{justify-self:center;width:30px}', '.p{align-items:center}', '.p{justify-content:space-between}', '.p{justify-content:center}', '.p{align-content:center;height:100px}', '.p{padding:10px}', '.p{border:2px solid #000}', '.a{order:-1}', '.a{position:relative;top:5px}', '.a{transform:translateX(5px)}', '.a{width:50%}', '.a{height:50%}', '.p{height:100px}.a{height:50%}', '.a{aspect-ratio:2;height:auto;width:40px}', '.a{grid-column:span 2}', '.a{grid-row:2}', '.p{grid-auto-flow:column}', '.p{place-items:center}', '.a{margin-block:10px}', '.a{inset:0;position:absolute}', '.p{position:relative}.a{position:absolute;right:0;width:10px}', '.a{float:right}', '.a{display:none}', '.a{visibility:hidden}', '.a{width:fit-content}', '.a{width:min-content}', '.a{width:calc(100% - 20px)}', '.a{width:clamp(10px,50%,100px)}', '.a{min-width:min(100px,50%)}', '.p{flex-wrap:wrap}.a{width:250px}', '.p{column-gap:30px}', '.p{row-gap:30px}', '.a{margin-top:10px}.b{margin-top:15px}', '.a{margin-bottom:10px}.b{margin-top:15px}'];

for (const [ln, [html, lcss]] of Object.entries(layouts)) test(`${ln}: every verified declaration lays the boxes out as Chromium does`, async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const mismatches = [];
  let checked = 0;
  for (const d of decls) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}${lcss}${d}`;
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    if (r.status !== 'verified') continue;
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    for (const sel of ['.p', '.a', '.b']) {
      const row = r.sizes.find(s => s.box.startsWith(sel) && s.rect);
      if (!row) continue;
      const m = [row.rect.inlineStart, row.rect.blockStart, row.rect.inlineSize, row.rect.blockSize].map(val);
      const br = await page.evaluate(s => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
      if (!br) continue;
      checked++;
      if (m.some((v, i) => !Number.isNaN(v) && Math.abs(v - br[i]) > 0.02)) mismatches.push(`${d} ${sel}: model ${m}, Chromium ${br}`);
    }
  }
  expect(checked).toBeGreaterThan(60);
  expect(mismatches).toEqual([]);
});
