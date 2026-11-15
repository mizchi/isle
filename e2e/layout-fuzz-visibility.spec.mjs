// Differential fuzzing of "no invisible region": random nested grids with width, height, orientation and resolution
// media branches. For every grid item, at every sampled viewport and pixel ratio, the static check's verdict
// (E_LAYOUT_ITEM_SIZE on that item, in a region holding the viewport) must equal Chromium's: the item's border box
// leaves the grid area it is placed in. A static Unknown case is counted and never taken as agreement.
// The regular run checks 15 seeds; more with FUZZ_SEEDS (150 seeds: 25,528 item × viewport × pixel-ratio verdicts, all
// equal; 4 cases Unknown at the analysis work limit).
//   FUZZ_SEEDS=200 FUZZ_FIRST=1000 npx playwright test -c playwright.layout.config.mjs e2e/layout-fuzz-visibility.spec.mjs
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
import {generateCase, viewports} from './support/visibility-fuzz.mjs';

const seeds = Number(process.env.FUZZ_SEEDS ?? 15), first = Number(process.env.FUZZ_FIRST ?? 1);
const inRange = (range, v) => !range || ((range.minInclusive ? v >= range.min : v > range.min) && (range.maxInclusive ? v <= range.max : v < range.max));
// A diagnostic's region is a convex polygon in (width, height): every constraint a·w + b·h + c ≥ 0 (> 0 when strict)
// holds. Ranges are only its bounding box, which is not enough once a branch compares width with height
// (orientation), so membership is decided on the constraints, in exact fractions.
const frac = t => { const [n, d = '1'] = String(t ?? '0').split('/'); return [BigInt(n), BigInt(d)]; };
const inRegion = (d, w, h) => {
  if (!inRange(d.range, w) || !inRange(d.heightRange, h)) return false;
  for (const k of d.region?.constraints ?? []) {
    const [an, ad] = frac(k.coefficient), [bn, bd] = frac(k.heightCoefficient), [cn, cd] = frac(k.constant);
    // a·w + b·h + c over the common denominator ad·bd·cd (all positive).
    const value = an * BigInt(w) * bd * cd + bn * BigInt(h) * ad * cd + cn * ad * bd;
    if (k.strict ? value <= 0n : value < 0n) return false;
  }
  return true;
};

// The grid area of each item from the parent's resolved tracks (getComputedStyle gives px), gaps and padding, in
// auto placement order (one cell per item, rows by the resolved grid-template-rows).
const measure = () => {
  const px = v => parseFloat(v) || 0, out = {};
  for (const parent of document.querySelectorAll('[class^="c"]')) {
    const s = getComputedStyle(parent), box = parent.getBoundingClientRect();
    if (s.display === 'flex') {
      // A flex container overflows when a shown child leaves its content box (children never shrink here).
      const l = box.left + px(s.borderLeftWidth) + px(s.paddingLeft), t = box.top + px(s.borderTopWidth) + px(s.paddingTop);
      const r = box.right - px(s.borderRightWidth) - px(s.paddingRight), b = box.bottom - px(s.borderBottomWidth) - px(s.paddingBottom), e = 0.02;
      const shown = [...parent.children].filter(k => getComputedStyle(k).display !== 'none');
      out[`flex:${parent.className}`] = {fits: shown.every(k => { const c = k.getBoundingClientRect(); return c.left >= l - e && c.top >= t - e && c.right <= r + e && c.bottom <= b + e; }), shown: true};
      for (const k of parent.children) out[k.className] = {fits: true, shown: getComputedStyle(k).display !== 'none', inFlex: true};
      continue;
    }
    const cols = s.gridTemplateColumns.split(' ').map(px), rows = s.gridTemplateRows.split(' ').map(px);
    const gx = px(s.columnGap), gy = px(s.rowGap), left = box.left + px(s.borderLeftWidth) + px(s.paddingLeft), top = box.top + px(s.borderTopWidth) + px(s.paddingTop);
    const kids = [...parent.children].filter(k => getComputedStyle(k).display !== 'none');
    kids.forEach((k, i) => {
      const col = i % cols.length, row = Math.floor(i / cols.length);
      const x = left + cols.slice(0, col).reduce((a, b) => a + b + gx, 0), y = top + rows.slice(0, row).reduce((a, b) => a + b + gy, 0);
      const area = {x, y, w: cols[col], h: rows[row] ?? 0}, b = k.getBoundingClientRect();
      // Chromium lays out in 1/64 px: a 0.33 px overflow (a 160px item in a 159.67px fr track) is real, so the
      // tolerance only absorbs float noise.
      const e = 0.02, fits = b.left >= area.x - e && b.top >= area.y - e && b.right <= area.x + area.w + e && b.bottom <= area.y + area.h + e;
      out[k.className] = {fits, shown: true};
    });
    for (const k of parent.children) if (getComputedStyle(k).display === 'none') out[k.className] = {fits: true, shown: false};
  }
  return out;
};

