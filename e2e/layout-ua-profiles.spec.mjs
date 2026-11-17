// UA profiles (the ua layout option): unstyled form controls laid out with the profile of the browser the test runs in
// match that browser's rectangles. The same page differs between Chromium, Firefox and WebKit (padding, borders,
// margins); each profile carries its own browser's values (packages/css-verifier/src/layout/ua-profile.mjs).
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const reset = '*{margin:0}html,body{margin:0;display:grid;grid-template-columns:minmax(0,1fr)}';
// Controls with only a size: their UA padding, border and margins decide where they and the boxes after them go.
const cases = [
  ['text input (content-box)', '<main class="g"><input class="f" type="text"><div class="after"></div></main>', '.f{display:block;inline-size:100px;block-size:20px}'],
  ['textarea (content-box)', '<main class="g"><textarea class="f"></textarea><div class="after"></div></main>', '.f{display:block;inline-size:100px;block-size:40px;resize:none}'],
  ['button (content-box)', '<main class="g"><button class="f" type="button" aria-label="Go"></button><div class="after"></div></main>', '.f{display:block;box-sizing:content-box;inline-size:120px;block-size:24px}'],
  // (appearance: none keeps the UA margins: only they decide where the box after it goes.)
  ['checkbox margins', '<main class="g"><input class="f" type="checkbox" aria-label="A"><div class="after"></div></main>', '.f{appearance:none;display:block;box-sizing:border-box;inline-size:13px;block-size:13px;min-inline-size:0;min-block-size:0;padding:0;border:1px solid #000}'],
  ['radio margins', '<main class="g"><input class="f" type="radio" aria-label="A"><div class="after"></div></main>', '.f{appearance:none;display:block;box-sizing:border-box;inline-size:13px;block-size:13px;min-inline-size:0;min-block-size:0;padding:0;border:1px solid #000}'],
];
const common = '.g{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start;align-content:start}.after{inline-size:40px;block-size:10px}';
const value = a => Number(String(a.constant).split('/').reduce((x, y) => x / y)) + (a.coefficient ? Number(String(a.coefficient).split('/').reduce((x, y) => x / y)) : 0);

for (const [name, html, css] of cases) {
  test(`${name}: the browser's UA profile places the control and the box after it as the browser does`, async ({page}, testInfo) => {
    const ua = testInfo.project.name;
    const sheet = reset + common + css;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: sheet, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua});
    expect(report.status === 'unknown', `${ua}: ${JSON.stringify(report.diagnostics.map(d => d.message))}`).toBe(false);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${sheet}</style></head><body>${html}</body></html>`);
    for (const sel of ['.f', '.after']) {
      const browser = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
      const row = report.sizes.find(r => r.box.startsWith(sel) && r.rect);
      expect(row, `${ua} ${sel}: no rectangle`).toBeTruthy();
      const model = [row.rect.inlineStart, row.rect.blockStart, row.rect.inlineSize, row.rect.blockSize].map(value);
      model.forEach((v, i) => expect(Math.abs(v - browser[i]), `${ua} ${name} ${sel} [x, y, w, h][${i}]: model ${v}, browser ${browser[i]}`).toBeLessThanOrEqual(1 / 64 + 1e-6));
    }
  });
}

test('without the ua option, a field\'s UA padding and border stay unknown (the historical default)', async () => {
  const report = analyzeHTML('<html lang="en"><body><main class="g"><input class="f" type="text"></main></body></html>', {name: 'P', css: reset + common + cases[0][2], viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
  expect(report.status).toBe('unknown');
});

// The suggested reset: with it applied, the target profile (chromium) describes every browser — the unstyled
// controls land where the chromium model puts them, in Firefox and WebKit too.
import {suggestReset} from '../packages/css-verifier/src/layout/ua-reset.mjs';
const resetCSS = suggestReset().css;
for (const [name, html, css] of cases) {
  test(`${name}: with the suggested reset, the chromium profile places it in every browser`, async ({page}, testInfo) => {
    const sheet = reset + resetCSS + common + css;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: sheet, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ua: 'chromium'});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics.map(d => d.message))).toBe(false);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${sheet}</style></head><body>${html}</body></html>`);
    for (const sel of ['.f', '.after']) {
      const browser = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, sel);
      const row = report.sizes.find(r => r.box.startsWith(sel) && r.rect);
      const model = [row.rect.inlineStart, row.rect.blockStart, row.rect.inlineSize, row.rect.blockSize].map(value);
      model.forEach((v, i) => expect(Math.abs(v - browser[i]), `${testInfo.project.name} ${name} ${sel} [x, y, w, h][${i}]: model ${v}, browser ${browser[i]}`).toBeLessThanOrEqual(1 / 64 + 1e-6));
    }
  });
}
