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
    const ro = pick([null, '90deg', '180deg', '-90deg', '0.25turn']);
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
