// Easing overshoot and layout shifts: a box moves somewhere during the animation (sampled every 5ms of a paused
// animation) exactly where the analysis reports E_LAYOUT_ANIMATION_SHIFT for it, including where only the easing's
// overshoot past the keyframes moves it.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
import {easedFrames} from '../packages/css-verifier/src/layout/animation-extremes.mjs';

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
  // rem keyframes (converted with the root font size), and two properties eased together.
  ['html{font-size:16px}.a{width:6.25rem}@keyframes grow{to{width:8.75rem}}', 'grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite'],
  ['html{font-size:16px}.a{width:6.25rem}@keyframes grow{to{width:8.75rem}}', 'grow 1s linear infinite'],
  ['@keyframes grow{to{width:140px;height:30px}}', 'grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite'],
  ['@keyframes grow{to{width:139px;height:10px}}', 'grow 1s cubic-bezier(0.34, 1.56, 0.64, 1) infinite'],
  // Properties with different keyframes (checklist A4): laid out together at every keyframe and extreme.
  ['@keyframes grow{50%{height:30px}to{width:140px}}', 'grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite'],
  ['@keyframes grow{50%{height:30px}to{width:140px}}', 'grow 1s linear infinite'],
  ['@keyframes grow{from{width:100px;animation-timing-function:cubic-bezier(0.5, -0.5, 0.5, 1.5)}50%{height:30px}to{width:140px}}', 'grow 1s linear infinite'],
  ['@keyframes grow{40%{height:25px}70%{width:139px}to{width:120px}}', 'grow 1s cubic-bezier(0.34, 1.56, 0.64, 1) infinite'],
  ['@keyframes grow{40%{height:25px}70%{width:135px}to{width:120px}}', 'grow 1s cubic-bezier(0.34, 1.56, 0.64, 1) infinite'],
  // Mixed units (checklist A5): 56% of the 250px line is 140px; the overshoot is calc() of px and %.
  ['@keyframes grow{to{width:56%}}', 'grow 1s cubic-bezier(0.5, -0.5, 0.5, 1.5) infinite'],
  ['@keyframes grow{to{width:56%}}', 'grow 1s linear infinite'],
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
  // Each case: the animation's easing and what follows it in the shorthand (delay, count, fill mode: checklist A2).
  for (const easing of ['linear', 'ease', 'cubic-bezier(0.34, 1.56, 0.64, 1)', 'cubic-bezier(0.68, -0.6, 0.32, 1.6)', 'linear(0, 1.2 40%, 0.9 70%, 1)', 'linear 0.3s', 'linear 0.3s backwards', 'linear forwards', 'ease-out 0.2s both', 'linear 2']) {
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
        // Real time from the start of the timeline (the delay included) until after the end, where the fill mode decides
        // what is drawn; each sample is a frame.
        const t = a.effect.getComputedTiming(), end = t.endTime + 50;
        let total = 0, previous = (a.currentTime = 0, rect());
        for (let i = 1; i * 1000 / fps <= end; i++) {
          a.currentTime = i * 1000 / fps;
          const now = rect();
          if (now.x !== previous.x || now.y !== previous.y) {
            const [p, q] = [clip(previous), clip(now)];
            const impact = (area(p) + area(q) - overlap(p, q)) / (W * H), distance = Math.hypot(now.x - previous.x, now.y - previous.y) / Math.max(W, H);
            total += impact * distance;
          }
          previous = now;
        }
        return total;
      }, [fps, width, height]);
      expect(score, `${easing} at ${fps}fps: score ${score} ≤ bound ${limit}`).toBeLessThanOrEqual(limit + 1e-9);
      expect(score, `${easing} at ${fps}fps: the animation moves .b`).toBeGreaterThan(0);
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

// @starting-style with a layout value (checklist A1): .b moves while .a appears (sampled every frame for 350ms after
// load) exactly where the analysis reports a shift of .b — a transition of the property animates it in; without one
// the starting value is never drawn.
test('a transitioned starting value moves what follows while the box appears, exactly where the analysis says', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const html4 = '<div class="page"><div class="a"></div><div class="b"></div></div>';
  const base4 = '*{box-sizing:border-box;margin:0}body,.page{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:40px}.b{height:40px}';
  for (const c of ['.a{transition:height .25s}@starting-style{.a{height:0}}', '@starting-style{.a{height:0}}', '.a{transition:opacity .25s}@starting-style{.a{height:0}}', '.a{transition:height 0s}@starting-style{.a{height:0}}', '.a{transition:all .25s ease-out}@starting-style{.a{height:10px}}', '.a{transition:height .25s}@starting-style{.b{height:0}}']) {
    const css = base4 + c;
    const r = analyzeHTML(`<html lang="en"><body>${html4}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).not.toBe('unknown');
    const reported = r.diagnostics.some(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT' && d.box === '.b');
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html4}</body></html>`, {waitUntil: 'commit'});
    const moved = await page.evaluate(() => new Promise(done => { const seen = new Set(), start = performance.now(); const tick = () => { const b = document.querySelector('.b'); if (b) seen.add(Math.round(b.getBoundingClientRect().top * 64)); if (performance.now() - start < 350) requestAnimationFrame(tick); else done(seen.size > 1); }; tick(); }));
    expect(reported, `${c}: moves in the browser: ${moved}`).toBe(moved);
  }
});

