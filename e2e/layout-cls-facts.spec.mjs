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
  const bounds = [];
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
    // The static score bound holds over Chromium's score of the hover frame.
    const bound = Math.max(0, ...report.diagnostics.filter(d => d.code === 'E_LAYOUT_HOVER_SHIFT').map(d => d.scoreBound));
    expect(measured.score, `${name}: bound ${bound}`).toBeLessThanOrEqual(bound + 1e-9);
    if (predicted) bounds.push([name, measured.score, bound]);
  }
  console.log('hover score vs bound', JSON.stringify(bounds));
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

test('static carousel slide-switch findings agree with Chromium layout shifts', async ({page}) => {
  const viewport = {min: 800, max: 800, height: {min: 600, max: 600}};
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const base = `*{box-sizing:border-box;margin:0}.page{${g}}.c{${g}}.s1{height:100px;background:#ccc}.s2{height:150px;background:#999}.below{height:40px;background:#444}`;
  const carousel = slides => `<div class="page"><section class="c" aria-roledescription="carousel" aria-label="News">${slides}</section><div class="below"></div></div>`;
  const hiddenSlides = carousel('<div class="s1" aria-roledescription="slide"></div><div class="s2" aria-roledescription="slide" hidden></div>');
  const classSlides = carousel('<div class="s1 slide is-active" aria-roledescription="slide"></div><div class="s2 slide" aria-roledescription="slide"></div>');
  const toggleHidden = "setTimeout(() => { const [a, b] = document.querySelectorAll('[aria-roledescription=slide]'); a.hidden = true; b.hidden = false; }, 300)";
  const toggleClass = "setTimeout(() => { const [a, b] = document.querySelectorAll('[aria-roledescription=slide]'); a.classList.remove('is-active'); b.classList.add('is-active'); }, 300)";
  for (const [name, html, css, script] of [
    ['hidden, different heights', hiddenSlides, '', toggleHidden],
    ['hidden, fixed carousel height', hiddenSlides, '.c{height:160px}', toggleHidden],
    ['class, display none', classSlides, '.slide{display:none}.is-active{display:grid}', toggleClass],
    ['class, stacked in one cell', classSlides, '.slide{grid-row:1;grid-column:1;visibility:hidden}.is-active{visibility:visible}', toggleClass],
  ]) {
    const report = analyzeHTML(html, {name: 'Page', viewport, css: base + css});
    expect(report.status === 'unknown', `${name}: ${JSON.stringify(report.diagnostics)}`).toBe(false);
    const predicted = report.diagnostics.some(d => d.code === 'E_LAYOUT_CAROUSEL_SHIFT');
    const measured = await shifts(page, `<style>${base + css}</style>${html}`, {script});
    expect(measured.score > 0, `${name}: static ${predicted}, Chromium ${measured.score}`).toBe(predicted);
    const bound = Math.max(0, ...report.diagnostics.filter(d => d.code === 'E_LAYOUT_CAROUSEL_SHIFT').map(d => d.scoreBound));
    expect(measured.score, `${name}: bound ${bound}`).toBeLessThanOrEqual(bound + 1e-9);
    if (predicted) console.log('carousel score vs bound', name, measured.score, bound);
  }
});

test('font swap warnings: text whose box follows the web font shifts in Chromium; warned-free cases do not', async ({page}) => {
  const {readFileSync} = await import('node:fs');
  const roboto = readFileSync(new URL('../packages/css-verifier/text-metrics/fixtures/roboto-variable.ttf', import.meta.url));
  await page.route('**/roboto.ttf', async route => { await new Promise(r => setTimeout(r, 700)); await route.fulfill({body: roboto, contentType: 'font/ttf'}); });
  const viewport = {min: 800, max: 800, height: {min: 600, max: 600}};
  const face = display => `@font-face{font-family:Roboto;src:url(/roboto.ttf);font-display:${display}}`;
  const base = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.t{font-family:Roboto,sans-serif;font-size:40px}.b{height:40px;background:#444}';
  const results = [];
  for (const [name, css, html] of [
    // Three lines at line-height normal: 45px (fallback) against 47px (Roboto) a line, 6px in all (Chromium ignores
    // moves under 3px).
    ['swap, line-height normal', face('swap') + base + '.t{width:260px}', '<div class="page"><p class="t">Hello wide world again</p><div class="b"></div></div>'],
    ['swap, px line-height, one line', face('swap') + base + '.t{line-height:48px;white-space:nowrap}', '<div class="page"><p class="t">Hello world</p><div class="b"></div></div>'],
    ['optional, line-height normal', face('optional') + base, '<div class="page"><p class="t">Hello world</p><div class="b"></div></div>'],
    ['swap, px line-height, wrapping', face('swap') + base + '.t{line-height:48px;width:260px}', '<div class="page"><p class="t">Hello wide world</p><div class="b"></div></div>'],
  ]) {
    const report = analyzeHTML(html, {name: 'Page', viewport, css, boxes: {'.t': {minInlineSize: 300, intrinsicBlockSize: 48}}});
    expect(report.status === 'unknown', `${name}: ${JSON.stringify(report.diagnostics)}`).toBe(false);
    const warned = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_FONT_SWAP');
    // The page must not wait for the font: route it after first paint by measuring without waiting for load.
    const measured = await shifts(page, `<style>${css}</style>${html}`, {wait: 2000});
    results.push([name, warned, measured.score]);
    // Sound direction: no warning means no shift.
    if (!warned) expect(measured.score, `${name}: no warning, Chromium ${measured.score}`).toBe(0);
  }
  console.log('font swap', JSON.stringify(results));
  // line-height normal follows the font's metrics: that warned case shifts with this font pair.
  expect(results[0][1] && results[0][2] > 0, JSON.stringify(results)).toBe(true);
});

test('lazy images in the initial viewport: the static warning region agrees with Chromium geometry', async ({page}) => {
  const css = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.sp{height:700px}img{display:block;width:100%;height:auto}';
  const html = '<div class="page"><div class="sp"></div><img src="/slow.png" width="400" height="200" loading="lazy" alt=""></div>';
  const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 320, max: 1280, height: {min: 500, max: 1000}}});
  const warnings = (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_LAZY_IN_VIEWPORT');
  expect(warnings.length).toBe(1);
  for (const [width, height] of [[320, 600], [800, 699], [800, 701], [1280, 1000]]) {
    await page.setViewportSize({width, height});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body style="margin:0">${html}</body></html>`);
    const visible = await page.evaluate(() => { const r = document.querySelector('img').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    // The warning region (rational constraints over W, H) contains the point exactly when Chromium shows the image.
    const inside = warnings.some(w => w.range.min <= width && width <= w.range.max && (w.region?.constraints ?? []).every(c => { const v = s => { const [n, d = '1'] = String(s ?? '0').split('/'); return Number(n) / Number(d); }; const value = v(c.coefficient) * width + v(c.heightCoefficient) * height + v(c.constant); return c.strict ? value > 0 : value >= 0; }) && w.heightRange.min <= height && height <= w.heightRange.max);
    expect(inside, `${width}×${height}: static ${inside}, Chromium ${visible}`).toBe(visible);
  }
});

test('video: width/height attributes and aspect-ratio reserve the box like Chromium; an unreserved video shifts', async ({page}) => {
  const css = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}video{display:block;width:100%;height:auto;background:#000}.b{height:40px;background:#444}.r{aspect-ratio:4/3}';
  const viewport = {min: 800, max: 800, height: {min: 600, max: 2000}};
  for (const [name, attrs] of [['attributes', 'width="1600" height="900"'], ['css ratio', 'class="r"']]) {
    const html = `<div class="page"><video src="/none.mp4" ${attrs} muted></video><div class="b"></div></div>`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport});
    expect(report.status === 'unknown', `${name}: ${JSON.stringify(report.diagnostics)}`).toBe(false);
    await page.setViewportSize({width: 800, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body style="margin:0">${html}</body></html>`);
    const browser = await page.evaluate(() => document.querySelector('video').getBoundingClientRect().height);
    const row = report.sizes.find(r => r.path === 'Page/0' && r.rect);
    expect(Number(row.rect.blockSize.constant) + 800 * Number(eval(row.rect.blockSize.coefficient ?? '0')), name).toBeCloseTo(browser, 2);
  }
  // Without a reservation the static analysis is Unknown (the natural size arrives with the metadata).
  expect(analyzeHTML('<div class="page"><video src="/none.mp4" muted></video><div class="b"></div></div>', {name: 'Page', css, viewport}).status).toBe('unknown');
});

