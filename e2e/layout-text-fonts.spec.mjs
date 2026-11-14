// Supplementary browser eval for font-derived text bounds (not used to accept
// source). Chromium renders the same font file; every rendered width must lie
// in [shaped advance, derived bound], and the example card must overflow
// exactly where the static analysis says it may.
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loadTextMetrics} from '../packages/css-verifier/src/text-node.mjs';
import {scriptRuns, breakOpportunities} from '../packages/css-verifier/src/text.mjs';
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
// it except just below a modeled threshold (the bound allowance, per script run).
const ro = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
const wrapping = [
  [jp, '日本語のテキスト幅検査。折り返しを確認します。', 'normal'], [jp, '英語ABC 123 日本語のテキスト幅検査。', 'normal'], [jp, '確認ABC123テキスト', 'normal'],
  [ro, 'Hello world office AV To WMW 0123456789 Hello world', 'normal'], [ro, 'office WMW Hello', 'anywhere'], [ro, 'office WMW Hello', 'break-word'],
  [jp, '「日本語」の『テキスト』と（幅）を【検査】します。', 'normal'], [jp, 'ショッピングセンターへ会社員です！本日？', 'normal'], [jp, '日々の確認・検査、ゝゞ〜日…と〈本〉', 'normal'],
  [jp, 'ABC「テスト」123 東京都・新聞', 'normal'], [jp, '「確認」ABCDEF「検査」', 'anywhere'],
];
// Seeded random strings over every modeled class (no adjacent fullwidth punctuation: text-spacing-trim).
{
  const alphabet = [...'日本語東京都会社新聞あいうアイウッャョぁァー「」『』（）【】、。・！？々〜…'], latin = ['ABC', 'xyz', '123', ' '];
  const punctuation = new Set([...'「」『』（）【】、。・！？〜…']);
  let seed = 11;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < 60; i++) {
    let text = '';
    const length = 6 + Math.floor(next() * 24);
    while ([...text].length < length) {
      const piece = next() < 0.15 ? latin[Math.floor(next() * latin.length)] : alphabet[Math.floor(next() * alphabet.length)];
      if (punctuation.has(piece) && punctuation.has([...text].at(-1))) continue;
      text += piece;
    }
    wrapping.push([jp, text, next() < 0.2 ? 'anywhere' : 'normal']);
  }
  // ASCII words and punctuation (Roboto), and ASCII mixed into Japanese (Noto Sans JP).
  // Strings the model rejects (ICU's numeric rule, Latin-1 next to punctuation) are skipped.
  let state = 7;
  const random = () => { state = state + 0x6D2B79F5 | 0; let t = Math.imul(state ^ state >>> 15, 1 | state); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const asciiWords = ['Hello', 'world', 'office', 'AV', 'To', 'WMW', '0123', '1/2', 'a-b', 'x-1', 'well-known', '(test)', '[ok]', '{x}', 'end.', 'yes,', 'why?', 'no!', 'key:', 'a;b', '"quote"', "it's", '#tag', '@me', '$5', '50%', 'a+b', 'c\\d', 'x|y', '<a>', 'a=b', 'a&b', 'a*b', '~x', '_u_', '`c`', '^'];
  for (let i = 0; i < 40; i++) {
    const words = Array.from({length: 2 + Math.floor(random() * 8)}, () => asciiWords[Math.floor(random() * asciiWords.length)]);
    wrapping.push([ro, words.join(random() < 0.7 ? ' ' : ''), random() < 0.2 ? 'anywhere' : 'normal']);
    const japanese = [...'日本語のテキストを確認します'];
    wrapping.push([jp, words.map(w => w + japanese[Math.floor(random() * japanese.length)]).join(random() < 0.5 ? ' ' : ''), 'normal']);
  }
}
for (const lang of ['en', 'ja']) test(`modeled line counts match Chromium (lang=${lang})`, async ({page}) => {
  test.setTimeout(240_000);
  await page.setContent(`<!doctype html><html lang="${lang}"><style>${face}body{margin:0}</style><body></body></html>`);
  let rejected = 0;
  for (const [font, text, overflowWrap] of wrapping) {
    let lines;
    try { lines = metrics.breakLines({font, text, overflowWrap}); } catch (error) { if (error.code !== 'U_LAYOUT_TEXT_METRICS' || !/not modeled/.test(error.message)) throw error; rejected++; continue; }
    const set = new Set();
    for (const entry of lines.profile) for (const d of [-3, -2, -1, 0, 1]) set.add(entry.atLeastInlineSize + d / 64);
    // Random strings: every threshold neighbourhood, plus a coarser sweep.
    for (let w = 1; w <= Math.ceil(lines.width) + 4; w += text.length > 12 ? 3 : 1) set.add(w);
    const count = w => lines.profile.filter(entry => entry.atLeastInlineSize <= w).at(-1)?.lines;
    // Widths without a count (text-spacing-trim may change it) are Unknown in the analysis.
    const widths = [...set].filter(w => count(w) != null).sort((a, b) => a - b);
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
      // The bound exceeds the advance by under 2k/64 px for k script runs (plus one unit).
      const slack = (2 * scriptRuns(text) + 1) / 64;
      const modeled = count(w), band = lines.profile.some(entry => w < entry.atLeastInlineSize && w >= entry.atLeastInlineSize - slack);
      expect(rendered[i], `${text} (${overflowWrap}) at ${w}px: Chromium ≤ model`).toBeLessThanOrEqual(modeled);
      if (band) banded += rendered[i] < modeled; else expect(rendered[i], `${text} (${overflowWrap}) at ${w}px`).toBe(modeled);
    });
    expect(widths.length).toBeGreaterThan(5);
  }
  expect(rejected, 'most strings are modeled').toBeLessThan(wrapping.length / 4);
});

