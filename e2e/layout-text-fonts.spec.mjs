// Supplementary browser eval for font-derived text bounds (not used to accept
// source). Chromium renders the same font file; every rendered width must lie
// in [shaped advance, derived bound], and the example card must overflow
// exactly where the static analysis says it may.
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loadTextMetrics} from '../packages/css-verifier/src/text-node.mjs';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
import {scriptRuns, breakOpportunities} from '../packages/css-verifier/src/text.mjs';
import {compile, requireIR} from '../lib/compiler.mjs';
import {prepareProgram} from '../lib/codegen.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {applyBrowserBaseline} from './support/browser-baseline.mjs';
// Outside Chromium: skip tests whose oracle only Chromium has, expect failures where the browser's CSS baseline differs.
test.beforeEach(({}, testInfo) => applyBrowserBaseline(testInfo));
// The Chrome DevTools Protocol exists in Chromium only: elsewhere the test is skipped where it needs it.
const chromiumOnly = page => { test.skip(test.info().project.name !== 'chromium', 'uses the Chrome DevTools Protocol (Chromium only)'); return page.context().newCDPSession(page); };


const fixtures = new URL('../packages/css-verifier/text-metrics/fixtures/', import.meta.url);
const files = {'Noto Sans JP': 'japanese-variable.ttf', Roboto: 'roboto-variable.ttf', 'Noto Sans Hebrew': 'hebrew-variable.ttf'};
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
  members.push(...'「『（［【〈《〔」』）］】〉》〕、。，．・：；！？〜…‥々ヽヾゝゞ日あアッーぁゃァéÀ·');
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

