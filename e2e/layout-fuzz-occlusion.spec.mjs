// Differential fuzzing of the occluded-target rule: card grids with absolute overlays (insets, %, sizes, z-index,
// pointer-events) and media branches. For every button at every sampled viewport, the static E_A11Y_OCCLUDED (in a
// region holding the viewport) must equal Chromium's hit test: some other element overlapping the button with
// positive area receives the pointer at the centre of that overlap. Unknown cases are counted, never agreement.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
import {generateOcclusionCase} from './support/occlusion-fuzz.mjs';
import {viewports} from './support/visibility-fuzz.mjs';

const seeds = Number(process.env.FUZZ_SEEDS ?? 20), first = Number(process.env.FUZZ_FIRST ?? 1);
const inRange = (range, v) => !range || ((range.minInclusive ? v >= range.min : v > range.min) && (range.maxInclusive ? v <= range.max : v < range.max));
const frac = t => { const [n, d = '1'] = String(t ?? '0').split('/'); return [BigInt(n), BigInt(d)]; };
const inRegion = (d, w, h) => {
  if (!inRange(d.range, w) || !inRange(d.heightRange, h)) return false;
  for (const k of d.region?.constraints ?? []) {
    const [an, ad] = frac(k.coefficient), [bn, bd] = frac(k.heightCoefficient), [cn, cd] = frac(k.constant);
    const value = an * BigInt(w) * bd * cd + bn * BigInt(h) * ad * cd + cn * ad * bd;
    if (k.strict ? value <= 0n : value < 0n) return false;
  }
  return true;
};

test('fuzz: covered buttons — the static occluded-target verdicts agree with Chromium hit testing', async ({page}) => {
  test.setTimeout(1_800_000);
  const tally = {cases: 0, unknown: 0, compared: 0, covered: 0};
  for (let seed = first; seed < first + seeds; seed++) {
    const c = generateOcclusionCase(seed);
    tally.cases++;
    const report = analyzeHTML(c.html, {name: 'P', css: c.css, viewport: {min: 320, max: 1024, height: {min: 480, max: 900}}, accessibility: true});
    // Only the occlusion facts are compared; an Unknown about geometry or occlusion skips the case.
    if (report.diagnostics.some(d => d.severity === 'unknown' && /^U_LAYOUT|U_A11Y_(?:OCCLU|TARGET)/.test(d.code))) { tally.unknown++; continue; }
    for (const [w, h] of viewports(c, seed)) {
      await page.setViewportSize({width: w, height: h});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${c.css}</style></head><body>${c.body}</body></html>`);
      const hits = await page.evaluate(buttons => Object.fromEntries(buttons.map(b => {
        const t = document.querySelector(`.${b}`), tr = t.getBoundingClientRect();
        let covered = false;
        for (const e of document.querySelectorAll('body *')) {
          if (e === t || e.contains(t) || t.contains(e)) continue;
          const er = e.getBoundingClientRect();
          const x0 = Math.max(tr.left, er.left), x1 = Math.min(tr.right, er.right), y0 = Math.max(tr.top, er.top), y1 = Math.min(tr.bottom, er.bottom);
          if (x1 - x0 <= 0.01 || y1 - y0 <= 0.01) continue;
          const at = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
          if (at && at !== t && !t.contains(at) && (at === e || e.contains(at))) { covered = true; break; }
        }
        return [b, covered];
      })), c.buttons);
      for (const b of c.buttons) {
        const staticCovered = report.diagnostics.some(d => d.code === 'E_A11Y_OCCLUDED' && d.box === `.${b}` && inRegion(d, w, h));
        tally.compared++; if (hits[b]) tally.covered++;
        expect(staticCovered, `seed ${seed} .${b} at ${w}×${h}: static ${staticCovered}, Chromium ${hits[b]}\n${c.css}`).toBe(hits[b]);
      }
    }
  }
  console.log(`occlusion fuzz: ${JSON.stringify(tally)}`);
  expect(tally.unknown).toBeLessThan(Math.max(1, tally.cases * 0.25));
  expect(tally.covered).toBeGreaterThan(0);
  expect(tally.compared - tally.covered).toBeGreaterThan(0);
});
