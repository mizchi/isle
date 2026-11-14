// Chromium facts behind docs/cls-evaluation.md: which changes the Layout Instability API reports as layout shifts.
// Each case loads a page, lets it run without input, and sums the layout-shift entries. These are measurements,
// not checks of the static analysis.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mNk+M9Qz0AEYBxVSAAAAP//AwAOfQkB4x7nNgAAAABJRU5ErkJggg==', 'base64'); // 2×1
const square = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'); // 1×1
const observe = `window.__shifts=[];new PerformanceObserver(list=>{for(const e of list.getEntries()) window.__shifts.push({value:e.value,input:e.hadRecentInput})}).observe({type:'layout-shift',buffered:true});`;

async function shifts(page, body, {script = '', wait = 1500, act, width = 800} = {}) {
  await page.setViewportSize({width, height: 600});
  // A 600ms delay makes the image arrive after the first frames; broken.png answers 404 after the same delay.
  await page.route(/\/(?:slow|wide|narrow)\.png$/, async route => { await new Promise(r => setTimeout(r, 600)); await route.fulfill({body: route.request().url().endsWith('/narrow.png') ? square : png, contentType: 'image/png'}); });
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

// The static image checks predict these shifts: E_LAYOUT_IMAGE_* exactly where Chromium reports a layout shift.
test('static image reservation checks agree with Chromium layout shifts', async ({page}) => {
  const css = '*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.i{display:block;width:300px;height:auto}.t{block-size:20px}';
  const images = {'/slow.png': {width: 2, height: 1}};
  for (const attrs of ['', 'width="2" height="1"', 'width="4" height="3"']) {
    const html = `<div class="page"><img class="i" src="/slow.png" alt="" ${attrs}><p class="t">below</p></div>`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 800, max: 800, height: {min: 600, max: 600}}, images, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics)).toBe(false);
    const predicted = report.diagnostics.some(d => /^E_LAYOUT_IMAGE_/.test(d.code));
    const measured = await shifts(page, `<style>${css}</style>${html}`);
    expect(measured.score > 0, `${attrs || 'no attributes'}: static ${predicted}, Chromium ${measured.score}`).toBe(predicted);
  }
});

test('noshift ignores transforms like Chromium layout shifts: a transformed state verifies, a resized one does not', async ({page}) => {
  const {createNoShiftContract} = await import('../packages/css-verifier/src/transitions.mjs');
  const {verifyNoShift} = await import('../packages/css-verifier/src/transitions-node.mjs');
  const viewport = {min: 800, max: 800, height: {min: 600, max: 600}};
  const html = '<main class="page"><div class="card"><div class="inner"></div></div><div class="below"></div></main>';
  const base = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr);padding:8px;row-gap:8px}.card{display:grid;grid-template-columns:minmax(0,1fr);height:100px;padding:10px;background:#ddd}.inner{height:20px;background:#888}.below{height:40px;background:#444}';
  const contract = createNoShiftContract({name: 'State', targets: [['card', 'Page/0'], ['inner', 'Page/0/0'], ['below', 'Page/1']].map(([name, path]) => ({name, before: path, after: path}))});
  for (const [name, after] of [['translate', 'transform:translateY(-4px)'], ['scale', 'transform:scale(0.9)'], ['translate and scale', 'transform:translate(2px,-4px) scale(0.9)'], ['height', 'height:130px'], ['padding', 'padding:20px']]) {
    const before = analyzeHTML(html, {name: 'Page', viewport, css: base, integrity: true});
    const changed = analyzeHTML(html, {name: 'Page', viewport, css: `${base}.card{${after}}`, integrity: true});
    const result = await verifyNoShift(before, changed, contract);
    expect(['verified', 'violated'], `${name}: ${JSON.stringify(result.diagnostics ?? [])}`).toContain(result.status);
    // The same change, made without input after the first frames.
    const measured = await shifts(page, `<style>${base}.card.on{${after}}</style>${html}`, {script: "setTimeout(() => document.querySelector('.card').classList.add('on'), 300)"});
    expect(measured.score > 0, `${name}: noshift ${result.status}, Chromium ${measured.score}`).toBe(result.status === 'violated');
  }
});