// Inline bounds: a link inside one line of measured text lies inside the outer bounds and covers the inner ones.
// Horizontal padding, border and margin on inline boxes (checklist D3): measured with the text contract (inline
// {text, edges}), they widen the line and move what follows; each box's border box lies inside its outer bound.
test('inline boxes with horizontal edges: the line width and every box\'s bounds', async ({page}) => {
  // Firefox positions these boxes on its own 1/60px grid (3/1000px past the 1/64px bounds measured here): other
  // browsers' rounding is outside the text metrics (ADR-0010). Chromium and WebKit hold.
  test.skip(test.info().project.name === 'firefox', 'Firefox rounds inline edges to 1/60px (ADR-0010)');
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content = 'Read the guide and the notes first.';
  const html = '<div class="page"><p class="p">Read the <a class="u" href="#x">guide</a> and the <a class="v" href="#y">notes</a> first.</p><div class="after"></div></div>';
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  for (const [extra, u, v] of [['.u{padding:0 6px}', [0, 6, 6, 0], [0, 0, 0, 0]], ['.u{padding:0 4px;margin:0 3px;border-style:solid;border-width:0 1px 0 2px}.v{padding-left:10px}', [3, 6, 5, 3], [0, 10, 0, 0]], ['.v{margin-right:12px;padding:0 2px}', [0, 0, 0, 0], [0, 2, 2, 12]]]) {
    const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': {text: 'guide', edges: u}, '.v': {text: 'notes', edges: v}}}}});
    const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p{font-family:"Roboto";font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}a{color:#000}${extra}`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 400, max: 900, height: {min: 300, max: 300}}, boxes});
    expect(report.status === 'unknown', `${extra}: ${JSON.stringify(report.diagnostics.map(d => d.message))}`).toBe(false);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const browser = await page.evaluate(() => ({p: (() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.p')); const rs = [...r.getClientRects()]; return Math.max(...rs.map(x => x.right)) - Math.min(...rs.map(x => x.left)); })(), u: document.querySelector('.u').getBoundingClientRect().toJSON(), v: document.querySelector('.v').getBoundingClientRect().toJSON()}));
    // The line is as wide as measured: the contract's width bounds the browser's max-content width.
    const width = boxes['.p'].minInlineSize, exact = boxes['.p'].textMetrics.width;
    expect(browser.p, `${extra} width`).toBeLessThanOrEqual(width + 1e-9); // (and the edges count: the browser's width is within a quarter pixel of the shaped width plus the edges)
    expect(browser.p, `${extra} width`).toBeGreaterThanOrEqual(exact - 0.25);
    for (const key of ['u', 'v']) {
      const bound = report.inlineBounds.find(b => b.box === `.${key}`) ?? report.inlineBounds[key === 'u' ? 0 : 1];
      const at = a => value(a.coefficient) * 400 + value(a.heightCoefficient ?? '0') * 300 + value(a.constant), O = {x: at(bound.outer.inlineStart), w: at(bound.outer.inlineSize)}, I = bound.inner && {x: at(bound.inner.inlineStart), w: at(bound.inner.inlineSize)};
      const r = browser[key], tag = `${extra} .${key}`;
      expect(r.x, `${tag} left`).toBeGreaterThanOrEqual(O.x - 1e-9); expect(r.x + r.width, `${tag} right`).toBeLessThanOrEqual(O.x + O.w + 1e-9);
      expect(I, tag).toBeTruthy(); expect(r.x, `${tag} inner left`).toBeLessThanOrEqual(I.x + 1e-9); expect(r.x + r.width, `${tag} inner right`).toBeGreaterThanOrEqual(I.x + I.w - 1e-9);
    }
  }
});

// An inline box in another weight of the same font (checklist D3): measured as its own run (inline {text, weight}),
// the line is as wide as the sum of the runs and every box lies inside its bounds.
test('inline boxes in another weight: the line width and every box\'s bounds', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  for (const [font, content, u, v, extra] of [
    [{family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, 'Read the guide and the notes first.', 'guide', 'notes', '.u{font-weight:700}'],
    [{family: 'Roboto', size: 20, lineHeight: 28, weight: 300}, 'Bold WAVE then light AVATAR text', 'WAVE', 'AVATAR', '.u{font-weight:900}.v{font-weight:500}'],
    [jp, '日本語のテキスト幅を確認します', 'テキスト', '確認', '.u{font-weight:700}'],
  ]) {
    // Japanese shaping outside Chromium is outside the text metrics (ADR-0010: Firefox and WebKit set this line 0.3px wider).
    if (font === jp && test.info().project.name !== 'chromium') continue;
    const weightOf = sel => { const m = new RegExp(`\\.${sel}\\{font-weight:(\\d+)\\}`).exec(extra); return m ? Number(m[1]) : undefined; };
    const entry = (sel, text) => weightOf(sel) ? {text, weight: weightOf(sel)} : text;
    const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': entry('u', u), '.v': entry('v', v)}}}});
    const at1 = content.indexOf(u), at2 = content.indexOf(v);
    const html = `<div class="page"><p class="p">${content.slice(0, at1)}<a class="u" href="#x">${u}</a>${content.slice(at1 + u.length, at2)}<a class="v" href="#y">${v}</a>${content.slice(at2 + v.length)}</p></div>`;
    const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p{font-family:"${font.family}";font-size:${font.size}px;line-height:${font.lineHeight}px;font-weight:${font.weight};white-space:nowrap}a{color:#000}${extra}`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 400, max: 900, height: {min: 300, max: 300}}, boxes});
    expect(report.status === 'unknown', `${extra}: ${JSON.stringify(report.diagnostics.map(d => d.message))}`).toBe(false);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const browser = await page.evaluate(() => ({p: (() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.p')); const rs = [...r.getClientRects()]; return Math.max(...rs.map(x => x.right)) - Math.min(...rs.map(x => x.left)); })(), u: document.querySelector('.u').getBoundingClientRect().toJSON(), v: document.querySelector('.v').getBoundingClientRect().toJSON()}));
    const tag0 = `${font.family} ${extra}`;
    expect(browser.p, `${tag0} width`).toBeLessThanOrEqual(boxes['.p'].minInlineSize + 1e-9);
    expect(browser.p, `${tag0} width`).toBeGreaterThanOrEqual(boxes['.p'].textMetrics.width - 0.25);
    for (const key of ['u', 'v']) {
      const bound = report.inlineBounds.find(b => b.box === `.${key}`);
      const at = a => value(a.coefficient) * 400 + value(a.heightCoefficient ?? '0') * 300 + value(a.constant), O = {x: at(bound.outer.inlineStart), w: at(bound.outer.inlineSize)}, I = bound.inner && {x: at(bound.inner.inlineStart), w: at(bound.inner.inlineSize)};
      const r = browser[key], tag = `${tag0} .${key}`;
      expect(r.x, `${tag} left`).toBeGreaterThanOrEqual(O.x - 1e-9); expect(r.x + r.width, `${tag} right`).toBeLessThanOrEqual(O.x + O.w + 1e-9);
      expect(I, tag).toBeTruthy(); expect(r.x, `${tag} inner left`).toBeLessThanOrEqual(I.x + 1e-9); expect(r.x + r.width, `${tag} inner right`).toBeGreaterThanOrEqual(I.x + I.w - 1e-9);
    }
  }
});

// An icon in the line, measured with the text contract (inline {atomic: [width, height], at}), no taller than the line's
// ascent (checklist D3): the line keeps its height, is as wide as the text and the icon, and the icon and the link after
// it lie inside their bounds.
test('an icon measured in the line: the line and every box', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content = 'Read the guide first.';
  for (const [w, h, at] of [[16, 16, 9], [24, 12, 0], [10, 17, 21]]) {
    const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.i': {atomic: [w, h], at}, '.u': 'guide'}}}});
    const before = [...content].slice(0, at).join(''), rest = [...content].slice(at).join('');
    const mark = s => s.replace('guide', '<a class="u" href="#x">guide</a>');
    const html = `<div class="page"><p class="p">${mark(before)}<img class="i" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" width="${w}" height="${h}">${mark(rest)}</p></div>`;
    const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p{font-family:"Roboto";font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}a{color:#000}`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 400, max: 900, height: {min: 300, max: 300}}, boxes});
    const tag0 = `${w}x${h} at ${at}`;
    expect(report.status === 'unknown', `${tag0}: ${JSON.stringify(report.diagnostics.map(d => d.message))}`).toBe(false);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const browser = await page.evaluate(() => ({height: document.querySelector('.p').getBoundingClientRect().height, width: (() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.p')); const rs = [...r.getClientRects()]; return Math.max(...rs.map(x => x.right)) - Math.min(...rs.map(x => x.left)); })(), i: document.querySelector('.i').getBoundingClientRect().toJSON(), u: document.querySelector('.u').getBoundingClientRect().toJSON()}));
    expect(browser.height, tag0).toBe(24);
    expect(browser.width, `${tag0} width`).toBeLessThanOrEqual(boxes['.p'].minInlineSize + 1e-9);
    expect(browser.width, `${tag0} width`).toBeGreaterThanOrEqual(boxes['.p'].textMetrics.width - 0.25);
    for (const key of ['i', 'u']) {
      const bound = report.inlineBounds.find(b => b.box === `.${key}`);
      const atv = a => value(a.coefficient) * 400 + value(a.heightCoefficient ?? '0') * 300 + value(a.constant);
      const O = {x: atv(bound.outer.inlineStart), y: atv(bound.outer.blockStart), w: atv(bound.outer.inlineSize), h: atv(bound.outer.blockSize)}, r = browser[key], tag = `${tag0} .${key}`;
      expect(r.x, `${tag} left`).toBeGreaterThanOrEqual(O.x - 1e-9); expect(r.right, `${tag} right`).toBeLessThanOrEqual(O.x + O.w + 1e-9);
      expect(r.y, `${tag} top`).toBeGreaterThanOrEqual(O.y - 1e-9); expect(r.bottom, `${tag} bottom`).toBeLessThanOrEqual(O.y + O.h + 1e-9);
    }
  }
});

// An image inside measured text is an atomic inline box: it widens the line and, taller than the text's ascent, makes
// it taller (checklist D3). The analysis is Unknown there; the browser shows why.
test('an image inside measured text changes the line', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content = 'Read the guide first.';
  const boxes = metrics.resolveBoxes({'.p': {text: {content, font}}});
  const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p{font-family:"Roboto";font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}`;
  for (const size of [12, 40]) {
    const html = `<div class="page"><p class="p">Read the guide first.<img class="i" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" width="${size}" height="${size}"></p></div>`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 400, max: 900, height: {min: 300, max: 300}}, boxes});
    expect(report.status, `${size}px`).toBe('unknown');
    expect(report.diagnostics.some(d => /atomic inline box/.test(d.message))).toBe(true);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const line = await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.p')); const rs = [...r.getClientRects()]; return {height: document.querySelector('.p').getBoundingClientRect().height, width: Math.max(...rs.map(x => x.right)) - Math.min(...rs.map(x => x.left))}; });
    // Wider than the text alone in every case; taller where the image is taller than the ascent.
    expect(line.width, `${size}px`).toBeGreaterThan(boxes['.p'].minInlineSize + size - 1);
    if (size === 40) expect(line.height).toBeGreaterThan(24);
  }
});

// vertical-align off the baseline raises or lowers the inline box and makes the line taller, by amounts that differ
// between browsers: Unknown; top and bottom with the text's own font change nothing.
test('vertical-align on an inline box inside measured text', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content = 'Read the guide first.';
  const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': 'guide'}}}});
  const html = '<div class="page"><p class="p">Read the <a class="u" href="#x">guide</a> first.</p></div>';
  for (const v of ['baseline', 'top', 'bottom', 'middle', 'super', 'sub', 'text-top', '5px', '-3px']) {
    const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p{font-family:"Roboto";font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}.u{color:#000;vertical-align:${v}}`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 400, max: 900, height: {min: 300, max: 300}}, boxes});
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const height = await page.evaluate(() => document.querySelector('.p').getBoundingClientRect().height);
    // Known exactly where the line keeps its 24px; Unknown wherever it does not.
    expect(report.status === 'unknown', `${v}: line ${height}px`).toBe(height !== 24);
  }
});

test('inline element bounds contain the rendered inline box', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const roboto = {family: 'Roboto', size: 20, lineHeight: 20, weight: 400};
  const cases = [
    {font: jp, content: '日本語のテキスト幅を確認します', piece: 'テキスト'},
    {font: jp, content: 'ABC 123 日本語', piece: '123'},
    {font: {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content: 'Read the guide first.', piece: 'guide'},
    {font: roboto, content: 'AVATAR Wave today', piece: 'Wave'},
    {font: roboto, content: 'Tiny link at the start', piece: 'Tiny'},
  ];
  // text-align moves the line (checklist D3): centred and at the end too.
  // Vertical padding on the inline box extends its box above and below the line (checklist D3).
  for (const pad of ['', '.u{padding:4px 0}']) for (const align of ['start', 'center', 'right']) for (const {font, content, piece} of cases) {
    const at = content.indexOf(piece);
    const html = `<div class="page"><p class="p">${content.slice(0, at)}<a class="u" href="#x">${piece}</a>${content.slice(at + piece.length)}</p></div>`;
    const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:${font.lineHeight + 8}px;padding:4px 7px;background:#fff;color:#000}.p{font-family:"${font.family}";font-size:${font.size}px;line-height:${font.lineHeight}px;font-weight:${font.weight};white-space:nowrap}.u{color:#000}`;
    const alignedCSS = css + `.p{text-align:${align}}` + pad;
    const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': piece}}}});
    const report = analyzeHTML(html, {name: 'Page', css: alignedCSS, viewport: {min: 400, max: 900, height: {min: 300, max: 300}}, boxes});
    const [bound] = report.inlineBounds ?? [];
    expect(bound, JSON.stringify(report.diagnostics)).toBeTruthy();
    const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
    const at400 = a => value(a.coefficient) * 400 + value(a.heightCoefficient ?? '0') * 300 + value(a.constant);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html><head><style>${face}${alignedCSS}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const rects = await page.evaluate(() => [...document.querySelector('.u').getClientRects()].map(r => ({x: r.x, y: r.y, w: r.width, h: r.height})));
    expect(rects.length).toBe(1);
    const [r] = rects, o = bound.outer, i = bound.inner;
    const box = b => ({x: at400(b.inlineStart), y: at400(b.blockStart), w: at400(b.inlineSize), h: at400(b.blockSize)});
    const O = box(o), I = i && box(i), tag = `${pad} ${align} ${font.family} ${JSON.stringify(content)}`;
    expect(r.x, `${tag} left`).toBeGreaterThanOrEqual(O.x - 1e-9); expect(r.x + r.w, `${tag} right`).toBeLessThanOrEqual(O.x + O.w + 1e-9);
    expect(r.y, `${tag} top`).toBeGreaterThanOrEqual(O.y - 1e-9); expect(r.y + r.h, `${tag} bottom`).toBeLessThanOrEqual(O.y + O.h + 1e-9);
    expect(I, tag).toBeTruthy();
    expect(r.x, `${tag} inner left`).toBeLessThanOrEqual(I.x + 1e-9); expect(r.x + r.w, `${tag} inner right`).toBeGreaterThanOrEqual(I.x + I.w - 1e-9);
    expect(r.y, `${tag} inner top`).toBeLessThanOrEqual(I.y + 1e-9); expect(r.y + r.h, `${tag} inner bottom`).toBeGreaterThanOrEqual(I.y + I.h - 1e-9);
  }
});

// Occlusion and obscured focus for an inline link, from its measured bounds, against Chromium's hit testing.
test('inline link occlusion and obscured focus agree with Chromium', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
  const content = 'Read the guide first.';
  const html = '<div class="page"><p class="p">Read the <a class="u" href="#x">guide</a> first.</p><div class="cover"></div></div>';
  const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': 'guide'}}}});
  // Covers (left, top, width, height) relative to the page: over the whole line, over part of the link, beside it.
  for (const [name, cover, occluded, obscured] of [['whole line', [0, 0, 300, 24], true, true], ['part of the link', [80, 0, 10, 24], true, false], ['beside the text', [200, 0, 40, 24], false, false]]) {
    const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:24px;position:relative;background:#fff;color:#000}.p{font-family:"Roboto";font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}.u{color:#000}.cover{position:absolute;left:${cover[0]}px;top:${cover[1]}px;inline-size:${cover[2]}px;block-size:${cover[3]}px;background:#eee}`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 400, max: 900, height: {min: 300, max: 300}}, boxes, accessibility: true});
    const codes = report.diagnostics.filter(d => d.path === 'Page/0/0').map(d => d.code);
    expect(codes.includes('U_A11Y_OCCLUDED'), `${name}: ${JSON.stringify(codes)}`).toBe(false);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const browser = await page.evaluate(() => {
      const link = document.querySelector('.u'), r = link.getBoundingClientRect(), c = document.querySelector('.cover').getBoundingClientRect();
      let hit = false; for (let x = r.left + 0.5; x < r.right; x += 1) for (let y = r.top + 0.5; y < r.bottom; y += 1) if (document.elementFromPoint(x, y)?.classList.contains('cover')) hit = true;
      return {hit, contained: c.left <= r.left && c.top <= r.top && c.right >= r.right && c.bottom >= r.bottom};
    });
    expect(browser, name).toEqual({hit: occluded, contained: obscured});
    expect(codes.includes('E_A11Y_OCCLUDED'), `${name} occluded`).toBe(occluded);
    expect(codes.includes('E_A11Y_FOCUS_OBSCURED'), `${name} obscured`).toBe(obscured);
  }
});

// Wrapping text: per width, the link's line and bounds from the line layout, or split across lines.
test('inline bounds in wrapping text follow the line layout', async ({page}) => {
  test.setTimeout(240_000);
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  for (const align of ['start', 'center', 'right']) for (const {font, content, piece, anywhere} of [
    {font: {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content: 'Read the full installation guide before you start the upgrade of the cluster.', piece: 'installation guide'},
    {font: jp, content: '日本語のテキストを折り返して幅を確認します英ABC 123', piece: 'ABC'},
    // Bracket trim (text-spacing-trim) gives two line layouts; bounds hold where both keep the link on one line.
    {font: jp, content: '日本語（テキスト）を確認します英ABC', piece: '確認'},
    {font: {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content: 'See supercalifragilisticexpialidocious and antidisestablishmentarianism today.', piece: 'antidisestablishmentarianism', anywhere: true},
  ]) {
    const at = content.indexOf(piece);
    const html = `<div class="page"><p class="p">${content.slice(0, at)}<a class="u" href="#x">${piece}</a>${content.slice(at + piece.length)}</p></div>`;
    const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);padding:0 10px;background:#fff;color:#000}.p{font-family:"${font.family}";font-size:${font.size}px;line-height:${font.lineHeight}px;font-weight:${font.weight}${anywhere ? ';overflow-wrap:anywhere' : ''}}.u{color:#000}`;
    const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': piece}}, wrap: anywhere ? 'anywhere' : 'normal'}});
    const alignedCSS = css + `.p{text-align:${align}}`;
    const report = analyzeHTML(html, {name: 'Page', css: alignedCSS, viewport: {min: 120, max: 900, height: {min: 600, max: 600}}, boxes});
    expect(report.inlineBounds?.length, JSON.stringify(report.diagnostics)).toBeGreaterThan(0);
    let split = 0, placed = 0;
    for (let width = 120; width <= 900; width += 13) {
      const at = a => value(a.coefficient) * width + value(a.heightCoefficient ?? '0') * 600 + value(a.constant);
      const holds = row => row.regionConstraints.every(c => { const slack = value(c.coefficient) * width + value(c.heightCoefficient ?? '0') * 600 + value(c.constant); return c.strict ? slack > 1e-9 : slack >= -1e-9; });
      const bound = report.inlineBounds.find(holds);
      await page.setViewportSize({width, height: 600});
      await page.setContent(`<!doctype html><html><head><style>${face}${alignedCSS}</style></head><body>${html}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const rects = await page.evaluate(() => [...document.querySelector('.u').getClientRects()].map(r => ({x: r.x, y: r.y, w: r.width, h: r.height})));
      const tag = `${align} ${font.family} at ${width}`;
      // Aligned text also has no bounds just below a line break's width, where the browser may already break differently.
      if (!bound) { if (align === 'start') expect(rects.length, `${tag}: split`).toBeGreaterThan(1); if (rects.length > 1) split++; continue; }
      expect(rects.length, tag).toBe(1); placed++;
      const [r] = rects, box = b => ({x: at(b.inlineStart), y: at(b.blockStart), w: at(b.inlineSize), h: at(b.blockSize)}), O = box(bound.outer);
      expect(r.x, `${tag} left`).toBeGreaterThanOrEqual(O.x - 1e-9); expect(r.x + r.w, `${tag} right`).toBeLessThanOrEqual(O.x + O.w + 1e-9);
      expect(r.y, `${tag} top`).toBeGreaterThanOrEqual(O.y - 1e-9); expect(r.y + r.h, `${tag} bottom`).toBeLessThanOrEqual(O.y + O.h + 1e-9);
      if (bound.inner) {
        const I = box(bound.inner);
        expect(r.x, `${tag} inner left`).toBeLessThanOrEqual(I.x + 1e-9); expect(r.x + r.w, `${tag} inner right`).toBeGreaterThanOrEqual(I.x + I.w - 1e-9);
        expect(r.y, `${tag} inner top`).toBeLessThanOrEqual(I.y + 1e-9); expect(r.y + r.h, `${tag} inner bottom`).toBeGreaterThanOrEqual(I.y + I.h - 1e-9);
      }
    }
    expect(placed, `${font.family}: some widths place the link on one line`).toBeGreaterThan(0);
    if (anywhere) expect(split, 'anywhere: narrow widths split the long word').toBeGreaterThan(0);
  }
});

// text-align: justify (checklist D3): the last line is start-aligned, so a link on it has bounds; the earlier lines are
// stretched and have none. Swept like the wrapping test, in every browser.
test('inline bounds on the last line of justified text', async ({page}) => {
  test.setTimeout(240_000);
  // Line breaking of measured text is calibrated to Chromium (ADR-0010: other browsers' rounding is out of scope; Firefox
  // breaks this text elsewhere at some widths, also start-aligned).
  test.skip(test.info().project.name !== 'chromium', 'measured line breaks are Chromium-calibrated (ADR-0010)');
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content = 'Read the full installation guide before you start the upgrade of the cluster.', piece = 'cluster';
  const html = `<div class="page"><p class="p">Read the full installation guide before you start the upgrade of the <a class="u" href="#x">cluster</a>.</p></div>`;
  const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);padding:0 10px;background:#fff;color:#000}.p{font-family:"Roboto";font-size:16px;line-height:24px;font-weight:400;text-align:justify}.u{color:#000}`;
  const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': piece}}, wrap: 'normal'}});
  const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 120, max: 900, height: {min: 600, max: 600}}, boxes});
  let placed = 0;
  for (let width = 120; width <= 900; width += 13) {
    const at = a => value(a.coefficient) * width + value(a.heightCoefficient ?? '0') * 600 + value(a.constant);
    const holds = row => row.regionConstraints.every(c => { const slack = value(c.coefficient) * width + value(c.heightCoefficient ?? '0') * 600 + value(c.constant); return c.strict ? slack > 1e-9 : slack >= -1e-9; });
    const bound = (report.inlineBounds ?? []).find(holds);
    if (!bound) continue;
    await page.setViewportSize({width, height: 600});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const rects = await page.evaluate(() => [...document.querySelector('.u').getClientRects()].map(r => ({x: r.x, y: r.y, w: r.width, h: r.height})));
    expect(rects.length).toBe(1); placed++;
    const [r] = rects, box = b => ({x: at(b.inlineStart), y: at(b.blockStart), w: at(b.inlineSize), h: at(b.blockSize)}), O = box(bound.outer), tag = `justify at ${width}`;
    expect(r.x, `${tag} left`).toBeGreaterThanOrEqual(O.x - 1e-9); expect(r.x + r.w, `${tag} right`).toBeLessThanOrEqual(O.x + O.w + 1e-9);
    expect(r.y, `${tag} top`).toBeGreaterThanOrEqual(O.y - 1e-9); expect(r.y + r.h, `${tag} bottom`).toBeLessThanOrEqual(O.y + O.h + 1e-9);
    if (bound.inner) { const I = box(bound.inner); expect(r.x, `${tag} inner left`).toBeLessThanOrEqual(I.x + 1e-9); expect(r.x + r.w, `${tag} inner right`).toBeGreaterThanOrEqual(I.x + I.w - 1e-9); }
  }
  expect(placed).toBeGreaterThan(10);
});

// Edges of an inline box in wrapping text (checklist D3): the line layout counts them, so the paragraph's height (its
// line count) and the link's bounds follow the browser at every width.
test('inline box edges in wrapping text: line count and bounds', async ({page}) => {
  test.setTimeout(240_000);
  test.skip(test.info().project.name === 'firefox', 'Firefox rounds inline edges to 1/60px (ADR-0010)');
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400}, content = 'Read the full installation guide before you start the upgrade of the cluster.', piece = 'installation guide';
  for (const [extra, edges] of [['.u{padding:0 8px}', [0, 8, 8, 0]], ['.u{margin:0 6px;padding:0 3px}', [6, 3, 3, 6]]]) {
    const at0 = content.indexOf(piece);
    const html = `<div class="page"><p class="p">${content.slice(0, at0)}<a class="u" href="#x">${piece}</a>${content.slice(at0 + piece.length)}</p></div>`;
    const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);padding:0 10px;background:#fff;color:#000}.p{font-family:"Roboto";font-size:16px;line-height:24px;font-weight:400}.u{color:#000}${extra}`;
    const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': {text: piece, edges}}}, wrap: 'normal'}});
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 120, max: 900, height: {min: 600, max: 600}}, boxes});
    expect(report.status === 'unknown', `${extra}: ${JSON.stringify(report.diagnostics.map(d => d.message))}`).toBe(false);
    let placed = 0;
    for (let width = 120; width <= 900; width += 11) {
      const atv = a => value(a.coefficient) * width + value(a.heightCoefficient ?? '0') * 600 + value(a.constant);
      const holds = row => (row.regionConstraints ?? []).every(c => { const slack = value(c.coefficient) * width + value(c.heightCoefficient ?? '0') * 600 + value(c.constant); return c.strict ? slack > 1e-9 : slack >= -1e-9; });
      await page.setViewportSize({width, height: 600});
      await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const b = await page.evaluate(() => ({h: document.querySelector('.p').getBoundingClientRect().height, rects: [...document.querySelector('.u').getClientRects()].map(r => ({x: r.x, y: r.y, w: r.width, h: r.height}))}));
      // The line count where the profile knows it (the model's lines are never shorter than the browser's: at least as many).
      const lines = boxes['.p'].intrinsicBlockSize.filter(e => e.atLeastInlineSize <= width - 20).at(-1);
      if (lines?.blockSize !== undefined) expect(b.h, `${extra} at ${width}: height`).toBeLessThanOrEqual(lines.blockSize + 1e-9);
      const bound = report.inlineBounds.find(holds);
      if (!bound) continue;
      expect(b.rects.length, `${extra} at ${width}`).toBe(1); placed++;
      const [r] = b.rects, box = q => ({x: atv(q.inlineStart), y: atv(q.blockStart), w: atv(q.inlineSize), h: atv(q.blockSize)}), O = box(bound.outer), tag = `${extra} at ${width}`;
      expect(r.x, `${tag} left`).toBeGreaterThanOrEqual(O.x - 1e-9); expect(r.x + r.w, `${tag} right`).toBeLessThanOrEqual(O.x + O.w + 1e-9);
      expect(r.y, `${tag} top`).toBeGreaterThanOrEqual(O.y - 1e-9); expect(r.y + r.h, `${tag} bottom`).toBeLessThanOrEqual(O.y + O.h + 1e-9);
      if (bound.inner) { const I = box(bound.inner); expect(r.x, `${tag} inner left`).toBeLessThanOrEqual(I.x + 1e-9); expect(r.x + r.w, `${tag} inner right`).toBeGreaterThanOrEqual(I.x + I.w - 1e-9); }
    }
    expect(placed, extra).toBeGreaterThan(10);
  }
});

// rtl (checklist D3): Hebrew text (letters and spaces only, so its visual order is the logical one reversed) in a
// direction: rtl paragraph, one line and wrapping, aligned at the start (right), centred and at the end (left). Hebrew
// widths are calibrated to Chromium (ADR-0010).
test('inline bounds in rtl Hebrew text', async ({page}) => {
  test.setTimeout(240_000);
  test.skip(test.info().project.name !== 'chromium', 'measured Hebrew widths are Chromium-calibrated (ADR-0010)');
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  const font = {family: 'Noto Sans Hebrew', size: 16, lineHeight: 24, weight: 400};
  for (const [content, piece, wrap] of [['שלום עולם וכל הדרך', 'עולם', null], ['שלום לכל מי שקורא את הספר הארוך הבא בעברית כדי לבדוק אם הקטע נמסר במקום הטוב בשורה האדומה', 'הקטע', 'normal']]) for (const align of ['start', 'center', 'left']) {
    const at = content.indexOf(piece);
    const html = `<div class="page"><p class="p" lang="he">${content.slice(0, at)}<a class="u" href="#x">${piece}</a>${content.slice(at + piece.length)}</p></div>`;
    const css = `*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);padding:0 10px;background:#fff;color:#000;direction:rtl}.p{font-family:"Noto Sans HebrewX";font-size:16px;line-height:24px;font-weight:400;${wrap ? '' : 'white-space:nowrap;'}text-align:${align}}.u{color:#000}`.replace('HebrewX', 'Hebrew');
    const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': piece}, lang: 'he'}, ...(wrap ? {wrap} : {})}});
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 160, max: 900, height: {min: 600, max: 600}}, boxes});
    expect(report.inlineBounds?.length, `${align} ${JSON.stringify(report.diagnostics.map(d => d.message))}`).toBeGreaterThan(0);
    let placed = 0;
    for (let width = 160; width <= 900; width += 17) {
      const atv = a => value(a.coefficient) * width + value(a.heightCoefficient ?? '0') * 600 + value(a.constant);
      const holds = row => row.regionConstraints.every(c => { const slack = value(c.coefficient) * width + value(c.heightCoefficient ?? '0') * 600 + value(c.constant); return c.strict ? slack > 1e-9 : slack >= -1e-9; });
      const bound = report.inlineBounds.find(holds);
      if (!bound) continue;
      await page.setViewportSize({width, height: 600});
      await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const rects = await page.evaluate(() => [...document.querySelector('.u').getClientRects()].map(r => ({x: r.x, y: r.y, w: r.width, h: r.height})));
      expect(rects.length).toBe(1); placed++;
      const [r] = rects, box = b => ({x: atv(b.inlineStart), y: atv(b.blockStart), w: atv(b.inlineSize), h: atv(b.blockSize)}), O = box(bound.outer), tag = `${align} ${wrap ?? 'nowrap'} at ${width}`;
      expect(r.x, `${tag} left`).toBeGreaterThanOrEqual(O.x - 1e-9); expect(r.x + r.w, `${tag} right`).toBeLessThanOrEqual(O.x + O.w + 1e-9);
      expect(r.y, `${tag} top`).toBeGreaterThanOrEqual(O.y - 1e-9); expect(r.y + r.h, `${tag} bottom`).toBeLessThanOrEqual(O.y + O.h + 1e-9);
      if (bound.inner) { const I = box(bound.inner); expect(r.x, `${tag} inner left`).toBeLessThanOrEqual(I.x + 1e-9); expect(r.x + r.w, `${tag} inner right`).toBeGreaterThanOrEqual(I.x + I.w - 1e-9); }
    }
    expect(placed, `${align} ${wrap}`).toBeGreaterThan(5);
  }
});

// A rowspan cell with auto height and measured wrapping text: its line count at the column width gives its height.
test('a measured text rowspan cell grows its rows like Chromium', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const font = {family: 'Roboto', size: 16, lineHeight: 20, weight: 400};
  const content = 'This note spans two rows and wraps over several lines in a narrow column.';
  const html = `<table class="t"><tbody><tr><td class="s" rowspan="2">${content}</td><td class="a"></td></tr><tr><td class="b"></td></tr></tbody></table>`;
  const css = `*{box-sizing:border-box;margin:0;padding:0}.t{table-layout:fixed;inline-size:300px;border-spacing:3px;background:#fff;color:#000}td{padding:0}.s{inline-size:120px;font-family:"Roboto";font-size:16px;line-height:20px;font-weight:400}.a{block-size:10px}.b{block-size:30px}`;
  const boxes = metrics.resolveBoxes({'.s': {text: {content, font}, wrap: 'normal'}});
  const report = analyzeHTML(html, {name: 'Case', css, viewport: {min: 320, max: 900, height: {min: 400, max: 600}}, boxes});
  expect(report.status, JSON.stringify(report.diagnostics)).toBe('verified');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  await page.setViewportSize({width: 500, height: 500});
  await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  for (const row of report.sizes.filter(row => row.rect && row.path !== 'Case')) {
    const rect = await page.evaluate(indices => { let node = document.querySelector('body > *'); for (const i of indices) node = node.children[i]; const r = node.getBoundingClientRect(); return {y: r.top, h: r.height}; }, row.path.split('/').slice(1).map(Number));
    expect(Math.abs(rect.y - value(row.rect.blockStart.constant)), `${row.box} top`).toBeLessThanOrEqual(1 / 64 + 1e-9);
    expect(Math.abs(rect.h - value(row.rect.blockSize.constant)), `${row.box} height`).toBeLessThanOrEqual(1 / 64 + 1e-9);
  }
});

// The same in a table whose width follows the viewport: the region splits where the note's line count changes.
test('a measured text rowspan cell in a viewport-wide table follows its line count', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const font = {family: 'Roboto', size: 16, lineHeight: 20, weight: 400};
  const content = 'This note spans two rows and wraps over several lines in a column that grows with the viewport.';
  const html = `<div class="g"><table class="t"><tbody><tr><td class="s" rowspan="2">${content}</td><td class="a"></td></tr><tr><td class="b"></td></tr></tbody></table></div>`;
  const css = `*{box-sizing:border-box;margin:0;padding:0}.g{display:grid;grid-template-columns:minmax(0,1fr)}.t{table-layout:fixed;inline-size:100%;border-spacing:3px;background:#fff;color:#000}td{padding:0}.s{font-family:"Roboto";font-size:16px;line-height:20px;font-weight:400}.a{inline-size:120px;block-size:10px}.b{block-size:30px}`;
  const boxes = metrics.resolveBoxes({'.s': {text: {content, font}, wrap: 'normal'}});
  const report = analyzeHTML(html, {name: 'Case', css, viewport: {min: 320, max: 900, height: {min: 400, max: 600}}, boxes});
  expect(report.status, JSON.stringify(report.diagnostics)).toBe('verified');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  const at = (a, w) => value(a.coefficient) * w + value(a.heightCoefficient ?? '0') * 500 + value(a.constant);
  const holds = (row, w) => (row.range.minInclusive === false ? w > row.range.min : w >= row.range.min) && (row.range.maxInclusive === false ? w < row.range.max : w <= row.range.max);
  const heights = new Set();
  for (let width = 320; width <= 900; width += 29) {
    await page.setViewportSize({width, height: 500});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    for (const row of report.sizes.filter(row => row.rect && row.path !== 'Case' && holds(row, width))) {
      const rect = await page.evaluate(indices => { let node = document.querySelector('body > *'); for (const i of indices) node = node.children[i]; const r = node.getBoundingClientRect(); return {y: r.top, h: r.height, w: r.width}; }, row.path.split('/').slice(1).map(Number));
      if (row.box === '.b') heights.add(rect.h);
      expect(Math.abs(rect.y - at(row.rect.blockStart, width)), `${row.box} top at ${width}`).toBeLessThanOrEqual(1 / 64 + 1e-9);
      expect(Math.abs(rect.h - at(row.rect.blockSize, width)), `${row.box} height at ${width}`).toBeLessThanOrEqual(1 / 64 + 1e-9);
    }
  }
  expect(heights.size, 'the rows grow differently across widths').toBeGreaterThan(1);
});

// The same with the text as a child stacked under a px block.
test('a rowspan cell stacking a px block and wrapping measured text follows the line count', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const font = {family: 'Roboto', size: 16, lineHeight: 20, weight: 400};
  const content = 'This note spans two rows and wraps over several lines in a column that grows with the viewport.';
  const html = `<div class="g"><table class="t"><tbody><tr><td class="s" rowspan="2"><div class="pad"></div><p class="note">${content}</p></td><td class="a"></td></tr><tr><td class="b"></td></tr></tbody></table></div>`;
  const css = `*{box-sizing:border-box;margin:0;padding:0}.g{display:grid;grid-template-columns:minmax(0,1fr)}.t{table-layout:fixed;inline-size:100%;border-spacing:3px;background:#fff;color:#000}td{padding:0}.s{font-family:"Roboto";font-size:16px;line-height:20px;font-weight:400}.a{inline-size:120px;block-size:10px}.b{block-size:30px}.pad{display:block;block-size:15px}.note{display:block}`;
  const boxes = metrics.resolveBoxes({'.note': {text: {content, font}, wrap: 'normal'}});
  const report = analyzeHTML(html, {name: 'Case', css, viewport: {min: 320, max: 900, height: {min: 500, max: 600}}, boxes});
  expect(report.status, JSON.stringify(report.diagnostics)).toBe('verified');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  const at = (a, w) => value(a.coefficient) * w + value(a.heightCoefficient ?? '0') * 500 + value(a.constant);
  const holds = (row, w) => (row.range.minInclusive === false ? w > row.range.min : w >= row.range.min) && (row.range.maxInclusive === false ? w < row.range.max : w <= row.range.max);
  const heights = new Set();
  for (let width = 320; width <= 900; width += 29) {
    await page.setViewportSize({width, height: 500});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    for (const row of report.sizes.filter(row => row.rect && row.path !== 'Case' && holds(row, width))) {
      const rect = await page.evaluate(indices => { let node = document.querySelector('body > *'); for (const i of indices) node = node.children[i]; const r = node.getBoundingClientRect(); return {y: r.top, h: r.height, w: r.width}; }, row.path.split('/').slice(1).map(Number));
      if (row.box === '.b') heights.add(rect.h);
      expect(Math.abs(rect.y - at(row.rect.blockStart, width)), `${row.box} top at ${width}`).toBeLessThanOrEqual(1 / 64 + 1e-9);
      expect(Math.abs(rect.h - at(row.rect.blockSize, width)), `${row.box} height at ${width}`).toBeLessThanOrEqual(1 / 64 + 1e-9);
    }
  }
  expect(heights.size, 'the rows grow differently across widths').toBeGreaterThan(1);
});

// Inline bounds in a table cell follow its vertical-align (middle by default) inside a taller row.
test('inline bounds in a table cell follow vertical-align', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const font = {family: 'Roboto', size: 16, lineHeight: 20, weight: 400};
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  for (const [align, wrap, content] of [['', 'nowrap', 'Read the guide.'], ['top', 'nowrap', 'Read the guide.'], ['bottom', 'nowrap', 'Read the guide.'], ['', 'normal', 'Read the guide before the long upgrade of the cluster.']]) {
    const at = content.indexOf('guide');
    const html = `<table class="t"><tbody><tr><td class="p">${content.slice(0, at)}<a class="u" href="#x">guide</a>${content.slice(at + 5)}</td><td class="c"></td></tr></tbody></table>`;
    const css = `*{box-sizing:border-box;margin:0;padding:0}.t{table-layout:fixed;inline-size:300px;border-spacing:0;background:#fff;color:#000}td{padding:0}.p{block-size:90px;font-family:"Roboto";font-size:16px;line-height:20px;font-weight:400;${wrap === 'nowrap' ? 'white-space:nowrap;' : ''}${align ? `vertical-align:${align};` : ''}}.u{color:#000}.c{block-size:90px}`;
    const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': 'guide'}}, ...(wrap === 'normal' ? {wrap: 'normal'} : {})}});
    const report = analyzeHTML(html, {name: 'Case', css, viewport: {min: 320, max: 900, height: {min: 400, max: 600}}, boxes});
    const bound = (report.inlineBounds ?? []).find(row => row.range.min <= 500 && 500 <= row.range.max && (row.range.maxInclusive !== false || 500 < row.range.max));
    expect(bound, `${align || 'middle'} ${wrap}: ${JSON.stringify(report.diagnostics)}`).toBeTruthy();
    await page.setViewportSize({width: 500, height: 500});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => { const b = document.querySelector('.u').getBoundingClientRect(); return {y: b.y, h: b.height}; });
    const top = value(bound.outer.blockStart.constant), bottom = top + value(bound.outer.blockSize.constant);
    const innerTop = value(bound.inner.blockStart.constant), innerBottom = innerTop + value(bound.inner.blockSize.constant);
    const tag = `${align || 'middle'} ${wrap}`;
    expect(r.y, `${tag} top`).toBeGreaterThanOrEqual(top - 1e-9); expect(r.y + r.h, `${tag} bottom`).toBeLessThanOrEqual(bottom + 1e-9);
    expect(r.y, `${tag} inner top`).toBeLessThanOrEqual(innerTop + 1e-9); expect(r.y + r.h, `${tag} inner bottom`).toBeGreaterThanOrEqual(innerBottom - 1e-9);
  }
});