test('sticky boxes without room in their parent never stick, as the static warning says', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const css = `*{box-sizing:border-box;margin:0}html,body{${g}}.page{${g}}.h{position:sticky;top:0;height:50px;background:#fff}.w{${g}}.tall{${g};height:300px}.c{height:2000px}.hid{${g};overflow:hidden}`;
  for (const [name, body] of [
    ['wrapped in its own height', '<div class="page"><div class="w"><header class="h"></header></div><div class="c"></div></div>'],
    ['a child of the scrolling content', '<div class="page"><header class="h"></header><div class="c"></div></div>'],
    ['in a 300px section', '<div class="page"><section class="tall"><header class="h"></header></section><div class="c"></div></div>'],
    ['inside an overflow: hidden page', '<div class="page" style=""><div class="hid"><header class="h"></header><div class="c"></div></div></div>'],
  ]) {
    const report = analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: 800, max: 800, height: {min: 600, max: 600}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], integrity: true, ...(body.includes('hid') ? {boxes: {'.hid': {overflow: 'clip', overflowBlock: 'clip'}}} : {})});
    const warned = (report.layoutWarnings ?? []).some(w => ['W_LAYOUT_STICKY_INERT', 'W_LAYOUT_STICKY_SCROLLER'].includes(w.code));
    await page.setViewportSize({width: 800, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${body}</body></html>`);
    // Scroll a little (the header would stick at 0 if it could) and read its top.
    const top = await page.evaluate(async () => { scrollTo(0, 100); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return document.querySelector('.h').getBoundingClientRect().top; });
    expect(warned, `${name}: static ${warned}, Chromium top after scrolling 100px: ${top}`).toBe(top < 0);
  }
});

test('sizes narrower than the layout width: the static warning agrees with the file Chromium picks', async ({page}) => {
  await page.route(/\/w\d+\.png$/, route => route.fulfill({body: png, contentType: 'image/png'}));
  const srcset = Array.from({length: 200}, (_, i) => `/w${(i + 1) * 10}.png ${(i + 1) * 10}w`).join(', ');
  const css = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}img{display:block;width:100%;height:auto}@media (min-width:900px){.page{grid-template-columns:600px}}';
  for (const sizes of ['50vw', '100vw', '(min-width: 900px) 500px, 100vw', '(min-width: 900px) 600px, 100vw', 'calc(100vw - 40px)']) {
    const html = `<div class="page"><img src="/w400.png" srcset="${srcset}" sizes="${sizes}" width="400" height="200" alt=""></div>`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 320, max: 1280}});
    for (const width of [400, 800, 1000, 1280]) {
      await page.setViewportSize({width, height: 600});
      await page.route('http://sizes.test/', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><style>${css}</style></head><body style="margin:0">${html}</body></html>`}));
      await page.goto('http://sizes.test/');
      await page.unroute('http://sizes.test/');
      const {picked, rendered} = await page.evaluate(async () => { const i = document.querySelector('img'); await i.decode().catch(() => {}); return {picked: Number(/w(\d+)\.png/.exec(i.currentSrc)[1]), rendered: i.getBoundingClientRect().width}; });
      const warned = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_SIZES_SMALL' && width >= w.range.min && width <= w.range.max && !(width === w.range.max && !w.range.maxInclusive) && !(width === w.range.min && !w.range.minInclusive));
      expect(warned, `${sizes} at ${width}: static ${warned}, Chromium picked ${picked}w for ${rendered}px`).toBe(picked < rendered);
    }
  }
});

