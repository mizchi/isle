// Component lint evaluation (evals/scenarios/component-lint): for each case, lint the component as an author would
// (with the font file, as `css-lint --font` does) and lay every state out in Chromium to find what actually breaks.
//   node tools/eval-component-lint.mjs [--attempt <run>] [--out <file>]
// Without --attempt it evaluates each case's before.*; with it, attempts/<run>/<case>.* (the author's fix made by
// following the warnings). The summary separates: breaks Chromium shows and lint reports (caught), breaks lint misses
// (missed), lint errors Chromium does not show (unconfirmed), and what lint could not check (Unknown, by reason).
import {chromium} from 'playwright';
import {readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, extname, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lint} from '../packages/adapter-core/src/index.mjs';
import {loadTextMetrics} from '../packages/css-verifier/src/text-node.mjs';
import {expandSvelte, analyzeSvelte, unscopeCSS} from '../packages/svelte-adapter/src/index.mjs';
import {expandVue, analyzeVue} from '../packages/vue-adapter/src/index.mjs';
import {expandReact, analyzeReact} from '../packages/react-adapter/src/index.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const scenario = join(root, 'evals/scenarios/component-lint');
const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const fontFile = join(root, 'packages/css-verifier/text-metrics/fixtures/roboto-variable.ttf');
const fonts = {Roboto: {file: fontFile}};
const face = `@font-face{font-family:Roboto;src:url(data:font/ttf;base64,${readFileSync(fontFile).toString('base64')})}`;
const pageCSS = '*{box-sizing:border-box;margin:0}html{font-family:Roboto;line-height:1.5}';
const widths = [320, 375, 768, 1280];
const textMetrics = await loadTextMetrics({fonts});
const adapters = {
  '.svelte': {analyze: analyzeSvelte, expand: s => { const e = expandSvelte(s); return {...e, css: unscopeCSS(e.css)}; }},
  '.vue': {analyze: analyzeVue, expand: expandVue},
  '.jsx': {analyze: analyzeReact, expand: expandReact},
};