// Baseline-aligned text cells: the first line's baseline is floor((L − (A + D)) / 2) + A (rounded ascent/descent).
test('baseline-aligned text and block cells line up like Chromium', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const roboto = {family: 'Roboto', size: 20, lineHeight: 30, weight: 400}, noto = {family: 'Noto Sans JP', size: 13, lineHeight: 17, weight: 400};
  const html = '<table class="t"><tbody><tr><td class="r">Ax</td><td class="n">日本語</td><td class="b"><div class="k"></div></td><td class="m"><div class="h"></div></td></tr></tbody></table>';
  const css = `*{box-sizing:border-box;margin:0;padding:0}.t{table-layout:fixed;inline-size:300px;border-spacing:2px;background:#fff;color:#000}td{padding:3px;vertical-align:baseline}.r{font-family:"Roboto";font-size:20px;line-height:30px;font-weight:400;white-space:nowrap}.n{padding-top:9px;font-family:"Noto Sans JP";font-size:13px;line-height:17px;font-weight:400;white-space:nowrap}.k{block-size:40px}.m{vertical-align:middle}.h{block-size:70px}`;
  const boxes = metrics.resolveBoxes({'.r': {text: {content: 'Ax', font: roboto}}, '.n': {text: {content: '日本語', font: noto}}});
  const report = analyzeHTML(html, {name: 'Case', css, viewport: {min: 320, max: 900, height: {min: 400, max: 600}}, boxes});
  expect(report.status, JSON.stringify(report.diagnostics)).toBe('verified');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  await page.setViewportSize({width: 500, height: 500});
  await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  for (const row of report.sizes.filter(row => row.rect && row.path !== 'Case')) {
    const rect = await page.evaluate(indices => { let node = document.querySelector('body > *'); for (const i of indices) node = node.children[i]; const r = node.getBoundingClientRect(); return {y: r.top, h: r.height}; }, row.path.split('/').slice(1).map(Number));
    expect(Math.abs(rect.y - value(row.rect.blockStart.constant)), `${row.box} top`).toBeLessThanOrEqual(1 / 64 + 1e-9);
    expect(Math.abs(rect.h - value(row.rect.blockSize.constant)), `${row.box} height`).toBeLessThanOrEqual(1 / 64 + 1e-9);
  }
});

