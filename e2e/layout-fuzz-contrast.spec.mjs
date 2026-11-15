// Differential fuzzing of text contrast: nested opaque/translucent backgrounds, group opacity, translucent text,
// large and normal text, and media branches on width and prefers-color-scheme. Chromium's side is measured in
// pixels: a probe painted with currentColor inside the text gives the effective text colour (through every opacity
// group), and the same point with the probe and text hidden gives the backdrop. Per text box, viewport and scheme
// the static E_A11Y_CONTRAST verdict must equal the pixel ratio's (and its ratio agree within rounding); cases within
// 0.1 of the threshold, where 8-bit pixels cannot decide, are counted and skipped.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
import {generateContrastCase} from './support/contrast-fuzz.mjs';
import {viewports} from './support/visibility-fuzz.mjs';

const seeds = Number(process.env.FUZZ_SEEDS ?? 20), first = Number(process.env.FUZZ_FIRST ?? 1);
const inRange = (range, v) => !range || ((range.minInclusive ? v >= range.min : v > range.min) && (range.maxInclusive ? v <= range.max : v < range.max));
const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('fuzz: text contrast — static verdicts and ratios agree with Chromium pixels across nesting, opacity and schemes', async ({page}) => {
  test.setTimeout(1_800_000);
  const tally = {cases: 0, unknown: 0, compared: 0, failing: 0, nearThreshold: 0};
  const pixel = async (x, y) => [...await page.evaluate(async data => { const i = new Image(); i.src = `data:image/png;base64,${data}`; await i.decode(); const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return [...g.getImageData(0, 0, 1, 1).data]; }, (await page.screenshot({clip: {x, y, width: 1, height: 1}})).toString('base64'))].slice(0, 3);
  for (let seed = first; seed < first + seeds; seed++) {
    const c = generateContrastCase(seed);
    tally.cases++;
    const boxes = Object.fromEntries(c.texts.map(t => [`.${t}`, {minInlineSize: 40, intrinsicBlockSize: 24}]));
    const report = analyzeHTML(c.html, {name: 'P', css: c.css, viewport: {min: 320, max: 1024, height: {min: 480, max: 900}}, accessibility: true, boxes});
    // A geometry Unknown skips the case; a contrast Unknown (group opacity, a background image) skips that text only.
    if (report.diagnostics.some(d => d.severity === 'unknown' && /^U_LAYOUT/.test(d.code))) { tally.unknown++; continue; }
    const unknownText = new Set(report.diagnostics.filter(d => d.code === 'U_A11Y_CONTRAST').map(d => d.box));
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({colorScheme: scheme});
      for (const [w, h] of viewports(c, seed)) {
        await page.setViewportSize({width: w, height: h});
        const probe = '<i class="probe" style="display:inline-block;width:6px;height:6px;background:currentColor;vertical-align:top"></i>';
        await page.setContent(`<!doctype html><html lang="en"><head><style>${c.css}</style></head><body>${c.body.replace(/(<p class="t\d+">)/g, `$1${probe}`)}</body></html>`);
        const at = await page.evaluate(texts => Object.fromEntries(texts.map(t => { const p = document.querySelector(`.${t} .probe`).getBoundingClientRect(); return [t, [Math.floor(p.x + 3), Math.floor(p.y + 3)]]; })), c.texts);
        const fg = {}; for (const t of c.texts) fg[t] = await pixel(...at[t]);
        await page.addStyleTag({content: '.probe{visibility:hidden}[class^="t"]{color:transparent!important}'});
        for (const t of c.texts) {
          const bg = await pixel(...at[t]);
          const measured = ratio(fg[t], bg);
          const style = await page.evaluate(t => { const s = getComputedStyle(document.querySelector(`.${t}`)); return [parseFloat(s.fontSize), Number(s.fontWeight)]; }, t);
          const required = style[0] >= 24 || (style[0] >= 18.66 && style[1] >= 700) ? 3 : 4.5;
          // The static check judges the dark scheme separately only where a prefers-color-scheme rule exists; without
          // one the page (and Chromium's emulation) is the light scheme.
          const darkJudged = scheme === 'dark' && /prefers-color-scheme:\s*dark/.test(c.css);
          // A dark finding equal to the light one is kept once, on the light finding, with alsoUnder.
          const under = d => darkJudged ? d.preference === 'prefers-color-scheme: dark' || (!d.preference && d.alsoUnder?.includes('prefers-color-scheme: dark')) : !d.preference;
          const d = report.diagnostics.find(d => d.code === 'E_A11Y_CONTRAST' && d.box === `.${t}` && under(d) && inRange(d.range, w) && inRange(d.heightRange, h));
          if (unknownText.has(`.${t}`)) { tally.unknownTexts = (tally.unknownTexts ?? 0) + 1; continue; }
          if (Math.abs(measured - required) < 0.1) { tally.nearThreshold++; continue; }
          tally.compared++; if (measured < required) tally.failing++;
          const label = `seed ${seed} .${t} ${scheme} at ${w}×${h}: pixels ${measured.toFixed(2)}:1 (fg ${fg[t]} bg ${bg}), static ${d ? d.ratio.toFixed(2) + ':1' : 'pass'}, required ${required}\n${c.css}`;
          expect(Boolean(d), label).toBe(measured < required);
          if (d) expect(Math.abs(d.ratio - measured), label).toBeLessThan(0.15);
        }
      }
    }
  }
  console.log(`contrast fuzz: ${JSON.stringify(tally)}`);
  expect(tally.unknown).toBeLessThan(Math.max(1, tally.cases * 0.3));
  expect(tally.failing).toBeGreaterThan(0);
  expect(tally.compared - tally.failing).toBeGreaterThan(0);
});
