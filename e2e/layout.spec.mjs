import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { analyzeLayout } from '../lib/layout.mjs';

const directory = 'evals/results/layout';
const input = requireIR(compile(await readFile('evals/scenarios/layout/fixture.isle', 'utf8')));
const options = JSON.parse(await readFile('evals/scenarios/layout/layout.json', 'utf8'));
const css = await readFile('evals/scenarios/layout/layout.css', 'utf8');
const html = prepareProgram(input).render('Board', {}).html;
const document = stylesheet => `<!doctype html><html lang="en"><meta charset="utf-8"><title>Grid width contract</title><style>${stylesheet}</style><body>${html}</body></html>`;

test('the symbolic counterexample reproduces in Chromium and the corrected branch fits', async ({ page }) => {
  await mkdir(directory, { recursive: true });
  const broken = css.replace('608px', '600px');
  const report = analyzeLayout(input, { ...options, css: broken });
  expect(report.status).toBe('violated');
  const counterexample = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.body');
  expect(counterexample.range).toMatchObject({ min: 600, max: 608, minInclusive: true, maxInclusive: false });
  const samples = [];
  for (const [name, stylesheet] of [['broken', broken], ['fixed', css]]) {
    for (const width of [352, 599, 600, 604, 607, 608, 609, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(document(stylesheet));
      const measured = await page.locator('.body').evaluate(element => ({ width: element.getBoundingClientRect().width, overflow: element.scrollWidth > element.clientWidth }));
      const shouldFail = name === 'broken' && width >= 600 && width < 608;
      expect(measured.width < 320).toBe(shouldFail);
      expect(measured.overflow).toBe(shouldFail);
      samples.push({ name, viewport: width, ...measured });
    }
  }
  await writeFile(`${directory}/broken.json`, JSON.stringify(report, null, 2) + '\n');
  await writeFile(`${directory}/fixed.json`, JSON.stringify(analyzeLayout(input, { ...options, css }), null, 2) + '\n');
  await writeFile(`${directory}/browser.json`, JSON.stringify({ passed: true, samples }, null, 2) + '\n');
  await writeFile(`${directory}/fixed.html`, document(css));
  await writeFile(`${directory}/broken.html`, document(broken));
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(document(css));
    await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
  }
});

test('sparse auto-placement reserves definite rows before allocating automatic items', async ({ page }) => {
  const local = requireIR(compile(`component Placement() {
    <main class="board"><p class="auto">Auto</p><p class="fixed">Fixed</p><p class="last">Last</p></main>
  }`));
  const stylesheet = `* { box-sizing: border-box; margin: 0; }
    .board { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 10px; }
    .fixed { grid-column: 1; grid-row: 1; }
    .last { grid-column: 1; }`;
  const report = analyzeLayout(local, { css: stylesheet, viewport: { min: 400, max: 400 }, boxes: {
    '.auto': { minInlineSize: 290 }, '.fixed': { minInlineSize: 100 }, '.last': { minInlineSize: 100 },
  } });
  expect(report.status).toBe('verified');
  await page.setViewportSize({ width: 400, height: 900 });
  await page.setContent(`<style>${stylesheet}</style>${prepareProgram(local).render('Placement', {}).html}`);
  expect(await page.locator('.auto').evaluate(el => el.getBoundingClientRect().width)).toBe(290);
  expect(await page.locator('.last').evaluate(el => el.getBoundingClientRect().width)).toBe(100);
});

test('native computed overflow-axis coupling agrees with explicit policies', async ({ page }) => {
  const stylesheet = css + '.copy { overflow-x: visible; overflow-y: auto; }';
  const report = analyzeLayout(input, { ...options, css: stylesheet, boxes: {
    ...options.boxes, '.copy': { overflow: 'visible' },
  } });
  expect(report.diagnostics.some(d => d.code === 'E_LAYOUT_OVERFLOW_POLICY')).toBe(true);
  await page.setContent(document(stylesheet));
  expect(await page.locator('.copy').evaluate(el => getComputedStyle(el).overflowX)).toBe('auto');
});

test('fr totals below one match browser partial free-space allocation', async ({ page }) => {
  const stylesheet = css.replace('minmax(0, 1fr)', 'minmax(0, 0.5fr)');
  const report = analyzeLayout(input, { ...options, css: stylesheet, viewport: { min: 500, max: 500 } });
  const failed = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.body');
  expect(failed.witness.available).toBe(234);
  await page.setViewportSize({ width: 500, height: 900 });
  await page.setContent(document(stylesheet));
  expect(await page.locator('.body').evaluate(el => el.getBoundingClientRect().width)).toBe(234);
});
