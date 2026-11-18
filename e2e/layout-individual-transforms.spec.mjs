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
