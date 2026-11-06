import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { analyzeLayout } from '../lib/layout.mjs';

const directory = 'evals/results/layout-reset';
const ir = requireIR(compile(await readFile('evals/scenarios/layout-reset/fixture.isle', 'utf8')));
const config = JSON.parse(await readFile('evals/scenarios/layout-reset/layout.json', 'utf8'));
const reset = await readFile('evals/scenarios/layout-reset/reset.css', 'utf8');
const app = await readFile('evals/scenarios/layout-reset/app.css', 'utf8');
const html = prepareProgram(ir).render('ResetPanel', {}).html;
const document = (reset, app) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reset and box sizing</title><style>html,body{height:100%}</style><style>${reset}</style><style>${app}</style></head><body>${html}</body></html>`;
const report = (reset, css = app) => analyzeLayout(ir, { ...config, css, reset: [{ css: reset, file: 'reset.css' }] });

test('inherited reset and layered overrides match computed sizing and overflow on both axes', async ({ page }) => {
  await mkdir(directory, { recursive: true });
  const variants = [
    { name: 'reset', reset, app, sizing: 'border-box', status: 'verified' },
    { name: 'override', reset, app: app + '@layer app {.copy {box-sizing:content-box;}}', sizing: 'content-box', status: 'violated' },
    { name: 'important', reset: reset + '@layer reset {.copy {box-sizing:border-box!important;}}', app: app + '@layer app {.copy {box-sizing:content-box!important;}}', sizing: 'border-box', status: 'verified' },
  ];
  const observations = [];
  for (const variant of variants) {
    const result = report(variant.reset, variant.app);
    expect(result.status).toBe(variant.status);
    expect(result.sizes.find(size => size.box === '.copy').boxSizing).toBe(variant.sizing);
    await writeFile(`${directory}/${variant.name}.json`, JSON.stringify(result, null, 2) + '\n');
    for (const [width, height] of [[240, 200], [375, 400], [1000, 600]]) {
      await page.setViewportSize({ width, height }); await page.setContent(document(variant.reset, variant.app));
      const actual = await page.locator('.copy').evaluate(element => {
        const parent = element.parentElement, style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return { boxSizing: style.boxSizing, width: rect.width, height: rect.height,
          overflowX: rect.width > parent.clientWidth - 32, overflowY: rect.height > parent.clientHeight - 32 };
      });
      expect(actual.boxSizing).toBe(variant.sizing);
      expect(actual.overflowX).toBe(variant.status === 'violated'); expect(actual.overflowY).toBe(variant.status === 'violated');
      observations.push({ variant: variant.name, viewport: { width, height }, ...actual });
    }
  }
  await writeFile(`${directory}/browser.json`, JSON.stringify({ passed: true, observations }, null, 2) + '\n');
  await writeFile(`${directory}/fixed.html`, document(reset, app));
  for (const [width, height] of [[375, 400], [1000, 600]]) {
    await page.setViewportSize({ width, height }); await page.setContent(document(reset, app));
    await page.screenshot({ path: `${directory}/${width}x${height}.png`, fullPage: true });
  }
});

test(':where has zero specificity while :is keeps unmatched ID branch specificity', async ({ page }) => {
  for (const [pseudo, sizing] of [['where', 'content-box'], ['is', 'border-box']]) {
    const resetCSS = reset + `:${pseudo}(#never, .copy) {box-sizing:border-box;}`;
    const appCSS = app + '.copy {box-sizing:content-box;}';
    const result = report(resetCSS, appCSS);
    expect(result.sizes.find(size => size.box === '.copy').boxSizing).toBe(sizing);
    await page.setContent(document(resetCSS, appCSS));
    expect(await page.locator('.copy').evaluate(el => getComputedStyle(el).boxSizing)).toBe(sizing);
  }
});

test('conditional ancestor resets and root initial/unset/revert semantics agree with the browser', async ({ page }) => {
  const resetCSS = reset + '@layer reset {@media(width < 400px) {:root {box-sizing:content-box;}}}';
  const result = report(resetCSS);
  const failed = result.diagnostics.find(d => d.code === 'E_LAYOUT_ITEM_SIZE');
  expect(failed.range.maxExact).toBe('400');
  for (const width of [375, 400, 500]) {
    await page.setViewportSize({ width, height: 400 }); await page.setContent(document(resetCSS, app));
    expect(await page.locator('.copy').evaluate(el => getComputedStyle(el).boxSizing)).toBe(width < 400 ? 'content-box' : 'border-box');
  }
  for (const keyword of ['initial', 'unset', 'revert']) {
    const appCSS = app + `.copy {box-sizing:${keyword};}`;
    expect(report(reset, appCSS).sizes.find(size => size.box === '.copy').boxSizing).toBe('content-box');
    await page.setContent(document(reset, appCSS));
    expect(await page.locator('.copy').evaluate(el => getComputedStyle(el).boxSizing)).toBe('content-box');
  }
});
