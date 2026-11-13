// Supplementary browser eval for the flex and display: contents subsets. The
// static rectangles (affine in the viewport) are evaluated at sample sizes and
// compared with Chromium. Browser rendering is not used to accept source.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const reset = '*{box-sizing:border-box;margin:0;padding:0}';
const cases = [
  {name: 'fixed and flexible items', html: '<main class="row"><div class="avatar"></div><div class="name"></div><div class="tail"></div></main>',
    css: '.row{display:flex;column-gap:8px;padding:0 16px;block-size:72px}.avatar{flex:none;width:48px}.name{flex:1 1 0;min-width:0}.tail{flex:0 0 30px;min-width:30px}'},
  {name: 'weighted items with padding and borders', html: '<main class="row"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:40px;border:2px solid red}.a{flex:1 1 0;min-width:0}.b{flex:2 1 0;min-width:0;padding:0 10px}.c{flex:1 0 0;min-width:0;border:3px solid red;box-sizing:content-box}'},
  {name: 'factor sum below one', html: '<main class="row"><div class="a"></div><div class="b"></div></main>',
    css: '.row{display:flex;block-size:30px}.a{flex:0.25 1 0;min-width:0}.b{flex:0.5 1 0;min-width:0}'},
  {name: 'contents inside a grid', html: '<main class="grid"><div class="wrap"><div class="cell"></div><div class="cell"></div></div><div class="cell"></div></main>',
    css: '.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:4px;grid-auto-rows:20px}.wrap{display:contents;padding:30px}'},
  {name: 'nested contents inside a flex row', html: '<main class="row"><div class="outer"><div class="inner"><div class="a"></div></div><div class="b"></div></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:24px;column-gap:6px}.outer,.inner{display:contents}.a,.b{flex:1 1 0;min-width:0}.c{flex:none;width:50px}'},
  {name: 'flex item that is a grid', html: '<main class="row"><section class="g"><div></div><div></div></section><div class="side"></div></main>',
    css: '.row{display:flex;block-size:50px}.g{flex:1 1 0;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) 20px}.side{flex:none;width:64px}'},
];
const evaluate = (affine, width, height) => {
  const value = text => { const [n, d = '1'] = text.split('/'); return Number(n) / Number(d); };
  return value(affine.coefficient) * width + value(affine.heightCoefficient ?? '0') * height + value(affine.constant);
};
const inside = (range, value) => value >= range.min && value <= range.max;

for (const sample of cases) {
  test(`${sample.name}: model rectangles match Chromium`, async ({page}) => {
    const css = reset + sample.css;
    const report = analyzeHTML(sample.html, {name: 'Case', css, viewport: {min: 200, max: 900, height: {min: 300, max: 600}}});
    expect(report.status, JSON.stringify(report.diagnostics)).toBe('verified');
    let compared = 0;
    for (const [width, height] of [[200, 300], [321, 400], [480, 450], [777, 600]]) {
      await page.setViewportSize({width, height});
      await page.setContent(`<!doctype html><style>html,body{margin:0}${css}</style>${sample.html}`);
      const rows = report.sizes.filter(row => row.rect && inside(row.range, width) && (!row.heightRange || inside(row.heightRange, height)));
      for (const row of rows) {
        const indices = row.path.split('/').slice(1).map(Number);
        const rect = await page.evaluate(indices => {
          let node = document.querySelector('body > *');
          for (const index of indices) node = node.children[index];
          const r = node.getBoundingClientRect();
          return {x: r.left, y: r.top, width: r.width, height: r.height};
        }, indices);
        const expected = {x: evaluate(row.rect.inlineStart, width, height), y: evaluate(row.rect.blockStart, width, height),
          width: evaluate(row.rect.inlineSize, width, height), height: evaluate(row.rect.blockSize, width, height)};
        for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(rect[key] - expected[key]), `${row.path} ${key} at ${width}×${height}: browser ${rect[key]} model ${expected[key]}`).toBeLessThanOrEqual(1 / 64 + 1e-9);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(8);
  });
}