test('srcset without sizes: the static warning holds exactly where Chromium downloads a file at least twice as wide as the image', async ({page}) => {
  await page.route(/\/w\d+\.png$/, route => route.fulfill({body: png, contentType: 'image/png'}));
  const srcset = Array.from({length: 200}, (_, i) => `/w${(i + 1) * 10}.png ${(i + 1) * 10}w`).join(', ');
  for (const cols of ['minmax(0,1fr)', 'repeat(3,minmax(0,1fr))', '300px minmax(0,1fr)', 'minmax(0,1fr) minmax(0,1fr)']) {
    const css = `*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:${cols}}img{display:block;width:100%;height:auto}`;
    const html = `<div class="page"><img src="/w400.png" srcset="${srcset}" width="400" height="200" alt=""></div>`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 320, max: 1280}});
    for (const width of [400, 500, 700, 1000, 1280]) {
      await page.setViewportSize({width, height: 600});
      await page.route('http://sizes.test/', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><style>${css}</style></head><body style="margin:0">${html}</body></html>`}));
      await page.goto('http://sizes.test/');
      await page.unroute('http://sizes.test/');
      const {picked, rendered} = await page.evaluate(async () => { const i = document.querySelector('img'); await i.decode().catch(() => {}); return {picked: Number(/w(\d+)\.png/.exec(i.currentSrc)[1]), rendered: i.getBoundingClientRect().width}; });
      const warned = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_SIZES_MISSING' && width >= w.range.min && width <= w.range.max);
      expect(warned, `${cols} at ${width}: static ${warned}, Chromium picked ${picked}w for ${rendered}px`).toBe(picked >= 2 * rendered);
    }
  }
});

test('grid-area with a name the template does not define: where the static check warns, Chromium puts the item outside the explicit grid', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const grid = '.p{display:grid;grid-template-columns:200px 300px;grid-template-areas:"head head" "nav main";grid-template-rows:40px 40px}';
  for (const [css, warn] of [['.h{grid-area:header}', true], ['.h{grid-area:head}', false], ['.h{grid-column:Head;grid-row:Head}', true]]) {
    const html = '<div class="p"><header class="h"></header><nav class="n"></nav><main class="m"></main></div>';
    const all = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}${grid}.n{grid-area:nav}.m{grid-area:main}${css}`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: all, viewport: {min: 600, max: 800, height: {min: 600, max: 900}}});
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_GRID_AREA_UNKNOWN' && w.box === '.h'), css).toBe(warn);
    if (!warn) expect(report.status, css).toBe('verified');
    await page.setViewportSize({width: 700, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${all}</style></head><body>${html}</body></html>`);
    const r = await page.evaluate(() => { const b = document.querySelector('.h').getBoundingClientRect(); return {x: b.x, y: b.y}; });
    // The explicit grid is 500px × 80px: an item on implicit lines starts at or past one of its ends.
    expect(r.x >= 500 || r.y >= 80, `${css}: .h at ${r.x},${r.y}`).toBe(warn);
  }
});

test('container queries that never match: where the static check warns, the rule applies at no width in Chromium', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const html = '<div class="p"><div class="w"><div class="c"></div></div></div>';
  for (const [css, warn] of [
    ['@container (min-width: 400px){.c{height:30px}}', true],
    ['.w{container-type:inline-size;container-name:side}@container card (min-width: 400px){.c{height:30px}}', true],
    ['.p{grid-template-columns:300px}.w{container-type:inline-size}@container (min-width: 400px){.c{height:30px}}', true],
    ['.w{container-type:inline-size}@container (min-width: 400px){.c{height:30px}}', false],
    ['.w{container-type:inline-size;container-name:card}@container card (max-width: 500px){.c{height:30px}}', false],
  ]) {
    const all = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.p{${g}}.w{${g}}.c{height:10px}${css}`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: all, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect(report.status, css).toBe('verified');
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_CSS_CONTAINER_QUERY_NEVER'), css).toBe(warn);
    let applied = false;
    for (const width of [320, 450, 640, 800]) {
      await page.setViewportSize({width, height: 700});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${all}</style></head><body>${html}</body></html>`);
      if (await page.evaluate(() => document.querySelector('.c').getBoundingClientRect().height) === 30) applied = true;
    }
    expect(applied, `${css}: the rule applies at some width`).toBe(!warn);
  }
});

test('picture sources: a source the static check reports as shadowed is never the one Chromium loads', async ({page}) => {
  await page.route(/\/[a-z]\.png$/, route => route.fulfill({body: png, contentType: 'image/png'}));
  const css = '*{box-sizing:border-box;margin:0}.page,picture{display:grid;grid-template-columns:minmax(0,1fr)}img{display:block;width:100%;height:auto}';
  const src = (media, file) => `<source ${media ? `media="${media}" ` : ''}srcset="/${file}.png" width="400" height="200">`;
  for (const sources of [src('(min-width: 600px)', 'm') + src('(min-width: 900px)', 'l'), src('(min-width: 900px)', 'l') + src('(min-width: 600px)', 'm'), src('', 'a') + src('(min-width: 600px)', 'm'), src('(min-width: 2000px)', 'x') + src('(max-width: 700px)', 'n')]) {
    const html = `<div class="page"><picture>${sources}<img src="/s.png" width="400" height="200" alt=""></picture></div>`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 320, max: 1280}});
    expect(report.status, sources).toBe('verified');
    const dead = new Set((report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_SOURCE_SHADOWED').map(w => /\/([a-z])\.png/.exec(w.srcset)[1]));
    const loaded = new Set();
    for (const width of [320, 500, 650, 800, 1000, 1280]) {
      await page.setViewportSize({width, height: 600});
      await page.route('http://picture.test/', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><style>${css}</style></head><body style="margin:0">${html}</body></html>`}));
      await page.goto('http://picture.test/');
      await page.unroute('http://picture.test/');
      loaded.add(await page.evaluate(async () => { const i = document.querySelector('img'); await i.decode().catch(() => {}); return /\/([a-z])\.png/.exec(i.currentSrc)[1]; }));
    }
    const all = [...sources.matchAll(/\/([a-z])\.png/g)].map(m => m[1]);
    for (const file of all) expect(loaded.has(file), `${sources}: ${file} reported dead ${dead.has(file)}, loaded ${[...loaded]}`).toBe(!dead.has(file));
  }
});

test('upscaled images: where the static check warns, the file Chromium shows is narrower than the image box', async ({page}) => {
  // Files /f<width>.svg are <width>×<width/2> pixels.
  await page.route(/\/f\d+\.svg$/, route => { const w = Number(/f(\d+)\.svg/.exec(route.request().url())[1]); route.fulfill({contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w / 2}"><rect width="100%" height="100%" fill="#888"/></svg>`}); });
  const base = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}img{display:block;width:100%;height:auto}';
  for (const [attrs, cap, images] of [
    ['src="/f400.svg" srcset="/f400.svg 400w, /f800.svg 800w"', '', undefined],
    ['src="/f400.svg" srcset="/f400.svg 400w, /f800.svg 800w"', 'img{max-width:800px}', undefined],
    ['src="/f600.svg"', '', {'/f600.svg': {width: 600, height: 300}}],
  ]) {
    const css = base + cap, html = `<div class="page"><img ${attrs} width="400" height="200" alt=""></div>`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 320, max: 1280}, ...(images ? {images} : {})});
    for (const width of [400, 700, 900, 1280]) {
      await page.setViewportSize({width, height: 600});
      await page.route('http://upscale.test/', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><style>${css}</style></head><body style="margin:0">${html}</body></html>`}));
      await page.goto('http://upscale.test/');
      await page.unroute('http://upscale.test/');
      const {file, rendered} = await page.evaluate(async () => { const i = document.querySelector('img'); await i.decode().catch(() => {}); return {file: Number(/f(\d+)\.svg/.exec(i.currentSrc)[1]), rendered: i.getBoundingClientRect().width}; });
      const warned = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_IMAGE_UPSCALED' && width > w.range.min && width <= w.range.max);
      expect(warned, `${attrs} ${cap} at ${width}: ${file}px file in a ${rendered}px box`).toBe(file < rendered);
    }
  }
});

test('width: 100% with a margin: where W_LAYOUT_FULL_WIDTH_MARGIN warns, the item sticks out of its area in Chromium', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const [css, warn] of [['.c{width:100%;margin-left:20px}', true], ['.c{width:100%;margin:0 12px}', true], ['.c{margin:0 20px}', false], ['.c{width:50%;margin-left:20px}', false]]) {
    const all = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.p{${g};overflow:clip}.c{height:10px}${css}`;
    const html = '<main class="p"><div class="c"></div></main>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: all, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_FULL_WIDTH_MARGIN'), css).toBe(warn);
    await page.setViewportSize({width: 500, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${all}</style></head><body>${html}</body></html>`);
    const out = await page.evaluate(() => document.querySelector('.c').getBoundingClientRect().right > document.querySelector('.p').getBoundingClientRect().right);
    expect(out, `${css}: sticks out in Chromium`).toBe(warn);
  }
});

test('block flow does not shrink scroll-container children: the static overflow matches Chromium (a grid would shrink them)', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const [height, overflow] of [['50px', true], ['100px', false]]) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.p{${g}}.box{display:block;height:${height}}.a,.b{display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden}.k{height:40px}`;
    const html = '<main class="p"><section class="box"><div class="a"><div class="k"></div></div><div class="b"><div class="k"></div></div></section></main>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect(report.status, height).not.toBe('unknown');
    expect(report.sizes.filter(s => ['.a', '.b'].includes(s.box)).map(s => s.blockSize.constant), height).toEqual(['40', '40']);
    expect(report.diagnostics.some(d => d.code === 'E_LAYOUT_TRACKS' && d.axis === 'block'), height).toBe(overflow);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const chrome = await page.evaluate(() => ({heights: [...document.querySelectorAll('.a,.b')].map(e => e.getBoundingClientRect().height), over: document.querySelector('.box').scrollHeight > document.querySelector('.box').clientHeight}));
    expect(chrome.heights, height).toEqual([40, 40]);
    expect(chrome.over, height).toBe(overflow);
  }
});

test('list markers at the viewport edge: where W_LAYOUT_MARKER_HIDDEN warns, Chromium paints none of the marker', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  await page.setViewportSize({width: 400, height: 200});
  for (const css of ['ul{padding:0}', 'ul{padding:0 0 0 24px}', '.w{padding-left:16px}ul{padding:0}', 'ol{padding:0}', '.w{overflow-x:clip;margin-left:30px}ul{padding:0}', '.w{overflow-x:clip;margin-left:30px;padding-left:24px}ul{padding:0}']) {
    const tag = css.startsWith('ol') ? 'ol' : 'ul';
    const all = `*{box-sizing:border-box;margin:0}html,body{${g};background:#fff}body{margin:0}.w{${g}}li{height:20px;color:#f00;font-size:20px}${css}`;
    const html = `<div class="w"><${tag} class="l"><li class="a"></li><li class="b"></li></${tag}></div>`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: all, viewport: {min: 320, max: 800, height: {min: 200, max: 900}}});
    const warned = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_MARKER_HIDDEN');
    await page.setContent(`<!doctype html><html lang="en"><head><style>${all}</style></head><body>${html}</body></html>`);
    const shot = (await page.screenshot()).toString('base64');
    const red = await page.evaluate(async b64 => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 80 && d[i + 2] < 80) n++; return n; }, shot);
    expect(warned, `${css}: ${red} marker pixels in Chromium`).toBe(red === 0);
  }
});

