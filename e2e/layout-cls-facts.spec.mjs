// Chromium facts behind docs/cls-evaluation.md: which changes the Layout Instability API reports as layout shifts.
// Each case loads a page, lets it run without input, and sums the layout-shift entries. These are measurements,
// not checks of the static analysis.
import {test, expect} from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mNk+M9Qz0AEYBxVSAAAAP//AwAOfQkB4x7nNgAAAABJRU5ErkJggg==', 'base64'); // 2×1
const observe = `window.__shifts=[];new PerformanceObserver(list=>{for(const e of list.getEntries()) window.__shifts.push({value:e.value,input:e.hadRecentInput})}).observe({type:'layout-shift',buffered:true});`;

async function shifts(page, body, {script = '', wait = 1500, act} = {}) {
  await page.setViewportSize({width: 800, height: 600});
  // A 600ms delay makes the image arrive after the first frames; broken.png answers 404 after the same delay.
  await page.route('**/slow.png', async route => { await new Promise(r => setTimeout(r, 600)); await route.fulfill({body: png, contentType: 'image/png'}); });
  await page.route('**/broken.png', async route => { await new Promise(r => setTimeout(r, 600)); await route.fulfill({status: 404, body: 'x'}); });
  await page.route('http://cls.test/', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><script>${observe}</script></head><body style="margin:0">${body}<script>${script}</script></body></html>`}));
  await page.goto('http://cls.test/');
  if (act) await act(page);
  await page.waitForTimeout(wait);
  const entries = await page.evaluate(() => window.__shifts);
  return {count: entries.length, score: entries.filter(e => !e.input).reduce((a, e) => a + e.value, 0), input: entries.some(e => e.input)};
}

test('CSS animations: transform is never a layout shift, a margin animation shifts every frame', async ({page}) => {
  const box = 'height:50px;background:red';
  expect((await shifts(page, `<style>@keyframes t{from{transform:translateY(0)}to{transform:translateY(100px)}}#a{animation:t .5s infinite;${box}}</style><div id=a></div><p>text</p>`)).count).toBe(0);
  const margin = await shifts(page, `<style>@keyframes m{from{margin-top:0}to{margin-top:100px}}#a{animation:m .5s infinite;${box}}</style><div id=a></div><p>text</p>`);
  expect(margin.count).toBeGreaterThan(10);
  expect(margin.score).toBeGreaterThan(0.05);
});

test('a :hover layout change is a layout shift (hover is not an input that excuses it)', async ({page}) => {
  const hover = await shifts(page, '<style>#h{height:40px;background:#ccc}#h:hover{height:80px}</style><div id=h></div><p>below</p>', {act: async p => { await p.waitForTimeout(300); await p.mouse.move(10, 10); }});
  expect(hover.count).toBeGreaterThan(0);
  expect(hover.input).toBe(false);
});

test('images: width/height attributes reserve the box; an unsized picture source does not', async ({page}) => {
  expect((await shifts(page, '<img src="/slow.png" style="width:200px"><p>below</p>')).score).toBeGreaterThan(0);
  expect((await shifts(page, '<img src="/slow.png" width=2 height=1 style="width:200px;height:auto"><p>below</p>')).count).toBe(0);
  // The source's own ratio (2:1) replaces the img's (1:1) when it loads, unless the source declares width/height.
  expect((await shifts(page, '<picture><source media="(min-width: 1px)" srcset="/slow.png"><img src="/slow.png" width=1 height=1 style="width:200px;height:auto"></picture><p>below</p>')).score).toBeGreaterThan(0);
  expect((await shifts(page, '<picture><source media="(min-width: 1px)" srcset="/slow.png" width=2 height=1><img src="/slow.png" width=1 height=1 style="width:200px;height:auto"></picture><p>below</p>')).count).toBe(0);
});

test('image fallback: an inline img with alt text that fails shifts even when sized; a block one keeps its box', async ({page}) => {
  expect((await shifts(page, '<img src="/broken.png" width=2 height=1 alt="alt text" style="width:200px;height:auto"><p>below</p>')).score).toBeGreaterThan(0);
  expect((await shifts(page, '<img src="/broken.png" alt="alt text" style="width:200px;height:100px"><p>below</p>')).score).toBeGreaterThan(0);
  expect((await shifts(page, '<img src="/broken.png" width=2 height=1 alt="alt text" style="display:block;width:200px;height:auto"><p>below</p>')).count).toBe(0);
});

test('carousels: scrolling and transform tracks never shift; margin tracks and variable-height slides do', async ({page}) => {
  const slides = (n, fixed) => Array.from({length: n}, (_, i) => `<div class="s${i === 0 ? ' on' : ''}" style="height:${fixed ? 100 : i % 2 ? 150 : 100}px">${i}</div>`).join('');
  const track = '.v{overflow:hidden;width:300px}.t{display:flex}.s{flex:none;width:300px;background:#ddd}';
  const advance = property => `let i=0;setInterval(()=>{i=(i+1)%3;document.getElementById('t').style.${property}},300)`;
  expect((await shifts(page, `<style>.c{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;width:300px}.s{flex:none;width:300px;scroll-snap-align:start;background:#ddd}</style><div class=c id=c>${slides(3, true)}</div><p>below</p>`, {script: `setInterval(()=>{const c=document.getElementById('c');c.scrollTo({left:(c.scrollLeft+300)%900})},300)`, wait: 2000})).count).toBe(0);
  expect((await shifts(page, `<style>${track}</style><div class=v><div class=t id=t>${slides(3, true)}</div></div><p>below</p>`, {script: advance("transform='translateX(-'+i*300+'px)'"), wait: 2000})).count).toBe(0);
  expect((await shifts(page, `<style>${track}</style><div class=v><div class=t id=t>${slides(3, true)}</div></div><p>below</p>`, {script: advance("marginLeft='-'+i*300+'px'"), wait: 2000})).score).toBeGreaterThan(0.05);
  expect((await shifts(page, `<style>.s{width:300px;background:#ddd}.s:not(.on){display:none}</style><div>${slides(3, false)}</div><p>below</p>`, {script: `let i=0;setInterval(()=>{const s=[...document.querySelectorAll('.s')];s[i].classList.remove('on');i=(i+1)%3;s[i].classList.add('on')},300)`, wait: 2000})).score).toBeGreaterThan(0);
});