const browser = await chromium.launch();
const cases = readdirSync(join(scenario, 'cases')).sort();
const rows = [];
for (const id of cases) {
  const meta = JSON.parse(readFileSync(join(scenario, 'cases', id, 'case.json'), 'utf8'));
  const dir = opt.attempt ? join(scenario, 'attempts', opt.attempt) : join(scenario, 'cases', id);
  const name = opt.attempt ? readdirSync(dir).find(f => f.startsWith(`${id}.`)) : readdirSync(dir).find(f => f.startsWith('before.'));
  if (!name) { rows.push({id, skipped: 'no file'}); continue; }
  const file = join(dir, name), source = readFileSync(file, 'utf8'), adapter = adapters[extname(file)];
  // Lint as the CLI does with --font.
  const options = {defaultFontSize: 16, defaultColors: true, scrollIntent: 'css', sourceLines: true, eachCounts: [0, 2], pageCSS, viewport: {min: 320, max: 1280, height: {min: 480, max: 900}}, accessibility: true, integrity: true, selectors: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], assumeText: true, textMetrics, fonts, textResize: true};
  const result = adapter.analyze(source, options);
  const messages = lint(result, {file: name, source});
  // Chromium: every state the adapter expands, at each width, at 1× and 2× default font size.
  const {states, css} = adapter.expand(source, {eachCounts: [0, 2]});
  const breaks = new Map();
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  for (const [scale, standard, scheme] of [['1x', 16, 'light'], ['2x', 32, 'light'], ['dark', 16, 'dark']]) {
    await cdp.send('Page.setFontSizes', {fontSizes: {standard}});
    await page.emulateMedia({colorScheme: scheme});
    // The widths lint names in its counterexamples are laid out too, so an error at 552px is confirmed or refuted there.
    const witnessWidths = [...new Set(messages.flatMap(m => [...m.message.matchAll(/at viewport (\d+(?:\.\d+)?)px/g)].map(x => Math.floor(Number(x[1])))))].filter(w => !widths.includes(w)).slice(0, 6);
    for (const width of [...widths, ...witnessWidths]) for (const state of states) {
      await page.setViewportSize({width, height: 700});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${pageCSS}${css}</style></head><body>${state.html}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const found = await page.evaluate(async () => {
        const out = [], label = e => e.id ? '#' + e.id : e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).filter(c => !/^(svelte|s)-/.test(c)).join('.') : e.tagName.toLowerCase();
        // Visually hidden on purpose (sr-only: a clip-path or clip, or a box of at most 1px hiding its overflow, on it or an ancestor): read, not seen.
        const srOnly = e => { for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n), r = n.getBoundingClientRect(); if ((cs.clipPath && cs.clipPath !== 'none') || (cs.clip && cs.clip !== 'auto') || (cs.overflow !== 'visible' && (r.width <= 1 || r.height <= 1))) return true; } return false; };
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push(['page-overflow', 'html']);
        const texts = [...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getClientRects().length && e.checkVisibility({visibilityProperty: true}) && !srOnly(e));
        for (const e of texts) if (getComputedStyle(e).display !== 'inline') {
          // Sub-pixel: the text's line boxes (a Range) against the content box, not the integer scrollWidth.
          const cs0 = getComputedStyle(e), b0 = e.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(e);
          const right = Math.max(...[...rg.getClientRects()].map(r => r.right)), left = Math.min(...[...rg.getClientRects()].map(r => r.left));
          const innerRight = b0.right - parseFloat(cs0.paddingRight) - parseFloat(cs0.borderRightWidth), innerLeft = b0.left + parseFloat(cs0.paddingLeft) + parseFloat(cs0.borderLeftWidth);
          if (e.scrollWidth > e.clientWidth + 1 || right > innerRight + 0.1 || left < innerLeft - 0.1) out.push(['text-overflow', label(e)]);
          // The text's lines taller than its box (a fixed height): clipped or spilling over what follows.
          const r = document.createRange(); r.selectNodeContents(e); const lines = r.getBoundingClientRect(), box = e.getBoundingClientRect(), cs = getComputedStyle(e);
          if (lines.height > box.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth) + 1) out.push(['text-overflow-block', label(e)]);
        }
        // Any glyph of the text under another element (the centre of each character, hit-tested).
        const covered = () => { for (const e of texts) for (const t of [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())) { let hidden = false; for (let i = 0; i < t.length && !hidden; i++) { if (!/\S/.test(t.textContent[i])) continue; const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); const b = r.getClientRects()[0]; if (!b || !b.width || b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue; for (const px of [b.left + 1, (b.left + b.right) / 2]) { const hit = document.elementFromPoint(px, (b.top + b.bottom) / 2); if (hit && !e.contains(hit) && !hit.contains(e)) hidden = true; } } if (hidden) out.push(['text-covered', label(e)]); } };
        covered(); scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); covered(); scrollTo(0, 0);
        // Content clipped by a box that hides its overflow (a fixed height with overflow: hidden).
        for (const e of document.querySelectorAll('body *')) { if (/^(IMG|INPUT|TEXTAREA|SELECT|VIDEO|IFRAME|PICTURE)$/.test(e.tagName) || srOnly(e)) continue; const cs = getComputedStyle(e), cuts = v => ['hidden', 'clip'].includes(v); if ((cuts(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) || (cuts(cs.overflowX) && e.scrollWidth > e.clientWidth + 1)) out.push(['clipped', label(e)]); }
        // Text outside the viewport sideways that the page cannot scroll to (inside a fixed box, or left of 0).
        const pageScrolls = document.documentElement.scrollWidth > innerWidth + 1;
        const inScroller = e => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(n).overflowX)) return true; return false; };
        for (const e of texts) { if (inScroller(e)) continue; const r = e.getBoundingClientRect(); if (r.left < -0.5 || (!pageScrolls && r.right > innerWidth + 0.5)) out.push(['offscreen', label(e)]); }
        // Text contrast against the nearest opaque background (WCAG 1.4.3: 4.5:1, 3:1 for large text).
        const rgb = v => (v.match(/[\d.]+/g) ?? []).map(Number), lum = ([r, g, b]) => [r, g, b].map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
        for (const e of texts) {
          let bg = null; for (let n = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) === 1) { bg = c; break; } }
          // No background: the canvas Chromium paints (measured): white under the light preference, #121212 under dark
          // when the page declares no color-scheme.
          let canvas = false;
          if (!bg) { const declared = getComputedStyle(document.documentElement).colorScheme; if (declared !== 'normal') continue; bg = matchMedia('(prefers-color-scheme: dark)').matches ? [18, 18, 18] : [255, 255, 255]; canvas = bg[0] === 18; }
          const cs = getComputedStyle(e), fg = rgb(cs.color), [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x), ratio = (a + 0.05) / (b + 0.05);
          const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
          // Against the emulated dark canvas: environment-dependent (whether a dark OS darkens a page with no
          // color-scheme is the browser's choice), reported apart from the component's breaks.
          if (ratio < (large ? 3 : 4.5)) out.push([canvas ? 'env-dark-canvas-contrast' : 'low-contrast', label(e)]);
        }
        // Buttons and links with no accessible name (no text, aria-label, aria-labelledby, title or img alt).
        for (const e of document.querySelectorAll('button, a[href]')) { const named = e.textContent.trim() || e.getAttribute('aria-label')?.trim() || e.getAttribute('aria-labelledby') || e.getAttribute('title')?.trim() || [...e.querySelectorAll('img[alt]')].some(i => i.alt.trim()) || [...e.querySelectorAll('svg title')].some(t => t.textContent.trim()); if (!named) out.push(['no-name', label(e)]); }
        // A control whose visible label is its only way in, but which cannot take focus (Chromium's focus()).
        for (const l of document.querySelectorAll('label[for]')) { const c = document.getElementById(l.htmlFor); if (!c || !l.checkVisibility() || c.disabled) continue; c.focus(); if (document.activeElement !== c) out.push(['unfocusable', label(c)]); c.blur?.(); }
        // A field named only by its placeholder (Chromium's name source), which disappears on input.
        for (const i of document.querySelectorAll('input[placeholder], textarea[placeholder]')) if (i.checkVisibility() && !i.labels?.length && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !i.title) out.push(['placeholder-name', label(i)]);
        // An exposed image with no alt attribute.
        for (const i of document.querySelectorAll('img')) if (!i.hasAttribute('alt') && i.checkVisibility() && !i.closest('[aria-hidden="true"]') && !/^(none|presentation)$/.test(i.getAttribute('role') ?? '')) out.push(['no-alt', label(i)]);
        // An element with an interactive role that cannot take focus (Chromium's focus()), so the keyboard cannot reach it.
        for (const e of document.querySelectorAll('[role="switch"],[role="checkbox"],[role="button"],[role="tab"],[role="slider"],[role="option"],[role="menuitem"],[role="radio"],[role="link"]')) { if (!e.checkVisibility() || e.closest('[aria-hidden="true"]')) continue; const owner = {option: '[role="listbox"]', menuitem: '[role="menu"],[role="menubar"]'}[e.getAttribute('role')]; if (owner && e.parentElement?.closest(owner)) continue; e.focus(); if (document.activeElement !== e) out.push(['unfocusable', label(e)]); e.blur?.(); }
        for (const i of document.querySelectorAll('input[placeholder]')) { const s = getComputedStyle(i), c = document.createElement('canvas').getContext('2d'); c.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; if (c.measureText(i.placeholder).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1) out.push(['placeholder-clipped', label(i)]); }
        return out;
      });
      for (const [kind, box] of found) { const key = `${kind} ${box}`; if (!breaks.has(key)) breaks.set(key, {kind, box, at: []}); const b = breaks.get(key); const where = `${scale}@${width}`; if (!b.at.includes(where)) b.at.push(where); }
    }
  }
  await page.close();
  // A break is caught when lint reports an error or warning on that box (or on the page for page overflow).
  const reported = messages.filter(m => ['error', 'warning'].includes(m.severity));
  const boxOf = m => (m.message.match(/^(?:the start of )?([.#][\w.-]+|[a-z]+@[\w/]+)/) ?? [])[1] ?? '';
  const matches = (b, m) => b.kind === 'page-overflow' || b.kind === 'offscreen' && /E_LAYOUT_TRACKS|PAGE_OVERFLOW|PAGE_CLIPPED/.test(m.code) ? /PAGE_OVERFLOW|REFLOW|PAGE_CLIPPED|E_LAYOUT_TRACKS/.test(m.code) || (/TEXT_RESIZE/.test(m.code) && /viewport|page/.test(m.message)) : boxOf(m) && (b.box === boxOf(m) || b.box.split('.').filter(Boolean).every(c => boxOf(m).includes(c)) || boxOf(m).split('.').filter(Boolean).every(c => b.box.includes(c)));
  const environment = [...breaks.values()].filter(b => b.kind.startsWith('env-')).map(b => `${b.kind} ${b.box} [${b.at.join(' ')}]`);
  for (const [key, b] of breaks) if (b.kind.startsWith('env-')) breaks.delete(key);
  const caught = [], missed = [];
  // Page overflow that a reported content overflow explains (visible text spilling past the viewport) is caught via it.
  for (const b of breaks.values()) {
    if (reported.some(m => matches(b, m))) caught.push(b);
    else if (b.kind === 'page-overflow' && reported.some(m => /E_LAYOUT_CONTENT|E_LAYOUT_ITEM_SIZE/.test(m.code))) caught.push({...b, via: reported.find(m => /E_LAYOUT_CONTENT|E_LAYOUT_ITEM_SIZE/.test(m.code)).code});
    else missed.push(b);
  }
  // An error is confirmed by a break on its box, or by any break at the width its counterexample names (the same
  // root cause seen as a different symptom: a grid's tracks overflowing show as the page scrolling).
  const witnessOf = m => { const w = m.message.match(/at viewport (\d+(?:\.\d+)?)px/)?.[1] && Math.floor(Number(m.message.match(/at viewport (\d+(?:\.\d+)?)px/)[1])); return w ? `${/at 200% text size/.test(m.message) ? '2x' : '1x'}@${w}` : null; };
  const unconfirmed = reported.filter(m => m.severity === 'error' && ![...breaks.values()].some(b => matches(b, m) || (witnessOf(m) && b.at.includes(witnessOf(m)))));
  const notChecked = messages.filter(m => m.severity === 'info' && /not checked/.test(m.message)).map(m => ({code: m.code, reason: m.message.replace(/^not checked: /, '').replace(/\.[\w-]+/g, '.X').replace(/\d+(?:\.\d+)?px/g, 'Npx').slice(0, 160), line: m.line}));
  const expected = meta.expect ?? [];
  const expectedFound = expected.map(code => ({code, found: reported.some(m => m.code === code)}));
  rows.push({id, file: name, framework: meta.framework, intent: meta.intent, status: result.status, expected: expectedFound, caught: caught.map(b => `${b.kind} ${b.box} [${b.at.join(' ')}]${b.via ? ` via ${b.via}` : ''}`), missed: missed.map(b => `${b.kind} ${b.box} [${b.at.join(' ')}]`), silentMissed: result.status === 'unknown' ? [] : missed.map(b => `${b.kind} ${b.box}`), crashed: messages.some(m => m.code === 'W_LINT_ANALYSIS_FAILED'), unconfirmed: unconfirmed.map(m => `${m.code} ${m.message.slice(0, 120)}`), environment, notChecked, errors: reported.filter(m => m.severity === 'error').length, warnings: reported.filter(m => m.severity === 'warning').length, assumptions: messages.filter(m => m.code === 'ASSUMPTION').map(m => m.message)});
}
await browser.close();
const tally = new Map();
for (const r of rows) for (const u of r.notChecked ?? []) tally.set(`${u.code}: ${u.reason}`, (tally.get(`${u.code}: ${u.reason}`) ?? 0) + 1);
const summary = {run: opt.attempt ?? 'before', cases: rows.length, breaks: rows.reduce((n, r) => n + (r.caught?.length ?? 0) + (r.missed?.length ?? 0), 0), caught: rows.reduce((n, r) => n + (r.caught?.length ?? 0), 0), missed: rows.reduce((n, r) => n + (r.missed?.length ?? 0), 0), silentMisses: rows.reduce((n, r) => n + (r.silentMissed?.length ?? 0), 0), analysisFailures: rows.filter(r => r.crashed).map(r => r.id), unconfirmedErrors: rows.reduce((n, r) => n + (r.unconfirmed?.length ?? 0), 0), environment: rows.reduce((n, r) => n + (r.environment?.length ?? 0), 0), clean: rows.filter(r => !r.skipped && !r.errors && !(r.missed?.length) && !(r.caught?.length)).map(r => r.id), skipped: rows.filter(r => r.skipped).map(r => r.id), backlog: [...tally].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({reason, count})), rows};
const out = opt.out ?? join(root, 'evals/results/component-lint', `${summary.run}.json`);
mkdirSync(dirname(out), {recursive: true});
writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({run: summary.run, cases: summary.cases, breaks: summary.breaks, caught: summary.caught, missed: summary.missed, silentMisses: summary.silentMisses, analysisFailures: summary.analysisFailures, unconfirmedErrors: summary.unconfirmedErrors, clean: summary.clean, backlog: summary.backlog.slice(0, 8)}, null, 2));