test('animation score bound: Chromium’s largest session window stays below the static window bound', async ({page}) => {
  const viewport = {min: 800, max: 800, height: {min: 600, max: 600}};
  const html = '<div class="page"><div class="a"></div><div class="b"></div></div>';
  const base = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:40px;background:#ccc}.b{height:40px;background:#444}';
  const results = [];
  for (const rule of ['@keyframes m{from{height:40px}to{height:80px}}.a{animation:m .5s infinite}', '@keyframes m{from{height:40px}to{height:80px}}.a{animation:m .5s infinite alternate}', '@keyframes m{to{height:140px}}.a{animation:m 2s 1}', '@keyframes m{0%{height:40px}50%{height:120px}100%{height:40px}}.a{animation:m 1s infinite}']) {
    const report = analyzeHTML(html, {name: 'Page', viewport, css: base + rule});
    const bound = report.diagnostics.find(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT')?.scoreBound;
    expect(bound, rule).toBeTruthy();
    await page.setViewportSize({width: 800, height: 600});
    await page.route('http://cls.test/', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><script>window.__s=[];new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) window.__s.push([e.startTime,e.value])}).observe({type:'layout-shift',buffered:true});</script><style>${base + rule}</style></head><body style="margin:0">${html}</body></html>`}));
    await page.goto('http://cls.test/');
    await page.waitForTimeout(6000);
    // Chromium's CLS: the largest session window (gaps under 1 s, at most 5 s long).
    const largest = await page.evaluate(() => { let best = 0, sum = 0, first = -Infinity, last = -Infinity; for (const [t, v] of window.__s) { if (t - last >= 1000 || t - first >= 5000) { sum = 0; first = t; } sum += v; last = t; best = Math.max(best, sum); } return best; });
    await page.unroute('http://cls.test/');
    results.push([rule.slice(-30), largest, bound.window]);
    expect(largest, `${rule}: Chromium ${largest}, bound ${bound.window}`).toBeLessThanOrEqual(bound.window + 1e-9);
  }
  console.log('animation window vs bound', JSON.stringify(results));
});

test('image distortion: the static fill-stretch warning holds exactly where Chromium draws the picture off its natural ratio', async ({page}) => {
  // The file is 2×1; the attributes say 2:1 too (or 1:1 where the case is about a wrong attribute).
  await page.route('**/photo.png', route => route.fulfill({body: png, contentType: 'image/png'}));
  const base = '*{box-sizing:border-box;margin:0}body{margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}img{display:block}';
  const cases = [
    ['img{width:100%;height:240px}', 'width="200" height="100"'],
    ['img{width:100%;height:240px;object-fit:cover}', 'width="200" height="100"'],
    ['img{width:100%;height:auto}', 'width="200" height="100"'],
    ['img{width:100%}', 'width="200" height="100"'],
    ['img{width:100%;height:auto;aspect-ratio:1}', 'width="200" height="100"'],
    ['img{width:100%;height:auto;aspect-ratio:2 / 1}', 'width="200" height="100"'],
    ['img{width:min(100%,480px);height:240px}', 'width="200" height="100"'],
  ];
  for (const [css, attrs] of cases) {
    const html = `<div class="page"><img src="http://cls.test/photo.png" ${attrs} alt="A photo"></div>`;
    const report = analyzeHTML(html, {name: 'P', css: base + css, viewport: {min: 320, max: 1280, height: {min: 2000, max: 2000}}, images: {'http://cls.test/photo.png': {width: 2, height: 1}}});
    const warnings = (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_IMAGE_DISTORTED');
    for (const width of [360, 480, 700, 1200]) {
      await page.setViewportSize({width, height: 800});
      await page.route('http://cls.test/', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><style>${base + css}</style></head><body>${html}</body></html>`}));
      await page.goto('http://cls.test/');
      const m = await page.evaluate(async () => { const i = document.querySelector('img'); await i.decode(); const r = i.getBoundingClientRect(); return {w: r.width, h: r.height, nw: i.naturalWidth, nh: i.naturalHeight, fit: getComputedStyle(i).objectFit}; });
      const browser = m.fit === 'fill' && Math.abs(m.w * m.nh - m.h * m.nw) > 0.02 * Math.min(m.w * m.nh, m.h * m.nw);
      const inRange = w => (w.range.minInclusive ? width >= w.range.min : width > w.range.min) && (w.range.maxInclusive ? width <= w.range.max : width < w.range.max);
      // The warnings' regions (stretched wider, stretched taller) cover exactly the widths drawn off the natural ratio.
      expect(warnings.some(inRange), `${css} at ${width}: drawn ${m.w}×${m.h}, natural ${m.nw}×${m.nh}`).toBe(browser);
    }
  }
});