// Scroll-driven animations (checklist A3): .b moves as the page scrolls exactly where the analysis reports a
// scroll-driven shift of it. A browser without scroll-driven animations runs the keyframes on time instead; there the
// analysis must only not miss a move.
test('a scroll-driven layout animation moves what follows as the page scrolls, where the analysis says', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const html5 = '<div class="page"><div class="a"></div><div class="b"></div><div class="tall"></div></div>';
  const base5 = '*{box-sizing:border-box;margin:0}body,.page{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:40px}.b{height:40px}.tall{height:2000px}@keyframes grow{to{height:80px}}@keyframes bar{to{transform:scaleX(0.5)}}';
  await page.setContent('<!doctype html><html lang="en"><body></body></html>');
  const supported = await page.evaluate(() => CSS.supports('animation-timeline: scroll()'));
  for (const c of ['.a{animation:grow linear both}.page .a{animation-timeline:scroll()}', '.a{animation:grow linear both}.page .a{animation-timeline:scroll(root block);animation-range:0% 50%}', '.a{animation:bar linear both}.page .a{animation-timeline:scroll()}']) {
    const css = base5 + c;
    const r = analyzeHTML(`<html lang="en"><body>${html5}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
    expect(r.status, `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).not.toBe('unknown');
    const reported = r.diagnostics.some(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT' && d.box === '.b' && d.scrollDriven);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html5}</body></html>`);
    const moved = await page.evaluate(async () => { const seen = new Set(), max = document.documentElement.scrollHeight - innerHeight; for (let y = 0; y <= max; y += Math.max(1, Math.floor(max / 60))) { scrollTo(0, y); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); seen.add(Math.round((document.querySelector('.b').getBoundingClientRect().top + scrollY) * 64)); } return seen.size > 1; });
    if (supported) expect(reported, `${c}: moves as the page scrolls: ${moved}`).toBe(moved);
    else expect(reported || !moved, `${c}: moves, not reported`).toBe(true);
  }
});

// Checklist A5: between px and % (or vh) the extreme frames are calc() of both units. The browser's height of .a,
// sampled every 1ms, stays inside the frames' range (evaluated against the 200px parent and the viewport) and reaches
// it up to the sampling step.
const mixedCases = [
  [[{offset: 1, layout: 'height:50%'}], 'cubic-bezier(0.5, -0.5, 0.5, 1.5)'],
  [[{offset: 1, layout: 'height:50%'}], 'cubic-bezier(0.34, 1.56, 0.64, 1)'],
  [[{offset: 0, layout: 'height:10%'}, {offset: 1, layout: 'height:80px'}], 'cubic-bezier(0.5, -0.5, 0.5, 1.5)'],
  [[{offset: 1, layout: 'height:30vh'}], 'cubic-bezier(0.5, -0.5, 0.5, 1.5)'],
];
test('mixed-unit extremes bound the browser\'s animated height', async ({page}) => {
  const [W, H] = [400, 300];
  await page.setViewportSize({width: W, height: H});
  const evaluate = text => {
    const m = /^(?:max\(0px, )?calc\((-?[\d.]+)(px|%|vh) ([+-]) ([\d.]+)(px|%|vh)\)\)?$/.exec(text) ?? /^()()()(-?[\d.]+)(px|%|vh)$/.exec(text);
    const amount = (n, u) => Number(n) * (u === '%' ? 2 : u === 'vh' ? H / 100 : 1);
    const v = (m[1] ? amount(m[1], m[2]) : 0) + (m[3] === '-' ? -1 : 1) * amount(m[4], m[5]);
    return text.startsWith('max(') ? Math.max(0, v) : v;
  };
  for (const [frames, easing] of mixedCases) {
    const {frames: all} = easedFrames(frames, {easing, base: {height: '40px'}});
    const model = [40, ...all.map(f => evaluate(f.layout.split(':')[1]))];
    const keyframes = frames.map(f => `${f.offset * 100}%{${f.layout}}`).join('');
    await page.setContent(`<!doctype html><html lang="en"><head><style>*{box-sizing:border-box;margin:0}.p{height:200px}.a{height:40px;animation:grow 1s ${easing} infinite}@keyframes grow{${keyframes}}</style></head><body><div class="p"><div class="a"></div></div></body></html>`);
    const seen = await page.evaluate(() => { const [a] = document.getAnimations(); a.pause(); const hs = []; for (let t = 0; t <= 1000; t += 1) { a.currentTime = Math.min(t, 999.9); hs.push(document.querySelector('.a').getBoundingClientRect().height); } return [Math.min(...hs), Math.max(...hs)]; });
    const label = `${keyframes} ${easing}: model ${Math.min(...model)}..${Math.max(...model)}, browser ${seen}`;
    expect(Math.min(...model), label).toBeLessThanOrEqual(seen[0] + 1 / 64);
    expect(Math.max(...model), label).toBeGreaterThanOrEqual(seen[1] - 1 / 64);
    expect(Math.max(...model) - seen[1], label).toBeLessThan(0.25);
    expect(seen[0] - Math.min(...model), label).toBeLessThan(0.25);
  }
});
