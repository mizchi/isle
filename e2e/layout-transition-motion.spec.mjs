// Checklist E4: prefers-reduced-motion: reduce alone does not shorten a transition (browsers run it as declared), so a
// long moving transition needs a reduce rule: W_A11Y_TRANSITION_MOTION holds exactly where the browser, under reduce,
// still runs a transition of a moving property over 5s.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const base = '*{margin:0}body{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:30px}.s{background:#fff;color:#000}';
const cases = [
  ['.s{transition:transform 6s}', 'transform', 'translateX(10px)'],
  ['.s{transition:transform 6s}@media (prefers-reduced-motion: reduce){.s{transition:none}}', 'transform', 'translateX(10px)'],
  ['.s{transition:transform 6s}@media (prefers-reduced-motion: reduce){.s{transition-duration:0.01s}}', 'transform', 'translateX(10px)'],
  ['.s{transition:all 8s}', 'margin-left', '10px'],
  ['.s{transition:opacity 10s}', 'opacity', '0.5'],
  ['.s{transition:transform 0.3s}', 'transform', 'translateX(10px)'],
];

test('under reduce, the warning holds exactly where a moving transition still runs over 5s', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  for (const [css, property, value] of cases) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body><div class="s"></div></body></html>`);
    const long = await page.evaluate(([property, value]) => {
      const el = document.querySelector('.s'); getComputedStyle(el).getPropertyValue(property);
      el.style.setProperty(property, value);
      return el.getAnimations().some(a => a.effect.getComputedTiming().duration > 5000);
    }, [property, value]);
    const moving = property !== 'opacity';
    const r = analyzeHTML(`<html lang="en"><body><div class="s"></div></body></html>`, {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, accessibility: true});
    const warned = (r.accessibility?.warnings ?? []).some(w => w.code === 'W_A11Y_TRANSITION_MOTION');
    expect(r.status, JSON.stringify(r.diagnostics.map(d => d.message))).not.toBe('unknown');
    expect(warned, `${css}: browser runs a long transition: ${long}`).toBe(long && moving);
  }
});