// A table cell's text runs between block children are anonymous blocks stacked in DOM order.
test('anonymous text blocks in a table cell stack like Chromium', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const font = {family: 'Roboto', size: 16, lineHeight: 20, weight: 400};
  const runs = ['Total for this order', 'due before the end of the week, including shipping'];
  const html = `<table class="t"><tbody><tr><td class="c">${runs[0]}<div class="k"></div>${runs[1]}</td><td class="d"></td></tr></tbody></table>`;
  const css = `*{box-sizing:border-box;margin:0;padding:0}.t{table-layout:fixed;inline-size:300px;border-spacing:4px;background:#fff;color:#000}td{padding:3px;vertical-align:top}.c{inline-size:150px;font-family:"Roboto";font-size:16px;line-height:20px;font-weight:400}.k{block-size:12px}`;
  const boxes = metrics.resolveBoxes({'.c': {textRuns: runs.map(content => ({text: {content, font}, wrap: 'normal'}))}});
  const report = analyzeHTML(html, {name: 'Case', css, viewport: {min: 320, max: 900, height: {min: 400, max: 600}}, boxes});
  expect(report.status, JSON.stringify(report.diagnostics)).toBe('verified');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  await page.setViewportSize({width: 500, height: 500});
  await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  for (const row of report.sizes.filter(row => row.rect && row.path !== 'Case')) {
    const segments = row.path.split('/').slice(1);
    const rect = await page.evaluate(segments => {
      let node = document.querySelector('body > *');
      for (const s of segments) {
        if (s.startsWith('t')) { // the k-th text run of the cell: the box of its line rects
          const texts = [...node.childNodes].filter(n => n.nodeType === 3 && n.data.trim()), range = document.createRange(); range.selectNodeContents(texts[Number(s.slice(1))]);
          const rs = [...range.getClientRects()]; return {y: Math.min(...rs.map(r => r.top)), bottom: Math.max(...rs.map(r => r.bottom)), text: true};
        }
        node = node.children[Number(s)];
      }
      const r = node.getBoundingClientRect(); return {y: r.top, bottom: r.bottom};
    }, segments);
    const top = value(row.rect.blockStart.constant), height = value(row.rect.blockSize.constant);
    // A run's line boxes start at its block's top; the glyph boxes sit inside its lines (20px each).
    if (rect.text) { expect(rect.y, `${row.box} top`).toBeGreaterThanOrEqual(top - 1e-9); expect(rect.bottom, `${row.box} bottom`).toBeLessThanOrEqual(top + height + 1e-9); expect(rect.y - top, `${row.box} first line`).toBeLessThan(20); }
    else { expect(Math.abs(rect.y - top), `${row.box} top`).toBeLessThanOrEqual(1 / 64 + 1e-9); expect(Math.abs(rect.bottom - (top + height)), `${row.box} bottom`).toBeLessThanOrEqual(1 / 64 + 1e-9); }
  }
});