test('position: fixed under a transformed ancestor scrolls with the page; the static check says Unknown (U_LAYOUT_FIXED_CONTAINED) exactly then', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const card of ['', 'transform:translateX(0px)', 'transform:scale(1)']) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.page{${g}}.card{${g};height:200px;${card}}.bar{position:fixed;left:0;bottom:0;width:100%;height:56px;background:#123}.tall{height:3000px}`;
    const html = '<main class="page"><div class="card"><div class="bar"></div></div><div class="tall"></div></main>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, accessibility: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
    const contained = report.diagnostics.some(d => d.code === 'U_LAYOUT_FIXED_CONTAINED');
    await page.setViewportSize({width: 400, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const top = y => page.evaluate(async y => { scrollTo(0, y); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return [scrollY, document.querySelector('.bar').getBoundingClientRect().top]; }, y);
    const [[y0, before], [y1, after]] = [await top(0), await top(500)];
    expect(y1 - y0, 'the page scrolls').toBe(500);
    expect(contained, `${card || 'no transform'}: bar top ${before} → ${after} after scrolling 500px`).toBe(after !== before);
    if (!contained) expect(report.status).not.toBe('unknown');
  }
});

test('hyphens: auto without lang breaks exactly like manual in Chromium, where the static check warns and lays it out as manual', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const words = 'Internationalization accessibility considerations notwithstanding representatives';
  const report = analyzeHTML(`<html><body><main class="page"><p class="t">${words}</p></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.page{${g}}.t{line-height:20px;hyphens:auto}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.t': {minInlineSize: 40, intrinsicBlockSize: 20}}});
  expect(report.status).not.toBe('unknown');
  expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_HYPHENS_NO_LANG')).toBe(true);
  for (const width of [90, 120, 160, 240]) {
    const heights = {};
    for (const h of ['manual', 'auto']) {
      await page.setContent(`<!doctype html><html><body style="margin:0"><p style="width:${width}px;font:16px/20px sans-serif;hyphens:${h}">${words}</p></body></html>`);
      heights[h] = await page.evaluate(() => [...document.querySelector('p').getClientRects()].map(r => r.height).join());
    }
    expect(heights.auto, `${width}px`).toBe(heights.manual);
  }
});

test('root font size: where the static check warns, text ignores the browser default font size setting', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  for (const [css, warn] of [['html{font-size:16px}', true], ['body{font-size:12pt}', true], ['html{font-size:100%}', false], ['html{font-size:62.5%}body{font-size:1.6rem}', false], ['', false]]) {
    const doc = '<html lang="en"><body><main class="page"><div class="b"></div></main></body></html>';
    const report = analyzeHTML(doc, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.page{${g}}.b{height:20px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_ROOT_FONT_FIXED'), css || 'none').toBe(warn);
    const size = async standard => { await cdp.send('Page.setFontSizes', {fontSizes: {standard}}); await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><p>Text</p></body></html>`); return page.evaluate(() => getComputedStyle(document.querySelector('p')).fontSize); };
    const [a, b] = [await size(16), await size(24)];
    expect(a === b, `${css || 'none'}: ${a} at default 16, ${b} at default 24`).toBe(warn);
  }
});

