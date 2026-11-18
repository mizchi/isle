// CSS Nesting: where the analysis flattens nested rules, every box is as tall in the browser as the analysis says.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const body = '<div class="card"><div class="k"></div><div class="card"><div class="k in"></div><p class="k"></p></div></div><div class="k out"></div>';
const cases = [
  '.card{& .k{height:30px}}', '.card{.k{height:30px}}', '.card{> .k{height:30px}}', '.card{.card{.k{height:35px}}}',
  '.k{.card &{height:25px}}', '.k{&.in{height:15px}}', '.card{+ .k{height:22px}}', '.card{~ .out{height:27px}}',
  '.k{@media (min-width:300px){height:40px}}', '.k{@media (min-width:600px){height:40px}}',
  '.k{height:20px;@media (min-width:1px){height:40px}height:50px}', '.card{& .k{height:30px}}.card .k{height:20px}',
  '.out,.card{& .k{height:30px}}', '.card .k{&.in{height:15px}}', '.card{.k{height:30px;&.in{height:12px}}p{height:8px}}',
  '.card{@supports (display:grid){& > .k{height:33px}}}', '.k{height:20px;.card &{height:30px}height:5px}',
];

test('flattened nested rules: the analysis gives the browser\'s heights', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const c of cases) {
    const css = `*{margin:0}html,body,.card{${g}}.k{height:10px}${c}`;
    const r = analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).not.toBe('unknown');
    const model = r.sizes.filter(s => /^(?:\.k|p)/.test(s.box.split(' ').at(-1)) && s.rect).map(s => Number(s.rect.blockSize.constant));
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${body}</body></html>`);
    const browser = await page.evaluate(() => [...document.querySelectorAll('.k')].map(e => e.getBoundingClientRect().height));
    expect(model, c).toEqual(browser);
  }
});