// Right-to-left text (Hebrew): widths and wrapping are the same sums of glyph advances.
test('right-to-left Hebrew widths and line profiles match Chromium; Arabic stays outside', async ({page}) => {
  test.setTimeout(240_000);
  const rtlFiles = {'Noto Sans Arabic': 'arabic-variable.ttf', 'Noto Sans Hebrew': 'hebrew-variable.ttf'};
  const rtl = await loadTextMetrics({fonts: Object.fromEntries(Object.entries(rtlFiles).map(([family, file]) => [family, {file: new URL(file, fixtures).pathname}]))});
  const rtlFace = Object.entries(rtlFiles).map(([family, file]) => `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${readFileSync(new URL(file, fixtures)).toString('base64')})}`).join('');
  // Arabic is shaped differently from Chromium (يلتف is 0.6px narrower): it stays outside the model.
  expect(() => rtl.measureText({font: {family: 'Noto Sans Arabic', size: 20, lineHeight: 30, weight: 400}, text: 'مرحبا بالعالم'})).toThrow(/Arabic shaping is not modeled/);
  const cases = [['Noto Sans Hebrew', 'he', 'שלום עולם ברוכים הבאים טקסט ארוך שנשבר על פני כמה שורות לבדיקה'], ['Noto Sans Hebrew', 'he', 'שלום עולם']];
  await page.setContent(`<!doctype html><html dir="rtl"><style>${rtlFace}body{margin:0}</style><body></body></html>`);
  for (const [family, lang, text] of cases) {
    const font = {family, size: 20, lineHeight: 30, weight: 400};
    const measured = rtl.measureText({font, text, lang});
    const lines = rtl.breakLines({font, text, lang});
    const widths = [...new Set(lines.profile.flatMap(entry => [-2, -1, 0, 1].map(d => entry.atLeastInlineSize + d / 64)))].filter(w => w >= lines.profile[0].atLeastInlineSize && w > 0).sort((a, b) => a - b);
    const rendered = await page.evaluate(async ({family, text, widths}) => {
      await document.fonts.load(`400 20px "${family}"`, text);
      const element = document.createElement('div');
      Object.assign(element.style, {fontFamily: `"${family}"`, fontSize: '20px', lineHeight: '30px', fontWeight: '400', width: 'max-content', whiteSpace: 'nowrap'});
      element.textContent = text; document.body.append(element);
      const single = element.getBoundingClientRect().width;
      Object.assign(element.style, {whiteSpace: 'normal'});
      const counts = widths.map(w => { element.style.width = `${w}px`; return element.getBoundingClientRect().height / 30; });
      element.remove(); return {single, counts};
    }, {family, text, widths});
    expect(rendered.single, `${text} >= advance`).toBeGreaterThanOrEqual(measured.width - 1e-9);
    expect(rendered.single, `${text} <= bound`).toBeLessThanOrEqual(measured.bound);
    const slack = (2 * scriptRuns(text) + 1) / 64;
    widths.forEach((w, i) => {
      const modeled = lines.profile.filter(entry => entry.atLeastInlineSize <= w).at(-1).lines;
      expect(rendered.counts[i], `${text} at ${w}px`).toBeLessThanOrEqual(modeled);
      if (!lines.profile.some(entry => w < entry.atLeastInlineSize && w >= entry.atLeastInlineSize - slack)) expect(rendered.counts[i], `${text} at ${w}px`).toBe(modeled);
    });
  }
});

