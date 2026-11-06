import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { analyzeLayout } from '../lib/layout.mjs';

const output = 'evals/results/layout-axes';
const ir = requireIR(compile(await readFile('evals/scenarios/layout-axes/fixture.isle', 'utf8')));
const options = JSON.parse(await readFile('evals/scenarios/layout-axes/layout.json', 'utf8'));
const css = await readFile('evals/scenarios/layout-axes/layout.css', 'utf8');
const html = prepareProgram(ir).render('QueryPanel', {}).html;
const document = style => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Container and block contracts</title><style>html,body{height:100%}${style}</style></head><body>${html}</body></html>`;
const rational = text => { const [n, d = 1] = text.split('/').map(Number); return n / d; };
const predicted = (report, axis, width, height) => report.diagnostics.some(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.body' && d.axis === axis && d.region.constraints.every(c => {
  const value = rational(c.coefficient) * width + rational(c.heightCoefficient ?? '0') * height + rational(c.constant);
  return c.strict ? value > 1e-8 : value >= -1e-8;
}));

test('container width and independent block-height counterexamples reproduce across both axes', async ({ page }) => {
  await mkdir(output, { recursive: true });
  const brokenCSS = css.replace('616px', '600px');
  const brokenOptions = { ...options, viewport: { ...options.viewport, height: { min: 200, max: 600 } } };
  const broken = analyzeLayout(ir, { ...brokenOptions, css: brokenCSS });
  const fixed = analyzeLayout(ir, { ...options, css });
  expect(broken.status).toBe('violated'); expect(fixed.status).toBe('verified');
  const samples = [];
  for (const [name, style, report] of [['broken', brokenCSS, broken], ['fixed', css, fixed]]) {
    for (const width of [432, 631, 632, 640, 647, 648, 1000]) for (const height of [232, 319, 320, 450]) {
      if (name === 'fixed' && height < 320) continue;
      await page.setViewportSize({ width, height }); await page.setContent(document(style));
      const body = await page.locator('.body').evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, overflowX: el.scrollWidth > el.clientWidth, overflowY: el.scrollHeight > el.clientHeight }));
      expect(body.width < 400).toBe(predicted(report, 'inline', width, height));
      expect(body.height < 200).toBe(predicted(report, 'block', width, height));
      expect(body.overflowX).toBe(body.width < 400); expect(body.overflowY).toBe(body.height < 200);
      samples.push({ name, viewport: { width, height }, ...body });
    }
  }
  for (const [name, report] of [['fixed', fixed], ['broken', broken]]) await writeFile(`${output}/${name}.json`, JSON.stringify(report, null, 2) + '\n');
  await writeFile(`${output}/browser.json`, JSON.stringify({ passed: true, samples }, null, 2) + '\n');
  await writeFile(`${output}/fixed.html`, document(css));
  for (const [width, height] of [[480, 400], [1000, 500]]) {
    await page.setViewportSize({ width, height }); await page.setContent(document(css));
    await page.screenshot({ path: `${output}/${width}x${height}.png`, fullPage: true });
  }
});

test('height queries select a size ancestor through an inline-size container', async ({ page }) => {
  const style = css + '.panel { container: Inner / inline-size; } @container (height >= 300px) { .copy { block-size: 500px; } }';
  const report = analyzeLayout(ir, { ...options, css: style });
  expect(report.queries.some(query => query.box === '.copy' && query.target === '.shell')).toBe(true);
  for (const height of [330, 332, 340]) {
    await page.setViewportSize({ width: 500, height }); await page.setContent(document(style));
    expect(await page.locator('.copy').evaluate(el => el.getBoundingClientRect().height)).toBe(height >= 332 ? 500 : 200);
  }
});

test('size containment, auto row stretching and intrinsic fr heights match native Grid', async ({ page }) => {
  const input = requireIR(compile('component Auto() { <main class="shell"><p class="a">A</p><p class="b">B</p></main> }'));
  const markup = prepareProgram(input).render('Auto', {}).html;
  const base = '* { box-sizing:border-box; margin:0; } .shell { display:grid;grid-template-columns:minmax(0,1fr);padding:16px;row-gap:16px; } .a {block-size:40px;} .b {block-size:60px;}';
  const samples = [
    { extra: '', height: 148 },
    { extra: '.shell {container-type:size;}', height: 32 },
    { extra: '.shell {grid-template-rows:minmax(0,1fr) minmax(0,2fr);}', height: 168 },
    { extra: '.shell {block-size:300px;grid-template-rows:auto minmax(0,0.5fr);}', height: 300 },
  ];
  for (const sample of samples) {
    const style = base + sample.extra;
    const report = analyzeLayout(input, { css: style, block: true, viewport: { min: 500, max: 500, height: { min: 500, max: 500 } }, boxes: {
      '.a': { minInlineSize: 100, minBlockSize: 40 }, '.b': { minInlineSize: 100, minBlockSize: 60 },
    } });
    expect(report.status).not.toBe('unknown');
    expect(report.sizes.find(size => size.box === '.shell').blockSize.constant).toBe(String(sample.height));
    await page.setViewportSize({ width: 500, height: 500 }); await page.setContent(`<style>${style}</style>${markup}`);
    expect(await page.locator('.shell').evaluate(el => el.getBoundingClientRect().height)).toBe(sample.height);
    for (const selector of ['.a', '.b']) {
      const actual = await page.locator(selector).evaluate(el => el.getBoundingClientRect().height);
      expect(Number(report.sizes.find(size => size.box === selector).blockSize.constant)).toBe(actual);
    }
  }
});