test('static :hover layout-shift findings agree with Chromium', async ({page}) => {
  const viewport = {min: 800, max: 800, height: {min: 600, max: 600}};
  const html = '<main class="page"><div class="card"><div class="inner"></div></div><div class="below"></div></main>';
  const base = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr);padding:8px;row-gap:8px}.card{display:grid;grid-template-columns:minmax(0,1fr);height:100px;padding:10px;background:#ddd}.inner{height:20px;background:#888}.below{height:40px;background:#444}';
  // Hover point: inside .card, or inside .below (at y = 8 + 100 + 8 + 20).
  for (const [name, rule, y] of [['taller card', '.card:hover{height:120px}', 50], ['card padding', '.card:hover{padding:14px}', 50], ['card lift', '.card:hover{transform:translateY(-4px)}', 50], ['card paint', '.card:hover{background:#eee}', 50], ['last box grows', '.below:hover{height:60px}', 136], ['last box narrows', '.below:hover{width:50%}', 136]]) {
    const report = analyzeHTML(html, {name: 'Page', viewport, css: base + rule, integrity: true});
    expect(report.status === 'unknown', `${name}: ${JSON.stringify(report.diagnostics)}`).toBe(false);
    const predicted = report.diagnostics.some(d => d.code === 'E_LAYOUT_HOVER_SHIFT');
    const measured = await shifts(page, `<style>${base + rule}</style>${html}`, {act: async p => { await p.mouse.move(700, 590); await p.waitForTimeout(300); await p.mouse.move(400, y); }});
    expect(measured.score > 0, `${name}: static ${predicted}, Chromium ${measured.score}`).toBe(predicted);
  }
});

test('picture: static per-media source reservations agree with Chromium layout shifts', async ({page}) => {
  // wide.png is 2×1 (it matches a 1600×800 reservation), narrow.png 1×1 (it matches the img's 800×800).
  const css = '*{box-sizing:border-box;margin:0;padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}picture{display:grid;grid-template-columns:minmax(0,1fr)}img{display:block;width:100%;height:auto}.t{block-size:20px}';
  const images = {'/wide.png': {width: 2, height: 1}, '/narrow.png': {width: 1, height: 1}};
  const cases = [
    ['sized sources', '<source media="(min-width: 600px)" srcset="/wide.png" width="1600" height="800"><img src="/narrow.png" width="800" height="800" alt="">'],
    ['unsized wide source', '<source media="(min-width: 600px)" srcset="/wide.png"><img src="/narrow.png" width="800" height="800" alt="">'],
  ];
  for (const [name, inner] of cases) for (const width of [800, 400]) {
    const html = `<div class="page"><picture>${inner}</picture><p class="t">below</p></div>`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: width, max: width, height: {min: 600, max: 600}}, images, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}}});
    const predicted = report.diagnostics.some(d => /^E_LAYOUT_IMAGE_/.test(d.code));
    expect(report.diagnostics.filter(d => d.severity === 'unknown'), name).toEqual([]);
    const measured = await shifts(page, `<style>${css}</style>${html}`, {width});
    expect(measured.score > 0, `${name} at ${width}: static ${predicted}, Chromium ${measured.score}`).toBe(predicted);
  }
});

