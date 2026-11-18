// Easing overshoot and layout shifts: a box moves somewhere during the animation (sampled every 5ms of a paused
// animation) exactly where the analysis reports E_LAYOUT_ANIMATION_SHIFT for it, including where only the easing's
// overshoot past the keyframes moves it.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const html = '<div class="p"><div class="a"></div><div class="b"></div></div>';
const base = '*{box-sizing:border-box;margin:0}body{display:grid;grid-template-columns:minmax(0,1fr)}.p{display:flex;flex-wrap:wrap;width:250px}.a{width:100px;height:20px;flex:none}.b{width:108px;height:20px;flex:none;margin-left:auto}';
const cases = [
  ['@keyframes grow{to{width:140px}}', 'grow 1s linear infinite'],
  ['@keyframes grow{to{width:140px}}', 'grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite'],
  ['@keyframes grow{to{width:140px}}', 'grow 1s cubic-bezier(0.34, 1.56, 0.64, 1) infinite'],
  ['@keyframes grow{to{width:140px}}', 'grow 1s ease-in-out infinite'],
  // Browsers differ: Chromium eases width with the easing of a from keyframe that does not set width, Firefox and
  // WebKit do not. The analysis takes both, so it reports the shift (Chromium's); elsewhere it only must not miss one.
  ['@keyframes grow{from{animation-timing-function:cubic-bezier(0.5, -0.5, 0.5, 1.5)}to{width:140px}}', 'grow 1s linear infinite', 'either'],
  ['@keyframes grow{from{width:100px;animation-timing-function:cubic-bezier(0.5, -0.5, 0.5, 1.5)}to{width:140px}}', 'grow 1s linear infinite'],
  ['@keyframes grow{from{width:120px}50%{width:139px}to{width:120px}}', 'grow 1s cubic-bezier(0.34, 1.56, 0.64, 1) infinite'],
  ['@keyframes grow{from{width:120px}50%{width:135px}to{width:120px}}', 'grow 1s cubic-bezier(0.34, 1.56, 0.64, 1) infinite'],
  ['@keyframes grow{to{width:140px}}', 'grow 1s linear(0, 1.1 50%, 1) infinite'],
  // A list: the second animation overshoots; the first only fades.
  ['@keyframes fade{to{opacity:0.5}}@keyframes grow{to{width:140px}}', 'fade 1s, grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite'],
  ['@keyframes fade{to{opacity:0.5}}@keyframes grow{to{width:140px}}', 'fade 1s, grow 1s linear infinite'],
];