test('::before/::after text is measured with the leaf content (withGeneratedText) and fits exactly where Chromium shows', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const ro = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
  const base = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.price{font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap}.price::before{content:"$ "}.price::after{content:" USD"}';
  const html = '<div class="page"><p class="price">1,200</p></div>';
  for (const width of [60, 86, 87, 120]) {
    const css = `${base}.price{width:${width}px}`;
    const report = metrics.withGeneratedText(options => analyzeHTML(html, options), {name: 'P', css, viewport: {min: 320, max: 800}, boxes: {'.price': {text: {font: ro, content: '1,200'}}}});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics)).toBe(false);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    // The generated text is part of the line: Chromium's line width (a range over the whole content box).
    const line = await page.evaluate(() => { const p = document.querySelector('.price'), r = document.createRange(); r.selectNodeContents(p); return Math.max(p.scrollWidth, r.getBoundingClientRect().width); });
    const overflows = line > width;
    // Static: violated means the measured bound does not fit; verified means it fits (the bound is above the advance).
    if (report.status === 'verified') expect(overflows, `${width}px: static fits, Chromium line ${line}`).toBe(false);
    if (report.status === 'violated') expect(width < line + 1, `${width}px: static overflow, Chromium line ${line}`).toBe(true);
  }
});

test('-webkit-line-clamp caps wrapped text at N lines like Chromium, and warns exactly where text is cut', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const ro = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
  const content = 'Static layout checks prove that every card title fits its box at every viewport width';
  const css = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.t{font-family:Roboto;font-size:16px;line-height:24px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.b{height:10px}';
  const html = `<div class="page"><p class="t">${content}</p><div class="b"></div></div>`;
  const report = analyzeHTML(html, metrics.resolveOptions({name: 'P', css, viewport: {min: 200, max: 1280, height: {min: 2000, max: 2000}}, boxes: {'.t': {text: {font: ro, content}, wrap: 'normal'}}}));
  expect(report.status === 'unknown', JSON.stringify(report.diagnostics)).toBe(false);
  const warnings = (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_LINE_CLAMPED');
  for (const width of [1280, 700, 500, 320, 200]) {
    await page.setViewportSize({width, height: 800});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${css}</style></head><body style="margin:0">${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const browser = await page.evaluate(() => { const t = document.querySelector('.t'); return {height: t.getBoundingClientRect().height, cut: t.scrollHeight > t.clientHeight + 0.5}; });
    const row = report.sizes.find(r => r.box === '.t' && width >= r.range.min && width <= r.range.max);
    expect(Number(row.blockSize.constant), `height at ${width}`).toBe(browser.height);
    const warned = warnings.some(w => width >= w.range.min && width <= w.range.max);
    expect(warned, `cut at ${width}: static ${warned}, Chromium ${browser.cut}`).toBe(browser.cut);
  }
});

test('text-overflow: ellipsis warns exactly where Chromium truncates the line', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const ro = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
  const content = 'Wireless noise-cancelling headphones, midnight blue';
  const css = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr);padding:0 16px}.t{font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
  const html = `<div class="page"><p class="t">${content}</p></div>`;
  const report = analyzeHTML(html, metrics.resolveOptions({name: 'P', css, viewport: {min: 200, max: 1280}, boxes: {'.t': {text: {font: ro, content}}}}));
  expect(report.status === 'unknown', JSON.stringify(report.diagnostics)).toBe(false);
  const [warning] = (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_TRUNCATED');
  for (const width of [200, 380, 400, 420, 1280]) {
    await page.setViewportSize({width, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${css}</style></head><body style="margin:0">${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const cut = await page.evaluate(() => { const t = document.querySelector('.t'); return t.scrollWidth > t.clientWidth; });
    const warned = Boolean(warning) && width >= warning.range.min && (width < warning.range.max || (width === warning.range.max && warning.range.maxInclusive));
    // The static bound is a sufficient width: no warning means Chromium does not cut.
    if (!warned) expect(cut, `${width}: no warning, Chromium cut ${cut}`).toBe(false);
    if (cut) expect(warned, `${width}: Chromium cuts, static warned ${warned}`).toBe(true);
  }
});

test('letter-spacing (px, or em made px at its element) is measured like Chromium lays it out', async ({page}) => {
  const {analyzeHTML} = await import('../packages/css-verifier/src/html.mjs');
  const texts = ['Checkout', 'Wireless headphones', 'office ffi fl'];
  for (const [spacing, css] of [[0.32, 'letter-spacing:0.02em'], [1, 'letter-spacing:1px'], [-0.5, 'letter-spacing:-0.5px'], [2.4, 'letter-spacing:0.15em']]) {
    const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400, letterSpacing: spacing};
    for (const text of texts) {
      const measured = metrics.measureText({font, text});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${face}span{font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap;${css}}</style></head><body><span>${text}</span></body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const width = await page.evaluate(() => document.querySelector('span').getBoundingClientRect().width);
      expect(width, `${text} ${css}: Chromium ${width}, shaped ${measured.width}`).toBeGreaterThanOrEqual(measured.width - 1 / 64);
      expect(width, `${text} ${css}: Chromium ${width}, bound ${measured.bound}`).toBeLessThanOrEqual(measured.bound);
    }
  }
  // The analysis accepts the em value once its px matches the measured spacing, and an inherited em is the parent's px.
  const html = '<div class="page"><p class="t">Checkout</p></div>';
  const run = css => analyzeHTML(html, metrics.resolveOptions({name: 'P', css: '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr);font-size:20px;letter-spacing:0.05em}.t{font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap}' + css, viewport: {min: 320, max: 800}, boxes: {'.t': {text: {font: {family: 'Roboto', size: 16, lineHeight: 24, weight: 400, letterSpacing: 1}, content: 'Checkout'}}}}));
  expect(run('').status).toBe('verified'); // 0.05em × 20px (the page) = 1px, inherited
  expect(run('.t{letter-spacing:0.05em}').status).toBe('unknown'); // 0.8px at 16px: not the measured 1px
});

test('lint with a font file: a measured auto column of text is as wide as Chromium renders it, and the verdict agrees', async ({page}) => {
  const {analyzeStates} = await import('../packages/adapter-core/src/index.mjs');
  const fonts = {Roboto: {file: new URL('roboto-variable.ttf', fixtures).pathname}};
  const css = '.row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:8px}.label,.value{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;color:#000}';
  const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}span{display:block}';
  for (const label of ['Account name', 'Notification preferences for this device']) {
    const html = `<div class="row"><span class="label">${label}</span><span class="value">Example</span></div>`;
    const result = analyzeStates({states: [{html, choices: {}}], css}, {pageCSS, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, assumeText: true, textMetrics: metrics, fonts});
    expect(result.status, label).not.toBe('unknown');
    for (const width of [320, 600]) {
      await page.setViewportSize({width, height: 700});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${pageCSS}${css}</style></head><body>${html}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const rendered = await page.evaluate(() => document.querySelector('.label').getBoundingClientRect().width);
      const row = result.states[0].report.sizes.find(s => /^\.label/.test(s.box) && s.rect && s.range.min <= width && width <= s.range.max);
      const v = a => Number(String(a.coefficient).split('/').reduce((p, c) => p / c)) * width + Number(String(a.constant).split('/').reduce((p, c) => p / c));
      // The derived width is a sound bound on the shaped advance (layoutAllowance): within a pixel of Chromium.
      expect(Math.abs(v(row.rect.inlineSize) - rendered), `${label} at ${width}px: static ${v(row.rect.inlineSize)} vs ${rendered}`).toBeLessThan(1.01);
    }
  }
});

test('one-line text: the static violation fires exactly at the widths where Chromium wraps the text', async ({page}) => {
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
  for (const label of ['Save all changes', 'Notification preferences']) {
    const css = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr)}.b{display:block;padding:0 8px;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400}';
    const report = analyzeHTML(`<html lang="en"><body><div class="p"><p class="b">${label}</p></div></body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: metrics.resolveBoxes({'.b': {text: {font, content: label}, wrap: 'one-line'}})});
    for (const width of [320, 400, 480, 560, 640, 720, 800]) {
      await page.setViewportSize({width, height: 700});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${css}</style></head><body><div class="p"><p class="b">${label}</p></div></body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const wraps = await page.evaluate(() => document.querySelector('.b').getBoundingClientRect().height > 24.5);
      expect(report.status, label).not.toBe('unknown');
      const violated = report.diagnostics.some(d => d.code === 'E_LAYOUT_CONTENT' && d.range.min <= width && width <= d.range.max && (d.range.maxInclusive !== false || width < d.range.max) && (d.range.minInclusive !== false || width > d.range.min));
      expect(violated, `${label} at ${width}px`).toBe(wraps);
    }
  }
});

test('placeholder clipped: the static warning fires exactly where Chromium\'s placeholder text is wider than the field', async ({page}) => {
  const {analyzeStates} = await import('../packages/adapter-core/src/index.mjs');
  const fonts = {Roboto: {file: new URL('roboto-variable.ttf', fixtures).pathname}};
  const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}label{display:block;color:#000;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400}';
  for (const [placeholder, columns] of [['Enter the email address you use at work', 'minmax(0,1fr)'], ['you@example.com', '200px'], ['Search products, brands and more', 'minmax(0,1fr) minmax(0,1fr)']]) {
    const css = `.f{display:grid;grid-template-columns:${columns}}.i{display:block;width:100%;height:34px;padding:4px 8px;border:1px solid #666;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;color:#000;background:#fff}`;
    const html = `<div class="f"><label class="l" for="e">Email</label><input class="i" id="e" type="email" placeholder="${placeholder}"></div>`;
    const result = analyzeStates({states: [{html, choices: {}}], css}, {pageCSS, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, assumeText: true, textMetrics: metrics, fonts});
    const warned = result.states[0].report.layoutWarnings?.find(w => w.code === 'W_A11Y_PLACEHOLDER_CLIPPED');
    for (const width of [320, 480, 640, 800]) {
      await page.setViewportSize({width, height: 700});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${pageCSS}${css}</style></head><body>${html}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const [text, room] = await page.evaluate(() => { const i = document.querySelector('.i'), s = getComputedStyle(i), c = document.createElement('canvas').getContext('2d'); c.font = `${s.fontWeight} ${s.fontSize} Roboto`; return [c.measureText(i.placeholder).width, i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)]; });
      const statically = Boolean(warned && warned.range.min <= width && width <= warned.range.max);
      // (Within the 1px allowance of the derived bound the static side may warn first.)
      if (Math.abs(text - room) > 1) expect(statically, `${placeholder} at ${width}px: text ${text}, room ${room}`).toBe(text > room);
    }
  }
});

test('text resize (SC 1.4.4): with Chromium\'s default font size doubled, the text overflows exactly where E_A11Y_TEXT_RESIZE is reported', async ({page}) => {
  const {analyzeStates} = await import('../packages/adapter-core/src/index.mjs');
  const fonts = {Roboto: {file: new URL('roboto-variable.ttf', fixtures).pathname}};
  const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}';
  const cdp = await chromiumOnly(page);
  for (const [label, size] of [['Save changes', 'font-size:1rem;line-height:1.5'], ['OK', 'font-size:1rem;line-height:1.5'], ['Save changes', 'font-size:16px;line-height:24px'], ['Continue to payment', 'font-size:0.875rem;line-height:1.5']]) {
    const css = `.w{display:grid;grid-template-columns:200px}.b{display:block;width:100%;padding:0 8px;border:0;font-family:Roboto;${size};font-weight:400;color:#000;background:#eee;white-space:nowrap}`;
    const html = `<div class="w"><button class="b" type="button">${label}</button></div>`;
    const result = analyzeStates({states: [{html, choices: {}}], css}, {pageCSS, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, assumeText: true, textMetrics: metrics, fonts, defaultFontSize: 16, textResize: true});
    const reported = result.findings.some(f => f.code === 'E_A11Y_TEXT_RESIZE');
    await cdp.send('Page.setFontSizes', {fontSizes: {standard: 32}});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${pageCSS}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const overflows = await page.evaluate(() => { const b = document.querySelector('.b'); return b.scrollWidth > b.clientWidth; });
    await cdp.send('Page.setFontSizes', {fontSizes: {standard: 16}});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${pageCSS}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const atOne = await page.evaluate(() => { const b = document.querySelector('.b'); return b.scrollWidth > b.clientWidth; });
    expect(reported, `${label} (${size}): overflows at 2× ${overflows}, at 1× ${atOne}`).toBe(overflows && !atOne);
  }
});