test('content-visibility: auto: the static warning fires exactly where Chromium sizes the box differently offscreen', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const html = '<main class="p"><div class="spacer"></div><section class="s"><div class="k"></div></section></main>';
  for (const own of ['', 'contain-intrinsic-size:auto 300px', 'contain-intrinsic-height:300px', 'contain-intrinsic-size:200px 300px', 'contain-intrinsic-width:300px', 'height:300px', 'height:200px']) {
    for (const parent of ['display:block', g]) {
      const css = `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${parent}}.k{height:300px}.s{content-visibility:auto;${own}}`;
      const report = analyzeHTML(`<html lang="en"><body><main class="p"><section class="s"><div class="k"></div></section></main></body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
      expect(report.status, `${own} in ${parent}`).not.toBe('unknown');
      const warn = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_CONTENT_VISIBILITY_SIZE');
      const modeled = Number(report.sizes.find(s => s.box === '.s').blockSize.constant);
      await page.setViewportSize({width: 500, height: 600});
      // Offscreen: below a 2000px spacer. On screen: no spacer.
      const height = async spacer => { await page.setContent(`<!doctype html><html lang="en"><head><style>${css}.spacer{height:${spacer}px}</style></head><body>${html}</body></html>`); await page.waitForTimeout(50); return page.evaluate(() => document.querySelector('.s').getBoundingClientRect().height); };
      const onscreen = await height(0), offscreen = await height(2000);
      expect(onscreen, `${own} in ${parent}: on screen it is the modeled size`).toBe(modeled);
      expect(offscreen !== onscreen, `${own} in ${parent}: offscreen size differs`).toBe(warn);
    }
  }
});

test('closed dialog: the static warning fires exactly where Chromium renders the closed dialog', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const html = '<main class="p"><dialog class="d"><div class="k"></div></dialog><div class="n"></div></main>';
  for (const css of ['', '.d{display:flex}', 'dialog{display:grid}', '.d{display:block}', '.d{visibility:visible;padding:20px}', '.p .d{display:grid}']) {
    const full = `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.n{height:10px}.k{height:40px}${css}`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: full, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    const warn = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DIALOG_CLOSED_SHOWN');
    if (!warn) expect(report.status, css).toBe('verified');
    await page.setContent(`<!doctype html><html lang="en"><head><style>${full}</style></head><body>${html}</body></html>`);
    const rendered = await page.evaluate(() => { const r = document.querySelector('.d').getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    expect(rendered, css).toBe(warn);
  }
});

test('buttons paint ButtonText on ButtonFace unless the author sets colors: the static contrast verdict agrees with Chromium', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const lum = c => { const [r, gg, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * gg + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const own of ['', 'color:#c00', 'background:transparent', 'color-scheme:dark', 'background:#246;color:#fff']) {
    const css = `*{box-sizing:border-box;margin:0}html,body,.p{${g}}.p{color:#fff;background:#123}.h{line-height:20px}.b{display:block;height:30px;line-height:20px;${own}}`;
    const html = '<main class="p"><h1 class="h">T</h1><button class="b" type="button">Go</button></main>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true, boxes: {'.b': {minInlineSize: 0, intrinsicBlockSize: 20}, '.h': {minInlineSize: 0, intrinsicBlockSize: 20}}});
    const failing = report.diagnostics.some(d => d.code === 'E_A11Y_CONTRAST' && d.box === '.b');
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const [color, background] = await page.evaluate(() => { const b = document.querySelector('.b'), cs = getComputedStyle(b); const bg = cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(b.parentElement).backgroundColor : cs.backgroundColor; return [cs.color, bg]; });
    expect(failing, `${own}: ${color} on ${background}`).toBe(ratio(color, background) < 4.5);
  }
});

test('inert z-index: a static block-level box in block flow does not stack above a positioned sibling; a grid item does', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const [parent, warn] of [['display:block', true], [g, false]]) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${parent}}.c{height:20px}.a{background:#c00;z-index:2}.b{position:relative;z-index:1;background:#00c}`;
    const html = '<div class="p"><div class="c a" id="a"></div><div class="c b" id="b"></div></div>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect(report.status, parent).toBe('verified');
    // In the browser a transform moves .a down over .b (a transform alone does not make z-index apply, measured).
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}.a{transform:translateY(10px)}</style></head><body>${html}</body></html>`);
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.box === '#a' && w.properties.includes('z-index')), parent).toBe(warn);
    // The overlap: .a (z-index: 2) is on top only where its z-index applies.
    expect(await page.evaluate(() => document.elementFromPoint(50, 25).id), parent).toBe(warn ? 'b' : 'a');
  }
});

test('inert declarations: where the static check warns, Chromium lays the page out the same without the declaration', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const cases = [
    ['.p{display:flex}', '.c{width:100px;height:10px}', 'grid-column:span 2', '.c', true],
    ['.p{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}', '.c{height:10px}', 'flex:1', '.c', true],
    ['.p{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}', '.c{height:10px}', 'grid-column:span 2', '.c', false],
    ['.p{display:flex}', '.c{width:100px;height:10px}', 'flex-grow:1', '.c', false],
    ['.p{display:flex}', '.c{width:100px;height:10px}', 'grid-template-columns:minmax(0,1fr)', '.p', true],
    ['.p{display:grid;grid-template-columns:minmax(0,1fr)}', '.c{height:10px}', 'flex-direction:column', '.p', true],
    ['.p{display:flex}', '.c{width:100px;height:10px}', 'flex-direction:column', '.p', false],
    ['.p{display:grid;grid-template-columns:minmax(0,1fr)}', '.c{width:100px;height:50px}', 'aspect-ratio:1', '.c', true],
    ['.p{display:grid;grid-template-columns:minmax(0,1fr)}', '.c{width:100px}', 'aspect-ratio:2', '.c', false],
    ['.p{display:grid;grid-template-columns:minmax(0,1fr)}', '.c{height:10px}', 'vertical-align:middle', '.c', true],
    ['.p{display:flex}', '.c{width:100px;height:10px}', 'vertical-align:top', '.c', true],
    ['.p{display:flex}', '.c{width:100px;height:10px}', 'justify-self:end', '.c', true],
    ['.p{display:flex}', '.c{width:100px;height:10px}', 'justify-items:center', '.p', true],
    ['.p{display:flex}', '.c{width:100px;height:10px}', 'justify-content:center', '.p', false],
    ['.p{display:flex;height:100px}', '.c{width:100px;height:10px}', 'align-content:center', '.p', true],
    ['.p{display:flex}', '.c{height:10px;flex:1}', 'width:200px', '.c', true],
    ['.p{display:flex}', '.c{height:10px;flex:1 1 50px;min-width:0}', 'width:300px', '.c', true],
    ['.p{display:flex;flex-direction:column;height:300px}', '.c{flex:1}', 'height:50px', '.c', true],
    ['.p{display:flex}', '.c{height:10px;flex:0 0 auto}', 'width:100px', '.c', false],
    ['.p{display:flex;height:100px}', '.c{width:100px;height:10px}', 'align-items:center', '.p', false],
    ['.p{display:block}', '.c{height:10px}', 'grid-column:2', '.c', true],
    ['.p{display:block;height:100px}', '.c{height:10px}', 'align-self:end', '.c', true],
    ['.p{display:grid;grid-template-columns:minmax(0,1fr)}', '.c{height:10px}', 'top:8px;left:4px', '.c', true],
    ['.p{display:block}', '.c{height:10px}', 'gap:12px', '.p', true],
    ['.p{display:grid;grid-template-columns:minmax(0,1fr)}', '.c{height:10px}', 'gap:12px', '.p', false],
    ['.p{display:block}', '.c{height:10px}', 'flex:1 1 50px', '.c', true],
    ['.p{display:block}', '.c{height:10px}', 'vertical-align:middle', '.c', true],
    ['.p{display:block;height:100px}', '.c{height:10px;width:50px}', 'justify-content:center;align-items:center', '.p', true],
    ['.p{display:block}', '.c{height:10px;width:50px}', 'flex-direction:column;flex-wrap:wrap', '.p', true],
    ['.p{display:block}', '.c{height:10px;width:50px}', 'grid-template-columns:1fr 1fr', '.p', true],
    ['.p{display:block;height:100px}', '.c{height:10px;width:50px}', 'align-content:center', '.p', false],
  ];
  const html = '<div class="p"><div class="c"></div><div class="c"></div></div>';
  for (const [parent, child, decl, target, warn] of cases) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}${parent}${child}${target}{${decl}}`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect(report.status, `${decl}: ${report.diagnostics.map(d => d.message).join(' | ')}`).toBe('verified');
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT'), `${target}{${decl}} in ${parent}`).toBe(warn);
    const rects = async withDecl => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}${parent}${child}${withDecl ? `${target}{${decl}}` : ''}</style></head><body>${html}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('div')].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].join(); }).join('|')); };
    expect((await rects(true)) === (await rects(false)), `${target}{${decl}} in ${parent}: same layout without it`).toBe(warn);
  }
});

test('100vw with a classic scrollbar: the page scrolls sideways in Chromium exactly where the static check warns', async ({playwright}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  // Headless Chromium hides scrollbars by default; without --hide-scrollbars it draws classic 15px ones.
  const browser = await playwright.chromium.launch({ignoreDefaultArgs: ['--hide-scrollbars']});
  const page = await browser.newPage();
  await page.setViewportSize({width: 480, height: 700});
  await page.setContent('<!doctype html><html><body style="margin:0"><div style="height:3000px"></div></body></html>');
  const scrollbar = await page.evaluate(() => innerWidth - document.documentElement.clientWidth);
  expect(scrollbar).toBeGreaterThan(0);
  const profile = [{name: 'classic', inlineSize: scrollbar, blockSize: scrollbar}];
  for (const [hero, warn] of [['width:100vw', true], ['width:100%', false], ['width:calc(100vw - 40px)', false]]) {
    const css = `*{box-sizing:border-box;margin:0}html{overflow-y:auto}html,body{${g}}body{margin:0}.hero{height:100px;${hero}}.tall{height:3000px}`;
    const html = '<div class="hero"></div><div class="tall"></div>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, scrollbars: profile});
    const warned = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_VW_SCROLLBAR');
    expect(warned, hero).toBe(warn);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(sideways, `${hero}: scrolls sideways ${sideways}, static warning ${warned} (scrollbar ${scrollbar}px)`).toBe(warn);
  }
  await browser.close();
});

test('sticky in an overflow-x wrapper: the header sticks in Chromium exactly when the static check does not warn', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const [wrap, warn] of [['overflow-x:auto', true], ['overflow-x:scroll', true], ['overflow:hidden', true], ['overflow-x:clip', false], ['', false]]) {
    const css = `*{box-sizing:border-box;margin:0}html,body,.page,.wrap{${g}}body{margin:0}.wrap{${wrap}}.h{position:sticky;top:0;height:40px;background:#246}.c{height:1200px}.tall{height:2000px}`;
    const html = '<div class="page"><div class="wrap"><div class="h"></div><div class="c"></div></div><div class="tall"></div></div>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 400, max: 900}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], integrity: true});
    expect(report.status, `${wrap}: ${report.diagnostics.map(d => d.message).join(' | ')}`).not.toBe('unknown');
    const warned = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_STICKY_SCROLLER');
    expect(warned, wrap || 'no wrapper overflow').toBe(warn);
    await page.setViewportSize({width: 400, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const top = await page.evaluate(async () => { scrollTo(0, 500); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return document.querySelector('.h').getBoundingClientRect().top; });
    expect(top === 0, `${wrap || 'no wrapper overflow'}: header top ${top} after scrolling 500px`).toBe(!warn);
  }
});