test('device pixel ratio branches: resolution media and density srcset agree with Chromium', async ({browser}) => {
  // a.png is 2×1, b.png 1×1, c.png 4×1: the img reserves 400×200 (2:1), so only a 2:1 candidate keeps it.
  const files = {'/a.png': png, '/b.png': square, '/c.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAAC0lEQVR4nGNoQAMARBEIAeFsWJgAAAAASUVORK5CYII=', 'base64')};
  const images = {'/a.png': {width: 2, height: 1}, '/b.png': {width: 1, height: 1}, '/c.png': {width: 4, height: 1}};
  const css = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}img{display:block;width:400px;height:auto}.b{height:10px;background:#000}@media (min-resolution: 2dppx){.b{height:30px}}@media (max-resolution: 96dpi){.b{width:100px}}';
  const ratios = [1, 1.5, 2, 3];
  for (const srcset of ['/b.png 2x', '/a.png 1x, /c.png 3x', '/b.png 1.5x, /a.png 3x']) {
    const html = `<div class="page"><img src="/a.png" srcset="${srcset}" width="400" height="200" alt=""><div class="b"></div></div>`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 800, max: 800, height: {min: 600, max: 600}}, images, devicePixelRatios: ratios});
    expect(report.diagnostics.filter(d => d.severity === 'unknown'), srcset).toEqual([]);
    for (const ratio of ratios) {
      const context = await browser.newContext({deviceScaleFactor: ratio, viewport: {width: 800, height: 600}});
      const page = await context.newPage();
      await page.route(/\/[abc]\.png$/, async route => { await new Promise(r => setTimeout(r, 600)); await route.fulfill({body: files[new URL(route.request().url()).pathname], contentType: 'image/png'}); });
      await page.route('http://cls.test/', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><script>${observe}</script><style>${css}</style></head><body style="margin:0">${html}</body></html>`}));
      await page.goto('http://cls.test/');
      await page.waitForTimeout(1500);
      const measured = await page.evaluate(() => ({score: window.__shifts.reduce((a, e) => a + e.value, 0), b: [document.querySelector('.b').getBoundingClientRect().width, document.querySelector('.b').getBoundingClientRect().height], src: document.querySelector('img').currentSrc}));
      await context.close();
      const predicted = report.diagnostics.some(d => /^E_LAYOUT_IMAGE_/.test(d.code) && d.devicePixelRatio === ratio);
      expect(measured.score > 0, `${srcset} at ${ratio}x: static ${predicted}, Chromium ${measured.score} (${measured.src})`).toBe(predicted);
      const row = report.sizes.find(r => r.box === '.b' && r.devicePixelRatio === ratio);
      expect([Number(row.inlineSize.constant || 0) + Number(row.inlineSize.coefficient ?? 0) * 800, Number(row.blockSize.constant)], `.b at ${ratio}x`).toEqual(measured.b);
    }
  }
});

test('static animation layout-shift findings agree with Chromium', async ({page}) => {
  const viewport = {min: 800, max: 800, height: {min: 600, max: 600}};
  const html = '<div class="page"><div class="a"></div><div class="b"></div></div>';
  const base = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:40px;background:#ccc}.b{height:40px;background:#444}';
  for (const [name, rule] of [
    ['margin-top', '@keyframes m{from{margin-top:0}to{margin-top:100px}}.a{animation:m .5s infinite}'],
    ['margin-left', '@keyframes m{to{margin-left:50px}}.a{animation:m .5s infinite alternate}'],
    ['transform', '@keyframes m{from{transform:translateY(0)}to{transform:translateY(100px)}}.a{animation:m .5s infinite}'],
    ['height of the first box', '@keyframes m{from{height:40px}to{height:80px}}.a{animation:m .5s infinite}'],
    ['height of the last box', '@keyframes m{from{height:40px}to{height:80px}}.b{animation:m .5s infinite}'],
    ['width from the start edge', '@keyframes m{50%{width:50%}}.a{animation:m .5s infinite}'],
    ['padding', '@keyframes m{to{padding-top:20px}}.a{animation:m .5s infinite}'],
  ]) {
    const report = analyzeHTML(html, {name: 'Page', viewport, css: base + rule});
    expect(report.status === 'unknown', `${name}: ${JSON.stringify(report.diagnostics)}`).toBe(false);
    const predicted = report.diagnostics.some(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT');
    const measured = await shifts(page, `<style>${base + rule}</style>${html}`);
    expect(measured.score > 0, `${name}: static ${predicted}, Chromium ${measured.score}`).toBe(predicted);
  }
});