test('justify-self: end on a text grid item: its fit-content box ends at the area end and contains the rendered box', async ({page}) => {
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
  const texts = ['See you at noon', 'https://example.com/reservations/confirmation'];
  const html = `<main class="t"><p class="a">${texts[0]}</p><p class="b">${texts[1]}</p></main>`;
  const css = `*{box-sizing:border-box;margin:0;padding:0}.t{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px;padding:16px;background:#fff;color:#000}.a,.b{justify-self:end;max-width:260px;padding:12px;font-family:"Roboto";font-size:16px;line-height:24px;font-weight:400}.b{overflow-wrap:anywhere}`;
  const boxes = metrics.resolveBoxes({'.a': {text: {content: texts[0], font}, wrap: 'normal'}, '.b': {text: {content: texts[1], font, overflowWrap: 'anywhere'}, wrap: 'anywhere'}});
  const report = analyzeHTML(html, {name: 'Case', css, viewport: {min: 320, max: 900, height: {min: 400, max: 700}}, boxes});
  expect(report.status, JSON.stringify(report.diagnostics)).toBe('verified');
  const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
  for (const width of [320, 400, 700]) {
    await page.setViewportSize({width, height: 600});
    await page.setContent(`<!doctype html><html><head><style>${face}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    for (const row of report.sizes.filter(row => row.rect && row.path !== 'Case' && row.range.min <= width && width <= row.range.max)) {
      const at = a => value(a.constant) + width * value(a.coefficient) + 600 * value(a.heightCoefficient ?? '0');
      const r = await page.evaluate(i => { const e = document.querySelector('body > *').children[i]; const b = e.getBoundingClientRect(); return {x: b.left, w: b.width}; }, Number(row.path.split('/')[1]));
      const x = at(row.rect.inlineStart), w = at(row.rect.inlineSize);
      expect(Math.abs((x + w) - (r.x + r.w)), `${row.box} right edge at ${width}`).toBeLessThanOrEqual(1 / 64 + 1e-9);
      expect(x, `${row.box} left at ${width}`).toBeLessThanOrEqual(r.x + 1e-6);
      expect(x + w - r.x - r.w).toBeLessThanOrEqual(1e-6);
      expect(r.x - x, `${row.box} model box at most a few 1/64 px wider at ${width}`).toBeLessThanOrEqual(0.25);
    }
  }
});

test('text-line-obscured holds only where Chromium has glyphs of the first line under the cover', async ({page}) => {
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
  const texts = ['Your settings were saved to your account', 'Saved', 'A much longer notice that wraps over several lines on a phone screen'];
  let reported = 0;
  for (const content of texts) for (const extra of ['', '.c{right:60px}', '.c{top:30px}', '.b{padding-right:48px}', '.c{width:12px}']) {
    const html = `<div class="b"><p class="t">${content}</p><button class="c" type="button" aria-label="Close"></button></div>`;
    const css = `*{margin:0;box-sizing:border-box}html,body{display:grid;grid-template-columns:minmax(0,1fr);background:#fff}.b{position:relative;display:grid;grid-template-columns:minmax(0,1fr);padding:12px;background:#e8f0fe}.t{font-family:"Roboto";font-size:16px;line-height:24px;font-weight:400;color:#111}.c{position:absolute;top:8px;right:8px;width:32px;height:32px;padding:0;border:0;background:#1a73e8}${extra}`;
    const boxes = metrics.resolveBoxes({'.t': {text: {content, font}, wrap: 'normal'}});
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 900, height: {min: 480, max: 900}}, accessibility: true, boxes});
    const found = report.diagnostics.filter(d => d.code === 'E_A11Y_TEXT_LINE_OBSCURED');
    for (let width = 320; width <= 900; width += 23) {
      const holds = found.some(d => (d.range.minInclusive === false ? width > d.range.min : width >= d.range.min) && (d.range.maxInclusive === false ? width < d.range.max : width <= d.range.max));
      if (!holds) continue;
      reported++;
      await page.setViewportSize({width, height: 600});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${css}</style></head><body>${html}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const hits = await page.evaluate(() => { const t = document.querySelector('.t').firstChild, c = document.querySelector('.c').getBoundingClientRect(); let n = 0; for (let i = 0; i < t.length; i++) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); const g = r.getBoundingClientRect(); if (g.width && g.right > c.left && g.left < c.right && g.bottom > c.top && g.top < c.bottom) n++; } return n; });
      expect(hits, `${JSON.stringify(content)} ${extra} at ${width}`).toBeGreaterThan(0);
    }
  }
  expect(reported).toBeGreaterThan(3);
});

