// The individual transform properties: translate, rotate and scale apply before transform, in that order (CSS
// Transforms 2 §6). In each browser, random combinations paint the box where the one transform list
// translate(...) rotate(...) scale(...) <transform> paints it, which is how the analysis composes them
// (packages/css-verifier/test/individual-transforms.test.mjs checks the analysis gives that list's result).
import {test, expect} from '@playwright/test';

let seed = 7;
const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const pick = list => list[rand(list.length)];

test('translate, rotate and scale paint the box where translate · rotate · scale · transform does', async ({page}) => {
  await page.setViewportSize({width: 600, height: 400});
  const cases = [];
  for (let i = 0; i < 60; i++) {
    const tr = pick([null, `${rand(40) - 20}px`, `${rand(40) - 20}px ${rand(40) - 20}px`, `${rand(50)}% ${rand(30)}px`]);
    const ro = pick([null, '90deg', '180deg', '-90deg', '0.25turn', '.5turn', '-100grad']);
    const sc = pick([null, '2', '1.5 0.5', '150%']);
    const tf = pick([null, `translateX(${rand(30)}px)`, 'scale(2)', 'rotate(90deg) translateY(10px)']);
    const individual = [tr && `translate:${tr}`, ro && `rotate:${ro}`, sc && `scale:${sc}`, tf && `transform:${tf}`].filter(Boolean).join(';');
    const list = [tr && `translate(${tr.split(' ').join(',')})`, ro && `rotate(${ro})`, sc && `scale(${sc.split(' ').map(v => v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : v).join(',')})`, tf].filter(Boolean).join(' ') || 'none';
    cases.push([individual, list]);
  }
  await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}.c{position:relative;height:200px}.x{position:absolute;left:200px;top:60px;width:80px;height:30px}</style></head><body>${cases.map(([a, b]) => `<div class="c"><div class="x" style="${a}"></div><div class="x" style="transform:${b}"></div></div>`).join('')}</body></html>`);
  const rects = await page.evaluate(() => [...document.querySelectorAll('.c')].map(c => [...c.children].map(x => { const r = x.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => Math.round(v * 64) / 64); })));
  rects.forEach(([a, b], i) => expect(a, `${cases[i][0]} vs transform: ${cases[i][1]}`).toEqual(b));
});

// Checklist B1: 3D syntax without depth paints the box where its 2D equivalent does, even under a perspective.
test('3D transforms without depth paint the box where their 2D equivalents do', async ({page}) => {
  await page.setViewportSize({width: 600, height: 400});
  const pairs = [
    ['transform:translateZ(0)', 'transform:none'], ['transform:translate3d(10px, 20px, 0)', 'transform:translate(10px, 20px)'],
    ['transform:translate3d(10px, 20px, 0px) scale3d(2, 1, 5)', 'transform:translate(10px, 20px) scale(2, 1)'],
    ['transform:rotateZ(90deg) scaleZ(3)', 'transform:rotate(90deg)'], ['transform:rotate3d(0, 0, 1, 90deg)', 'transform:rotate(90deg)'],
    ['transform:rotate3d(0, 0, -2, 90deg)', 'transform:rotate(-90deg)'], ['translate:10px 20px 0', 'translate:10px 20px'],
    ['rotate:z 90deg', 'rotate:90deg'], ['rotate:0 0 1 90deg', 'rotate:90deg'], ['scale:2 1 4', 'scale:2 1'],
  ];
  for (const perspective of ['', 'perspective:400px;']) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}.c{position:relative;height:160px;${perspective}}.x{position:absolute;left:200px;top:60px;width:80px;height:30px}</style></head><body>${pairs.map(([a, b]) => `<div class="c"><div class="x" style="${a}"></div><div class="x" style="${b}"></div></div>`).join('')}</body></html>`);
    const rects = await page.evaluate(() => [...document.querySelectorAll('.c')].map(c => [...c.children].map(x => { const r = x.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => Math.round(v * 64) / 64); })));
    rects.forEach(([a, b], i) => expect(a, `${perspective} ${pairs[i][0]} vs ${pairs[i][1]}`).toEqual(b));
  }
});