test('absolute with no positioned ancestor: placed against the initial containing block exactly as in Chromium', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const insets of ['top:8px;right:8px', 'bottom:8px;left:8px', 'bottom:10%;right:5%']) {
    const css = `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}body{margin:0}.gap{height:300px}.card{height:100px}.badge{position:absolute;${insets};width:20px;height:20px;background:red}`;
    const html = '<main class="page"><div class="gap"></div><div class="card"><span class="badge"></span></div></main>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}});
    expect(report.status, `${insets}: ${report.diagnostics.map(d => d.message).join(' | ')}`).toBe('verified');
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_ABSOLUTE_PAGE')).toBe(true);
    const rect = report.sizes.find(s => s.box === '.badge').rect;
    for (const [w, h] of [[360, 640], [700, 500]]) {
      const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
      const v = x => n(x.constant) + w * n(x.coefficient) + h * n(x.heightCoefficient);
      await page.setViewportSize({width: w, height: h});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
      const box = await page.evaluate(() => { const b = document.querySelector('.badge').getBoundingClientRect(); return [b.x, b.y]; });
      expect([v(rect.inlineStart), v(rect.blockStart)], `${insets} at ${w}×${h}`).toEqual(box);
    }
  }
});

test('font-size under 200% zoom (half the CSS width at twice the pixel ratio): short of 2× exactly where the static check warns', async ({browser}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const fs of ['5vw', 'calc(1rem + 1vw)', 'clamp(1rem, 4vw, 3rem)', 'max(4vw, 1rem)', '24px', 'min(6vw, 2rem)']) {
    const css = `*{box-sizing:border-box;margin:0}html{font-size:16px}html,body,.page{${g}}body{margin:0}.t{height:40px;font-size:${fs}}`;
    const html = '<main class="page"><h1 class="t">Title</h1></main>';
    const report = analyzeHTML(`<html lang="en"><body><main class="page"><h1 class="t"></h1></main></body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    const warning = (report.layoutWarnings ?? []).find(w => w.code === 'W_LAYOUT_FONT_ZOOM');
    for (const width of [360, 520, 760]) {
      const physical = [];
      for (const [w, dpr] of [[width, 1], [width / 2, 2]]) {
        const context = await browser.newContext({viewport: {width: w, height: 600 / (dpr)}, deviceScaleFactor: dpr});
        const page = await context.newPage();
        await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
        physical.push(parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector('.t')).fontSize)) * dpr);
        await context.close();
      }
      const short = physical[1] < 2 * physical[0] - 0.01;
      const warned = Boolean(warning?.intervals.some(([lo, hi]) => width >= lo && width <= hi));
      expect(warned, `${fs} at ${width}px: ${physical[0]} → ${physical[1]} at 200%`).toBe(short);
    }
  }
});

test('px line-height: with a 32px default font size the glyphs outgrow the line in Chromium exactly where the static check warns', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('Page.setFontSizes', {fontSizes: {standard: 32}});
  for (const [css, warn] of [['.t{font-size:1rem;line-height:20px}', true], ['.t{line-height:20px}', true], ['.t{font-size:1rem;line-height:1.25}', false], ['.t{font-size:16px;line-height:20px}', false], ['html{font-size:16px}.t{font-size:1rem;line-height:20px}', false]]) {
    const full = `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.t{display:block}${css}`;
    const report = analyzeHTML('<html lang="en"><body><main class="page"><p class="t">Text</p></main></body></html>', {name: 'P', css: full, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.t': {minInlineSize: 40, intrinsicBlockSize: 20}}});
    const warned = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_LINE_HEIGHT_FIXED');
    expect(warned, css).toBe(warn);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${full}</style></head><body><main class="page"><p class="t">Text</p></main></body></html>`);
    const [fontSize, lineHeight] = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.t')); return [parseFloat(s.fontSize), parseFloat(s.lineHeight)]; });
    expect(fontSize > lineHeight, `${css}: font ${fontSize}px, line ${lineHeight}px at a 32px default`).toBe(warn);
  }
});

test('px height on text: with a 32px default font size the text overflows its box in Chromium exactly where the static check warns', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('Page.setFontSizes', {fontSizes: {standard: 32}});
  for (const [css, warn] of [['.t{height:24px;font-size:1rem}', true], ['.t{min-height:24px;font-size:1rem}', false], ['.t{height:24px;font-size:16px}', false], ['html{font-size:16px}.t{height:24px;font-size:1rem}', false]]) {
    const full = `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.t{display:block;line-height:1.25}${css}`;
    const report = analyzeHTML('<html lang="en"><body><main class="page"><p class="t">Text</p></main></body></html>', {name: 'P', css: full, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.t': {minInlineSize: 40, intrinsicBlockSize: 20}}});
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_HEIGHT_FIXED_TEXT'), css).toBe(warn);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${full}</style></head><body><main class="page"><p class="t">Text</p></main></body></html>`);
    const overflows = await page.evaluate(() => { const t = document.querySelector('.t'); return t.scrollHeight > t.clientHeight; });
    expect(overflows, `${css}: overflows at a 32px default`).toBe(warn);
  }
});

test('form controls: Chromium gives them a font size other than the page\'s exactly where the static check warns', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const [css, warn] of [['body{font-size:18px}', true], ['body{font-size:18px}.b{font:inherit}', false], ['body{font-size:18px}.b{font-size:1em}', false]]) {
    const full = `*{box-sizing:border-box;margin:0}html,body,.page{${g}}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px}${css}`;
    const html = '<main class="page"><button class="b" aria-label="Go"></button></main>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: full, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_CONTROL_FONT'), css).toBe(warn);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${full}</style></head><body>${html}</body></html>`);
    const [control, parent] = await page.evaluate(() => [getComputedStyle(document.querySelector('.b')).fontSize, getComputedStyle(document.querySelector('.page')).fontSize]);
    expect(control !== parent, `${css}: button ${control}, page ${parent}`).toBe(warn);
  }
});

test('position: sticky with no inset scrolls away in Chromium exactly where the static check warns', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const [h, warn] of [['position:sticky', true], ['position:sticky;top:0', false]]) {
    const css = `*{box-sizing:border-box;margin:0}html,body,.page{${g}}body{margin:0}.h{height:40px;background:#246;${h}}.c{height:2000px}`;
    const html = '<div class="page"><div class="h"></div><div class="c"></div></div>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 400, max: 900}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], integrity: true});
    expect(report.status).not.toBe('unknown');
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_STICKY_NO_INSET'), h).toBe(warn);
    await page.setViewportSize({width: 400, height: 600});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const top = await page.evaluate(async () => { scrollTo(0, 300); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return document.querySelector('.h').getBoundingClientRect().top; });
    expect(top < 0, `${h}: top ${top}`).toBe(warn);
  }
});