test('dynamic-unbounded: with a long value in place of the dynamic text, Chromium overflows the box exactly where the warning holds', async ({page}) => {
  const {analyzeStates} = await import('../packages/adapter-core/src/index.mjs');
  const fonts = {Roboto: {file: new URL('roboto-variable.ttf', fixtures).pathname}};
  const long = 'Bartholomew Montgomery-Fitzwilliam the Third of Somewhere Very Far';
  for (const [attrs, extra] of [['', ''], ['data-text-max-length="12"', ''], ['', '.name{overflow:hidden;text-overflow:ellipsis}'], ['', '.name{white-space:normal;overflow-wrap:anywhere}'], ['data-text-one-line', '.name{white-space:normal}']]) {
    const css = `.c{display:grid;grid-template-columns:200px}.name{display:block;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;color:#000;white-space:nowrap}${extra}`;
    const result = analyzeStates({states: [{html: `<div class="c"><span class="name" ${attrs}>…</span></div>`, choices: {}}], css}, {pageCSS: '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}', viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, assumeText: true, textMetrics: metrics, fonts});
    const warned = result.findings.some(f => f.code === 'W_TEXT_DYNAMIC_UNBOUNDED');
    await page.setViewportSize({width: 400, height: 400});
    // A bounded value is rendered within its bound (12 characters). data-text-one-line states an expectation the CSS
    // does not enforce (rendered as the CSS says, it wraps): the warning there is about the unchecked expectation.
    await page.setContent(`<!doctype html><html lang="en"><head><style>${face}*{box-sizing:border-box;margin:0}${css}</style></head><body><div class="c"><span class="name">${attrs.includes('max-length') ? long.slice(0, 12) : long}</span></div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const runsPast = await page.evaluate(() => { const e = document.querySelector('.name'), s = getComputedStyle(e); const r = document.createRange(); r.selectNodeContents(e); const visible = !['hidden', 'clip'].includes(s.overflowX); return visible && r.getBoundingClientRect().right > e.getBoundingClientRect().right + 0.5; });
    if (attrs === 'data-text-one-line') { expect(warned, 'one-line expectation without a bound').toBe(true); continue; }
    expect(warned, `${attrs} ${extra}`).toBe(runsPast);
  }
});
