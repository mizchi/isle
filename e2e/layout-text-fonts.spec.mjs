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

// Line breaking (white-space: normal). Chromium wraps the same text at many
// widths: the modeled line count is never below the rendered one and equals
// it except within 3/64 px below a modeled threshold (the bound allowance).
const ro = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
const wrapping = [
  [jp, '日本語のテキスト幅検査。折り返しを確認します。', 'normal'], [jp, '英語ABC 123 日本語のテキスト幅検査。', 'normal'], [jp, '確認ABC123テキスト', 'normal'],
  [ro, 'Hello world office AV To WMW 0123456789 Hello world', 'normal'], [ro, 'office WMW Hello', 'anywhere'], [ro, 'office WMW Hello', 'break-word'],
];
for (const lang of ['en', 'ja']) test(`modeled line counts match Chromium (lang=${lang})`, async ({page}) => {
  await page.setContent(`<!doctype html><html lang="${lang}"><style>${face}body{margin:0}</style><body></body></html>`);
  for (const [font, text, overflowWrap] of wrapping) {
    const lines = metrics.breakLines({font, text, overflowWrap});
    const set = new Set();
    for (const entry of lines.profile) for (const d of [-3, -2, -1, 0, 1]) set.add(entry.atLeastInlineSize + d / 64);
    for (let w = 1; w <= Math.ceil(lines.width) + 4; w++) set.add(w);
    const count = w => lines.profile.filter(entry => entry.atLeastInlineSize <= w).at(-1)?.lines;
    const widths = [...set].filter(w => count(w) !== undefined).sort((a, b) => a - b);
    const rendered = await page.evaluate(async ({font, text, overflowWrap, widths}) => {
      await document.fonts.load(`${font.weight} ${font.size}px "${font.family}"`, text);
      const element = document.createElement('div');
      Object.assign(element.style, {fontFamily: `"${font.family}"`, fontSize: `${font.size}px`, lineHeight: `${font.lineHeight}px`, fontWeight: String(font.weight), overflowWrap});
      element.textContent = text; document.body.append(element);
      const out = widths.map(w => { element.style.width = `${w}px`; return element.getBoundingClientRect().height / font.lineHeight; });
      element.remove(); return out;
    }, {font, text, overflowWrap, widths});
    let banded = 0;
    widths.forEach((w, i) => {
      const modeled = count(w), band = lines.profile.some(entry => w < entry.atLeastInlineSize && w >= entry.atLeastInlineSize - 3 / 64);
      expect(rendered[i], `${text} (${overflowWrap}) at ${w}px: Chromium ≤ model`).toBeLessThanOrEqual(modeled);
      if (band) banded += rendered[i] < modeled; else expect(rendered[i], `${text} (${overflowWrap}) at ${w}px`).toBe(modeled);
    });
    expect(widths.length).toBeGreaterThan(100);
  }
});

test('the wrapping example: heights match Chromium and the body overflows where reported', async ({page}) => {
  const read = name => readFileSync(new URL(`../examples/layout-contracts/${name}`, import.meta.url), 'utf8');
  const config = JSON.parse(read('text-wrap.json')), css = read('text-wrap.css'), ir = requireIR(compile(read('text-wrap.isle')));
  const {fonts, ...options} = config;
  const report = analyzeLayout(ir, metrics.resolveOptions({...options, css, cssFile: 'text-wrap.css'}));
  const finding = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.body');
  expect(finding.range.maxExact).toBe('14235/64');
  const limit = 14235 / 64;
  const html = prepareProgram(ir).render('NoticeCard', {}, {mode: 'ssr'}).html;
  const value = text => { const [n, d = '1'] = text.split('/'); return Number(n) / Number(d); };
  for (const viewport of [160, 180, 207, 208, 222, 223, 300, 400, 800]) {
    await page.setViewportSize({width: viewport, height: 400});
    await page.setContent(`<!doctype html><html lang="ja"><style>${face}${css}html,body{margin:0}</style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    const measured = await page.evaluate(() => Object.fromEntries(['.title', '.body'].map(selector => {
      const node = document.querySelector(selector), range = document.createRange(); range.selectNodeContents(node);
      return [selector, {height: node.getBoundingClientRect().height, text: range.getBoundingClientRect().height}];
    })));
    // The auto row is as tall as the modeled lines of the title.
    const row = report.sizes.find(r => r.box === '.title' && r.rect && viewport >= r.range.min && viewport <= r.range.max);
    expect(measured['.title'].height, `title at ${viewport}`).toBe(value(row.rect.blockSize.constant) + value(row.rect.blockSize.coefficient) * viewport);
    expect(measured['.body'].text > 48, `body overflows at ${viewport}`).toBe(viewport < limit);
  }
});