test('.b moves during the animation where the analysis says it shifts', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const [keyframes, animation, either] of cases) {
    const css = `${base}${keyframes}.a{animation:${animation}}`;
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, `${animation}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).not.toBe('unknown');
    const reported = r.diagnostics.some(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT' && d.box === '.b');
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const moved = await page.evaluate(() => { const all = document.getAnimations(); for (const a of all) a.pause(); const tops = new Set(); for (let t = 0; t <= 1000; t += 5) { for (const a of all) a.currentTime = t; const r = document.querySelector('.b').getBoundingClientRect(); tops.add(`${r.left},${r.top}`); } return tops.size > 1; });
    if (either) expect(reported || !moved, `${keyframes} ${animation}: moves in the browser, not reported`).toBe(true);
    else expect(reported, `${keyframes} ${animation}: moves in the browser: ${moved}`).toBe(moved);
  }
});

// The CLS score bound: the Layout Instability score of the frames a browser draws (impact fraction × distance fraction
// per frame, computed here from the rectangles of a paused animation stepped at 30, 60 and 120 frames per second)
// never exceeds the analysis's scoreBound.window, including the jump back to the box's own layout when the animation
// ends (which the bound once left out: measured 0.0135 against 0.0089 for linear). Where only the overshoot moves a
// box, the keyframes alone give no shift at all (the test above).
test('the CLS score of eased animation frames stays under the score bound', async ({page}) => {
  const width = 400, height = 600;
  await page.setViewportSize({width, height});
  const html2 = '<div class="page"><div class="a"></div><div class="b"></div></div>';
  const base2 = '*{box-sizing:border-box;margin:0}body,.page{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:40px}.b{height:40px}@keyframes grow{to{height:80px}}';
  const bound = easing => analyzeHTML(`<html lang="en"><body>${html2}</body></html>`, {name: 'P', css: `${base2}.a{animation:grow 1s ${easing}}`, viewport: {min: width, max: width, height: {min: height, max: height}}}).diagnostics.find(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT')?.scoreBound?.window;
  for (const easing of ['linear', 'ease', 'cubic-bezier(0.34, 1.56, 0.64, 1)', 'cubic-bezier(0.68, -0.6, 0.32, 1.6)', 'linear(0, 1.2 40%, 0.9 70%, 1)']) {
    const limit = bound(easing);
    expect(limit, easing).toBeGreaterThan(0);
    for (const fps of [30, 60, 120]) {
      await page.setContent(`<!doctype html><html lang="en"><head><style>${base2}.a{animation:grow 1s ${easing}}</style></head><body>${html2}</body></html>`);
      const score = await page.evaluate(([fps, W, H]) => {
        const [a] = document.getAnimations(); a.pause();
        const rect = () => { const r = document.querySelector('.b').getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; };
        const clip = r => { const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h); return x1 > x0 && y1 > y0 ? {x0, y0, x1, y1} : null; };
        const area = r => r ? (r.x1 - r.x0) * (r.y1 - r.y0) : 0;
        const overlap = (p, q) => p && q ? area({x0: Math.max(p.x0, q.x0), y0: Math.max(p.y0, q.y0), x1: Math.min(p.x1, q.x1), y1: Math.min(p.y1, q.y1)}.x1 > Math.max(p.x0, q.x0) && Math.min(p.y1, q.y1) > Math.max(p.y0, q.y0) ? {x0: Math.max(p.x0, q.x0), y0: Math.max(p.y0, q.y0), x1: Math.min(p.x1, q.x1), y1: Math.min(p.y1, q.y1)} : null) : 0;
        let total = 0, previous = (a.currentTime = 0, rect());
        for (let i = 1; i * 1000 / fps <= 1000 + 1e-9; i++) {
          a.currentTime = Math.min(1000, i * 1000 / fps) - (i * 1000 / fps >= 1000 ? 0.001 : 0);
          const now = rect();
          if (now.x !== previous.x || now.y !== previous.y) {
            const [p, q] = [clip(previous), clip(now)];
            const impact = (area(p) + area(q) - overlap(p, q)) / (W * H), distance = Math.hypot(now.x - previous.x, now.y - previous.y) / Math.max(W, H);
            total += impact * distance;
          }
          previous = now;
        }
        // The end: the animation finishes and the box returns to its own layout (no fill mode).
        a.cancel(); const end = rect();
        if (end.x !== previous.x || end.y !== previous.y) { const [p, q] = [clip(previous), clip(end)]; total += (area(p) + area(q) - overlap(p, q)) / (W * H) * Math.hypot(end.x - previous.x, end.y - previous.y) / Math.max(W, H); }
        return total;
      }, [fps, width, height]);
      expect(score, `${easing} at ${fps}fps: score ${score} ≤ bound ${limit}`).toBeLessThanOrEqual(limit + 1e-9);
    }
  }
});

// Relative offsets in keyframes: the box itself moves (and nothing else) exactly where the analysis reports it.
test('a relative offset keyframe moves the box where the analysis says, and only it', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const html3 = '<div class="page"><div class="a"></div><div class="b"></div></div>';
  const base3 = '*{box-sizing:border-box;margin:0}body,.page{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:40px}.b{height:40px}';
  for (const c of ['@keyframes n{to{top:12px}}.a{position:relative;animation:n 1s}', '@keyframes n{to{left:-8px}}.a{position:relative;animation:n 1s}', '@keyframes n{to{bottom:5px}}.a{position:relative;animation:n 1s}', '@keyframes n{to{bottom:5px}}.a{position:relative;top:0;animation:n 1s}', '@keyframes n{to{right:6px}}.a{position:relative;left:0;animation:n 1s}', '@keyframes n{from{top:0}to{top:0}}.a{position:relative;animation:n 1s cubic-bezier(0.34, 1.56, 0.64, 1)}', '@keyframes n{to{top:12px}}.a{position:relative;animation:n 1s cubic-bezier(0.34, 1.56, 0.64, 1)}']) {
    const css = base3 + c;
    const r = analyzeHTML(`<html lang="en"><body>${html3}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).not.toBe('unknown');
    const reported = new Set(r.diagnostics.filter(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT').map(d => d.box));
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html3}</body></html>`);
    const moved = await page.evaluate(() => { const [a] = document.getAnimations(); a.pause(); const seen = {'.a': new Set(), '.b': new Set()}; for (let t = 0; t <= 1000; t += 5) { a.currentTime = Math.min(t, 999.9); for (const s of Object.keys(seen)) { const r = document.querySelector(s).getBoundingClientRect(); seen[s].add(`${r.left},${r.top}`); } } return Object.keys(seen).filter(s => seen[s].size > 1); });
    expect([...reported].sort(), c).toEqual(moved.sort());
  }
});