// The minmax variant makes more rows (auto-fill packs fewer columns), so more cases hit the auto-row shrink of scroll
// containers, which stays Unknown (U_LAYOUT_GRID_SHRINK): its Unknown share is allowed to be higher.
for (const [title, options, maxUnknown] of [['', {}, 0.2], [' (minmax(px, fr) and auto-fill tracks)', {minmax: true}, 0.4], [' (px margins on grid items)', {margins: true}, 0.2]])
test(`fuzz: no invisible region — static item-fit verdicts agree with Chromium across media, resolution and nesting${title}`, async ({browser}) => {
  test.setTimeout(1_800_000);
  const tally = {cases: 0, unknown: 0, compared: 0, misfits: 0};
  const pages = {};
  for (const dpr of [1, 2]) { const context = await browser.newContext({deviceScaleFactor: dpr}); pages[dpr] = await context.newPage(); }
  for (let seed = first; seed < first + seeds; seed++) {
    const c = generateCase(seed, options);
    tally.cases++;
    const report = analyzeHTML(c.html, {name: 'P', css: c.css, viewport: {min: 320, max: 1024, height: {min: 480, max: 900}}, devicePixelRatios: [1, 2], scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
    if (report.status === 'unknown') { tally.unknown++; continue; }
    // FUZZ_MUTATE=ignore-dpr drops the pixel-ratio split from the static verdict: the harness must then fail (a
    // check of the harness itself).
    const mutate = process.env.FUZZ_MUTATE === 'ignore-dpr';
    const misfit = (id, w, h, dpr) => report.diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.box === `.${id}` && inRegion(d, w, h) && (mutate || d.devicePixelRatio === undefined || d.devicePixelRatio === dpr));
    for (const [w, h] of viewports(c, seed)) for (const dpr of [1, 2]) {
      const page = pages[dpr];
      await page.setViewportSize({width: w, height: h});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${c.css}</style></head><body>${c.body}</body></html>`);
      const browser = await page.evaluate(measure);
      for (const id of [...c.items, ...c.containers.slice(1)]) {
        const seen = browser[id];
        if (!seen) continue;
        const staticMisfit = misfit(id, w, h, dpr), chromeMisfit = seen.shown && !seen.fits;
        tally.compared++; if (chromeMisfit) tally.misfits++;
        expect(staticMisfit, `seed ${seed} .${id} at ${w}×${h}@${dpr}x: static ${staticMisfit}, Chromium ${chromeMisfit}\n${c.css}`).toBe(chromeMisfit);
      }
    }
  }
  console.log(`visibility fuzz: ${JSON.stringify(tally)}`);
  // The generator must exercise both outcomes and stay mostly inside the modeled subset.
  expect(tally.unknown).toBeLessThan(tally.cases * maxUnknown);
  expect(tally.misfits).toBeGreaterThan(0);
  expect(tally.compared - tally.misfits).toBeGreaterThan(0);
});


test('fuzz with flex rows and columns: a flex container overflows in Chromium exactly where the static check finds it does', async ({browser}) => {
  test.setTimeout(1_800_000);
  const tally = {cases: 0, unknown: 0, compared: 0, overflows: 0};
  const page = await (await browser.newContext()).newPage();
  for (let seed = first; seed < first + seeds; seed++) {
    const c = generateCase(seed, {flex: true});
    if (!c.flexContainers.length) continue;
    tally.cases++;
    const report = analyzeHTML(c.html, {name: 'P', css: c.css, viewport: {min: 320, max: 1024, height: {min: 480, max: 900}}, devicePixelRatios: [1], scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
    if (report.status === 'unknown') { tally.unknown++; continue; }
    const childrenOf = id => [...c.body.matchAll(new RegExp(`<div class="${id}">((?:<div class="i\\d+"></div>)*)</div>`, 'g'))].flatMap(m => [...m[1].matchAll(/class="(i\d+)"/g)].map(x => x[1]));
    for (const [w, h] of viewports(c, seed)) {
      await page.setViewportSize({width: w, height: h});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${c.css}</style></head><body>${c.body}</body></html>`);
      const seen = await page.evaluate(measure);
      for (const id of c.flexContainers) {
        const fact = seen[`flex:${id}`];
        if (!fact) continue;
        const kids = childrenOf(id);
        const staticOverflow = report.diagnostics.some(d => inRegion(d, w, h) && ((d.code === 'E_LAYOUT_TRACKS' && d.box === `.${id}`) || (d.code === 'E_LAYOUT_ITEM_SIZE' && kids.some(k => d.box === `.${k}`))));
        tally.compared++; if (!fact.fits) tally.overflows++;
        expect(staticOverflow, `seed ${seed} .${id} at ${w}×${h}: static ${staticOverflow}, Chromium ${!fact.fits}\n${c.css}`).toBe(!fact.fits);
      }
    }
  }
  console.log(`flex visibility fuzz: ${JSON.stringify(tally)}`);
  expect(tally.unknown).toBeLessThan(Math.max(1, tally.cases * 0.2));
  expect(tally.overflows).toBeGreaterThan(0);
  expect(tally.compared - tally.overflows).toBeGreaterThan(0);
});
