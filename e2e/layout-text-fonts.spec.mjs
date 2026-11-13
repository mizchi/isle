// Supplementary browser eval for font-derived text bounds (not used to accept
// source). Chromium renders the same font file; every rendered width must lie
// in [shaped advance, derived bound], and the example card must overflow
// exactly where the static analysis says it may.
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loadTextMetrics} from '../packages/css-verifier/src/text-node.mjs';
import {compile, requireIR} from '../lib/compiler.mjs';
import {prepareProgram} from '../lib/codegen.mjs';
import {analyzeLayout} from '../lib/layout.mjs';

const fixtures = new URL('../packages/css-verifier/text-metrics/fixtures/', import.meta.url);
const files = {'Noto Sans JP': 'japanese-variable.ttf', Roboto: 'roboto-variable.ttf'};
const face = Object.entries(files).map(([family, file]) => `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${readFileSync(new URL(file, fixtures)).toString('base64')})}`).join('');
const jp = {family: 'Noto Sans JP', size: 16, lineHeight: 24, weight: 400};
const characters = '日本語のテキスト幅検査折り返しを確認します英ABC123 ';

let metrics;
test.beforeAll(async () => {
  metrics = await loadTextMetrics({fonts: Object.fromEntries(Object.entries(files).map(([family, file]) => [family, {file: new URL(file, fixtures).pathname}]))});
});

async function widths(page, items) {
  return page.evaluate(async items => {
    await document.fonts.ready;
    return Promise.all(items.map(async ({font, text}) => {
      const element = document.createElement('div');
      Object.assign(element.style, {fontFamily: `"${font.family}"`, fontSize: `${font.size}px`, lineHeight: `${font.lineHeight}px`, fontWeight: String(font.weight), whiteSpace: 'nowrap', width: 'max-content'});
      element.textContent = text;
      document.body.append(element);
      await document.fonts.load(`${font.weight} ${font.size}px "${font.family}"`, text);
      const rect = element.getBoundingClientRect();
      element.remove();
      return {width: rect.width, height: rect.height};
    }));
  }, items);
}

test('rendered single-line widths lie between the shaped advance and the derived bound', async ({page}) => {
  await page.setContent(`<!doctype html><style>${face}body{margin:0}</style>`);
  const items = [
    {font: jp, text: '日本語のテキスト幅検査。'}, {font: jp, text: '折り返しを確認します。英語ABC 123'}, {font: {...jp, size: 13.5, lineHeight: 20}, text: '日本語'},
    {font: {...jp, weight: 700}, text: 'ABC テキスト'}, {font: {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, text: 'Hello world office AV To WMW'},
    {font: {family: 'Roboto', size: 23.3, lineHeight: 28, weight: 300}, text: 'AV To office'}, {font: jp, text: '  日本語の\n テキスト  '},
  ];
  const rendered = await widths(page, items);
  for (const [i, item] of items.entries()) {
    const measured = metrics.measureText(item);
    expect(rendered[i].width, `${item.text} >= advance`).toBeGreaterThanOrEqual(measured.width - 1e-9);
    expect(rendered[i].width, `${item.text} <= bound`).toBeLessThanOrEqual(measured.bound);
    expect(rendered[i].height, `${item.text} line box`).toBe(item.font.lineHeight);
  }
});

test('random strings from a character domain never exceed the length bound', async ({page}) => {
  await page.setContent(`<!doctype html><style>${face}body{margin:0}</style>`);
  const domain = metrics.domainBounds({font: jp, characters, maxLength: 24});
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const set = [...domain.characters], items = [];
  for (let i = 0; i < 200; i++) {
    const n = 1 + Math.floor(next() * 24);
    items.push({font: jp, text: Array.from({length: n}, () => set[Math.floor(next() * set.length)]).join(''), n});
  }
  // The widest character repeated is the tight case.
  for (const n of [1, 12, 24]) items.push({font: jp, text: domain.widest.repeat(n), n});
  const rendered = await widths(page, items);
  for (const [i, item] of items.entries()) expect(rendered[i].width, JSON.stringify(item.text)).toBeLessThanOrEqual(domain.bounds[item.n]);
  for (const [i, n] of [[200, 1], [201, 12], [202, 24]]) expect(domain.bounds[n] - rendered[i].width, `tightness at ${n}`).toBeLessThanOrEqual(2 / 64);
});

test('the example card overflows exactly where the analysis reports it may', async ({page}) => {
  const source = readFileSync(new URL('../examples/layout-contracts/text-fonts.isle', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../examples/layout-contracts/text-fonts.css', import.meta.url), 'utf8');
  const config = JSON.parse(readFileSync(new URL('../examples/layout-contracts/text-fonts.json', import.meta.url), 'utf8'));
  const ir = requireIR(compile(source));
  const {fonts, ...options} = config;
  const report = analyzeLayout(ir, metrics.resolveOptions({...options, css, cssFile: 'text-fonts.css'}));
  const finding = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.name');
  expect(finding.range.maxExact).toBe('17921/64');
  const name = metrics.domainBounds({font: jp, characters: config.boxes['.name'].text.characters, maxLength: 12}).widest;
  const html = prepareProgram(ir).render('ProfileCard', {name: name.repeat(12)}, {mode: 'ssr'}).html;
  // Overflow is decided by the exact text width (a Range), not by integral scrollWidth.
  for (const viewport of [262, 279, 280, 281, 400]) {
    await page.setViewportSize({width: viewport, height: 400});
    await page.setContent(`<!doctype html><style>${face}${css}html,body{margin:0}</style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    const {text, available} = await page.locator('.name').evaluate(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      return {text: range.getBoundingClientRect().width, available: node.getBoundingClientRect().width};
    });
    const mayOverflow = viewport < 17921 / 64;
    expect(available, `content width at ${viewport}`).toBe(viewport - 88);
    if (!mayOverflow) expect(text, `fits at ${viewport}`).toBeLessThanOrEqual(available);
    // Below the bound the text overflows, except within the 1/64 px allowance.
    else expect(text, `overflows at ${viewport}`).toBeGreaterThan(available - 2 / 64);
  }
});