test('width: 100% under content-box: the box sticks out of its container in Chromium exactly where the static check warns', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const [c, warn] of [['.f{width:100%;padding:0 12px}', true], ['.f{width:100%;border:2px solid #000}', true], ['.f{width:100%;padding:0 12px;box-sizing:border-box}', false], ['.f{padding:0 12px}', false]]) {
    const css = `html,body,.page{${g}}body{margin:0}.f{height:20px}${c}`, html = '<main class="page"><div class="f"></div></main>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_CONTENT_BOX_FULL'), c).toBe(warn);
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const out = await page.evaluate(() => document.querySelector('.f').getBoundingClientRect().right > document.querySelector('.page').getBoundingClientRect().right);
    expect(out, `${c}: sticks out ${out}`).toBe(warn);
  }
});

test('an img sized by its width attribute: wider than its container in Chromium exactly where the static check warns', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  await page.route('**/a.png', route => route.fulfill({body: png, contentType: 'image/png'}));
  for (const [c, attrs, warn] of [['', 'width="1200" height="600"', true], ['img{max-width:100%;height:auto}', 'width="1200" height="600"', false], ['', 'width="200" height="100"', false]]) {
    const css = `*{box-sizing:border-box;margin:0}html,body,.page{${g}}body{margin:0}img{display:block}${c}`, html = `<main class="page"><img src="http://cls.test/a.png" ${attrs} alt="A"></main>`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_MEDIA_NO_MAX'), `${c} ${attrs}`).toBe(warn);
    await page.setViewportSize({width: 400, height: 300});
    await page.route('http://cls.test/', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`}));
    await page.goto('http://cls.test/');
    const out = await page.evaluate(() => document.querySelector('img').getBoundingClientRect().width > document.querySelector('.page').getBoundingClientRect().width);
    expect(out, `${c} ${attrs}`).toBe(warn);
  }
});

test('a long word: the text overflows its 200px box in Chromium exactly where the static check warns, and overflow-wrap: anywhere fixes it', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const word = 'https://example.com/a/very/long/path/to/a/resource';
  await page.setContent(`<span style="font:16px/20px sans-serif;white-space:nowrap">${word}</span>`);
  const width = Math.ceil(await page.evaluate(() => document.querySelector('span').getBoundingClientRect().width));
  for (const [wrap, warn] of [['normal', true], ['anywhere', false]]) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.page{display:grid;grid-template-columns:200px}.t{display:block;font:16px/20px sans-serif;overflow-wrap:${wrap}}`;
    const html = `<main class="page"><p class="t">${word}</p></main>`;
    // The measured longest unbreakable piece is the contract's minimum width (anywhere: any character may break).
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, boxes: {'.t': {minInlineSize: wrap === 'normal' ? width : 12, intrinsicBlockSize: 20}}});
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_LONG_WORD'), wrap).toBe(warn);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const overflows = await page.evaluate(() => { const t = document.querySelector('.t'); return t.scrollWidth > t.clientWidth; });
    expect(overflows, `overflow-wrap: ${wrap} (word ${width}px)`).toBe(warn);
  }
});

test('fixed px grid columns: the grid overflows its container in Chromium exactly where the static check warns', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const t of ['repeat(3,200px)', '200px 200px 100px', '200px minmax(0,1fr)']) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.g{display:grid;column-gap:16px;grid-template-columns:${t}}.a{height:20px;background:#246}`;
    const html = '<div class="g"><div class="a"></div><div class="a"></div><div class="a"></div></div>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 1024, height: {min: 480, max: 900}}});
    const w = (report.layoutWarnings ?? []).find(x => x.code === 'W_LAYOUT_FIXED_TRACKS');
    for (const width of [360, 540, 700, 1000]) {
      await page.setViewportSize({width, height: 600});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
      const overflows = await page.evaluate(() => { const g = document.querySelector('.g'); return g.scrollWidth > g.clientWidth; });
      const warned = Boolean(w) && (w.range.minInclusive ? width >= w.range.min : width > w.range.min) && (w.range.maxInclusive ? width <= w.range.max : width < w.range.max);
      expect(warned, `${t} at ${width}`).toBe(overflows);
    }
  }
});

test('a scroll container in an auto row of a too-short grid: Chromium shrinks the row below its content (the static check says Unknown)', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  for (const [c, unknown] of [['overflow:hidden', true], ['', false]]) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.g{display:grid;grid-template-columns:minmax(0,1fr);height:60px;overflow:hidden}.f{display:grid;grid-template-columns:minmax(0,1fr);padding:8px;${c}}.x{height:50px}.y{height:90px}`;
    const html = '<div class="g"><div class="f"><div class="x"></div></div><div class="y"></div></div>';
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]});
    expect(report.diagnostics.some(d => d.code === 'U_LAYOUT_GRID_SHRINK'), c || 'visible').toBe(unknown);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const height = await page.evaluate(() => document.querySelector('.f').getBoundingClientRect().height);
    // Content height 66 (50 + padding); a scroll container's row shrinks to its padding (16).
    expect(height < 66, `${c || 'visible'}: row ${height}px`).toBe(unknown);
  }
});

test('inert text-overflow and -webkit-line-clamp: where the static check warns, Chromium paints the same without the declaration', async ({page}) => {
  const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
  const text = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua';
  const cases = [
    ['.c{width:120px;white-space:nowrap}', 'text-overflow:ellipsis', true],
    ['.c{width:120px;white-space:nowrap;overflow:hidden}', 'text-overflow:ellipsis', false],
    ['.c{width:120px;white-space:nowrap;overflow-x:clip}', 'text-overflow:ellipsis', false],
    ['.c{width:120px;overflow:hidden;line-height:20px}', '-webkit-line-clamp:2', true],
    ['.c{width:120px;overflow:hidden;line-height:20px;display:-webkit-box;-webkit-box-orient:vertical}', '-webkit-line-clamp:2', false],
    ['.c{width:120px;height:40px;background:linear-gradient(red,blue)}', 'object-fit:cover', true],
  ];
  for (const [base, decl, warn] of cases) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.p{${g}}${base}`;
    // The warning does not depend on the content: the static side checks the empty box (text without a size contract
    // is Unknown), Chromium paints the text.
    const report = analyzeHTML('<html lang="en"><body><div class="p"><div class="c"></div></div></body></html>', {name: 'P', css: `${css}.c{height:40px;${decl}}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect((report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => decl.includes(p))), `${base} ${decl}`).toBe(warn);
    await page.setViewportSize({width: 400, height: 600});
    const shot = async withDecl => { await page.setContent(`<!doctype html><html lang="en"><head><style>${css}${withDecl ? `.c{${decl}}` : ''}</style></head><body><div class="p"><div class="c">${text}</div></div></body></html>`); return (await page.screenshot()).toString('base64'); };
    expect((await shot(true)) === (await shot(false)), `${base} ${decl}: same pixels without it`).toBe(warn);
  }
});