test('the wrapping example: heights match Chromium and the body overflows where reported', async ({page}) => {
  const read = name => readFileSync(new URL(`../examples/layout-contracts/${name}`, import.meta.url), 'utf8');
  const config = JSON.parse(read('text-wrap.json')), css = read('text-wrap.css'), ir = requireIR(compile(read('text-wrap.isle')));
  const {fonts, ...options} = config;
  const report = analyzeLayout(ir, metrics.resolveOptions({...options, css, cssFile: 'text-wrap.css'}));
  const finding = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.body');
  expect(finding.range.maxExact).toBe('14247/64');
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

// Break opportunities alone (no font, no widths): at width 0 every
// opportunity becomes a line break, so one render shows all of them. Every
// pair of class members and random strings over all modeled characters.
test('break opportunities match Chromium on every class pair and random strings', async ({page}) => {
  test.setTimeout(600_000);
  const members = [];
  for (let c = 0x21; c < 0x7f; c++) members.push(String.fromCharCode(c));
  members.push(...'「『（［【〈《〔」』）］】〉》〕、。，．・：；！？〜…‥々ヽヾゝゞ日あアッーぁゃァéÀ');
  const strings = [];
  for (const x of members) for (const y of members) strings.push(x + y, `${x} ${y}`);
  let state = 3;
  const random = () => { state = state + 0x6D2B79F5 | 0; let t = Math.imul(state ^ state >>> 15, 1 | state); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let i = 0; i < 1500; i++) strings.push(Array.from({length: 3 + Math.floor(random() * 10)}, () => random() < 0.1 ? ' ' : members[Math.floor(random() * members.length)]).join('').replace(/ +/g, ' ').trim());
  const modeled = strings.map(text => { try { return breakOpportunities(text); } catch (error) { if (error.code !== 'U_LAYOUT_TEXT_METRICS') throw error; return null; } });
  for (const lang of (process.env.BREAK_LANGS ?? 'en,ja,ko').split(',')) {
    await page.setContent(`<!doctype html><html lang="${lang}"><style>body{margin:0}div{font:16px/20px monospace;width:0}</style><body><div></div></body></html>`);
    const rendered = await page.evaluate(strings => {
      const d = document.querySelector('div');
      return strings.map(s => {
        d.textContent = s; const n = d.firstChild, chars = [...s], tops = []; let offset = 0;
        for (const c of chars) { const r = document.createRange(); r.setStart(n, offset); r.setEnd(n, offset + c.length); tops.push(r.getClientRects()[0]?.top ?? null); offset += c.length; }
        const breaks = []; let previous = null;
        chars.forEach((c, i) => { if (c === ' ') return; if (previous !== null && tops[i] !== tops[previous]) breaks.push(i); previous = i; });
        return breaks;
      });
    }, strings);
    let compared = 0;
    strings.forEach((text, i) => { if (!modeled[i]) return; compared++; expect(modeled[i], `${JSON.stringify(text)} (lang=${lang})`).toEqual(rendered[i]); });
    expect(compared).toBeGreaterThan(strings.length * 0.8);
  }
});

// A contract measured for the document language: every width has a count, and it matches Chromium there.
test('lang-specific line profiles match Chromium in that language', async ({page}) => {
  test.setTimeout(240_000);
  const texts = ["it's 日本語の\"テキスト\"を確認します", '"quote" and \'apostrophe\' 日本', "Hello world, it's \"office\" time"];
  for (const lang of ['ja', 'en']) {
    await page.setContent(`<!doctype html><html lang="${lang}"><style>${face}body{margin:0}</style><body></body></html>`);
    for (const text of texts) {
      const lines = metrics.breakLines({font: jp, text, lang});
      expect(lines.profile.every(entry => entry.lines !== null), `${text} (${lang}) has a count at every width`).toBe(true);
      const widths = [...new Set(lines.profile.flatMap(entry => [-2, -1, 0, 1].map(d => entry.atLeastInlineSize + d / 64)))].filter(w => w >= lines.profile[0].atLeastInlineSize && w > 0).sort((a, b) => a - b);
      const rendered = await page.evaluate(async ({text, widths}) => {
        await document.fonts.load('400 16px "Noto Sans JP"', text);
        const element = document.createElement('div');
        Object.assign(element.style, {fontFamily: '"Noto Sans JP"', fontSize: '16px', lineHeight: '24px', fontWeight: '400'});
        element.textContent = text; document.body.append(element);
        const out = widths.map(w => { element.style.width = `${w}px`; return element.getBoundingClientRect().height / 24; });
        element.remove(); return out;
      }, {text, widths});
      const slack = (2 * scriptRuns(text) + 1) / 64;
      widths.forEach((w, i) => {
        const modeled = lines.profile.filter(entry => entry.atLeastInlineSize <= w).at(-1).lines;
        expect(rendered[i], `${text} (${lang}) at ${w}px`).toBeLessThanOrEqual(modeled);
        if (!lines.profile.some(entry => w < entry.atLeastInlineSize && w >= entry.atLeastInlineSize - slack)) expect(rendered[i], `${text} (${lang}) at ${w}px`).toBe(modeled);
      });
    }
  }
});

// WCAG 1.4.12 text spacing: Chromium wraps with letter-spacing 0.12em and word-spacing 0.16em.
test('spaced line profiles (letter 0.12em, word 0.16em) match Chromium', async ({page}) => {
  test.setTimeout(240_000);
  await page.setContent(`<!doctype html><html lang="en"><style>${face}body{margin:0}</style><body></body></html>`);
  for (const [font, text] of [[ro, 'Hello world office AV To WMW 0123456789 Hello world'], [jp, '日本語のテキスト幅検査。折り返しを確認します。'], [jp, '英語ABC 123 日本語のテキスト幅検査。']]) {
    const spacing = {letter: 0.12 * font.size, word: 0.16 * font.size};
    const lines = metrics.breakLines({font, text, spacing});
    const widths = [...new Set(lines.profile.flatMap(e => [-3, -1, 0, 1].map(d => e.atLeastInlineSize + d / 64)))].filter(w => w > lines.profile[0].atLeastInlineSize).sort((a, b) => a - b);
    const rendered = await page.evaluate(async ({font, text, widths, spacing}) => {
      await document.fonts.load(`${font.weight} ${font.size}px "${font.family}"`, text);
      const element = document.createElement('div');
      Object.assign(element.style, {fontFamily: `"${font.family}"`, fontSize: `${font.size}px`, lineHeight: `${font.lineHeight}px`, fontWeight: String(font.weight), letterSpacing: `${spacing.letter}px`, wordSpacing: `${spacing.word}px`});
      element.textContent = text; document.body.append(element);
      const out = widths.map(w => { element.style.width = `${w}px`; return element.getBoundingClientRect().height / font.lineHeight; });
      element.remove(); return out;
    }, {font, text, widths, spacing});
    const slack = (2 * scriptRuns(text) + 1) / 64 + 2 / 64;
    widths.forEach((w, i) => {
      const modeled = lines.profile.filter(e => e.atLeastInlineSize <= w).at(-1).lines;
      if (modeled === null) return;
      expect(rendered[i], `${text} at ${w}px: Chromium ≤ model`).toBeLessThanOrEqual(modeled);
      if (!lines.profile.some(e => w < e.atLeastInlineSize && w >= e.atLeastInlineSize - slack)) expect(rendered[i], `${text} at ${w}px`).toBe(modeled);
    });
  }
});