// Checklist B2: an arbitrary rotation composed with translations and scales. Wherever the browser paints the rotated
// box over the next button, the analysis does not claim it covers nothing: it reports a cover or leaves it undecided.
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
test('composed arbitrary rotations: where the browser paints the box over the next one, the analysis does not clear it', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const css = c => `*{margin:0}html,body{${g}}.p{display:grid;grid-template-columns:100px;grid-auto-rows:40px;row-gap:60px;background:#fff;color:#000}.a,.b{border:0;padding:0;background:#ddd;color:#000;width:100px;height:40px}.a{${c}}`;
  const html = '<main class="p"><button class="a" aria-label="A"></button><button class="b" aria-label="B"></button></main>';
  let seed = 11; const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  let overlapping = 0;
  for (let i = 0; i < 40; i++) {
    const angle = `${rand(170) + 5}deg`, ty = `${rand(120) - 20}px`, tx = `${rand(60) - 30}px`, s = [1, 1.2, 0.8, 1.5][rand(4)];
    const c = [`transform:translate(${tx}, ${ty}) rotate(${angle}) scale(${s})`, `transform:rotate(${angle}) translateY(${ty})`, `rotate:${angle};translate:${tx} ${ty};scale:${s}`][rand(3)];
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: css(c), viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, accessibility: true});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css(c)}</style></head><body>${html}</body></html>`);
    const hits = await page.evaluate(() => { const [a, b] = ['.a', '.b'].map(s => document.querySelector(s).getBoundingClientRect()); return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; });
    if (!hits) continue;
    overlapping++;
    const cleared = r.status !== 'unknown' && !r.diagnostics.some(d => /^E_A11Y_(?:OCCLUDED|TARGET_OVERLAP)$/.test(d.code));
    expect(cleared, `${c}: painted over .b in the browser, but the analysis says nothing covers it`).toBe(false);
  }
  expect(overlapping).toBeGreaterThan(3);
});

// Checklist B3: transform-origin. In each browser, the map about an origin O paints the box where the map about the
// centre with the extra translation (I − A)(O − C) does (the formula the analysis uses), for random origins and
// quarter-turn rotations and scales.
test('transform-origin paints the box where the centre map plus (I − A)(O − C) does', async ({page}) => {
  await page.setViewportSize({width: 600, height: 400});
  let seed = 5; const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const W = 80, H = 30, cases = [];
  for (let i = 0; i < 40; i++) {
    const [ox, oy] = [[`${rand(100)}%`, `${rand(100)}%`], [`${rand(120) - 20}px`, `${rand(60) - 10}px`], [['left', 'center', 'right'][rand(3)], ['top', 'center', 'bottom'][rand(3)]]][rand(3)];
    const turn = rand(4), sx = [1, 2, 0.5, 1.5][rand(4)], sy = [1, 2, 0.5][rand(3)];
    const A = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]][turn].map(v => v);
    // A = R·S (rotate then scale in the list order rotate() scale(): the scale applies first).
    const M = [A[0] * sx, A[1] * sy, A[2] * sx, A[3] * sy];
    const px = (v, size) => v.endsWith('%') ? Number(v.slice(0, -1)) / 100 * size : v.endsWith('px') ? Number(v.slice(0, -2)) : { left: 0, top: 0, center: size / 2, right: size, bottom: size }[v];
    const vx = px(ox, W) - W / 2, vy = px(oy, H) - H / 2;
    const dx = (1 - M[0]) * vx - M[1] * vy, dy = -M[2] * vx + (1 - M[3]) * vy;
    const list = `rotate(${turn * 90}deg) scale(${sx}, ${sy})`;
    cases.push([`transform-origin:${ox} ${oy};transform:${list}`, `transform:translate(${dx}px, ${dy}px) ${list}`]);
  }
  await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}.c{position:relative;height:200px}.x{position:absolute;left:250px;top:80px;width:${W}px;height:${H}px}</style></head><body>${cases.map(([a, b]) => `<div class="c"><div class="x" style="${a}"></div><div class="x" style="${b}"></div></div>`).join('')}</body></html>`);
  const rects = await page.evaluate(() => [...document.querySelectorAll('.c')].map(c => [...c.children].map(x => { const r = x.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => Math.round(v * 16) / 16); })));
  rects.forEach(([a, b], i) => expect(a, `${cases[i][0]} vs ${cases[i][1]}`).toEqual(b));
});
