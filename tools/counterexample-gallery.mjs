// Counterexample gallery: one deliberately violating page per static-check pattern, analysed statically and then
// rendered in Chromium at the reported counterexample viewport, with the reported boxes outlined. Patterns that
// arise from a change of state (hover, slide switch, image load, animation, font load, scroll) get a before and an
// after image; the after image keeps the before position as a dashed outline.
//   node tools/counterexample-gallery.mjs   (writes docs/counterexamples/*.png and docs/counterexamples/README.md)
import {chromium} from 'playwright';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
import {loadTextMetrics} from '../packages/css-verifier/src/text-node.mjs';

const out = new URL('../docs/counterexamples/', import.meta.url);
mkdirSync(out, {recursive: true});
const fontFile = new URL('../packages/css-verifier/text-metrics/fixtures/roboto-variable.ttf', import.meta.url);
const roboto = readFileSync(fontFile);
const metrics = await loadTextMetrics({fonts: {Roboto: {file: fontFile.pathname}}});
const ro = (size = 16, lineHeight = 24) => ({family: 'Roboto', size, lineHeight, weight: 400});
const face = `@font-face{font-family:Roboto;src:url(data:font/ttf;base64,${roboto.toString('base64')})}`;
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const base = `*{box-sizing:border-box;margin:0}html{${g};background:#fff;color:#111;font-family:Roboto}body{${g};padding:16px;row-gap:12px}`;
const text = (selector, content, extra = {}, size = 16, lineHeight = 24) => ({[selector]: {text: {font: ro(size, lineHeight), content}, ...extra}});
const overlay = [{name: 'overlay', inlineSize: 0, blockSize: 0}];

// Image files served to the page: a 2×1 and a 1×1 PNG (built with zlib).
import zlib from 'node:zlib';
const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const image = (w, h, rgb) => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const row = Buffer.from([0, ...Array(w).fill(rgb).flat()]); return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]); };
const files = {'/wide.png': image(32, 16, [70, 130, 180]), '/square.png': image(16, 16, [200, 120, 60]), '/small.png': image(40, 20, [90, 160, 90])};
// srcset candidates: a 4px checkerboard at the file's own size, so an upscaled (too small) file looks blurry.
const checker = (w, h) => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const rows = []; for (let y = 0; y < h; y++) { const row = [0]; for (let x = 0; x < w; x++) row.push(...((((x >> 2) + (y >> 2)) & 1) ? [40, 110, 60] : [235, 245, 235])); rows.push(Buffer.from(row)); } return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]); };
for (let w = 40; w <= 1200; w += 40) files[`/w${w}.png`] = checker(w, w / 2);
const images = {'/wide.png': {width: 32, height: 16}, '/square.png': {width: 16, height: 16}};

const cases = [
  // --- layout ---
  {id: 'item-size', title: 'A fixed-width box wider than its column', code: 'E_LAYOUT_ITEM_SIZE',
    html: '<main class="page"><div class="card"></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.card{width:480px;height:80px;background:#9cf}'},
  {id: 'content', title: 'A label that does not fit its button', code: 'E_LAYOUT_CONTENT', options: {boxes: text('.label', 'Download the annual report')},
    html: '<main class="page"><div class="bar"><span class="label">Download the annual report</span></div></main>', css: '.page{display:grid;grid-template-columns:160px}.bar{display:grid;grid-template-columns:minmax(0,1fr);background:#246;color:#fff;padding:8px}.label{font-size:16px;line-height:24px;white-space:nowrap}'},
  {id: 'rows', title: 'A grid row too short for its item', code: 'E_LAYOUT_ITEM_SIZE',
    html: '<main class="page"><div class="a"></div><div class="b"></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:40px 40px;background:#eee}.a{height:70px;background:#fc9}.b{height:30px;background:#9cf}'},
  {id: 'page-overflow', title: 'A box that makes the page scroll sideways (100vw with a scrollbar)', code: 'E_LAYOUT_ITEM_SIZE', options: {scrollbars: [{name: 'classic', inlineSize: 15, blockSize: 15}]},
    html: '<main class="page"><div class="hero"></div></main>', css: 'html{overflow-y:scroll}body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{width:100vw;height:120px;background:#c9f}', scrollbarWidth: 15},
  // --- CLS ---
  {id: 'image-ratio', title: 'An image whose reserved ratio differs from its file', code: 'E_LAYOUT_IMAGE_RATIO', state: 'load', options: {images},
    html: '<main class="page"><img class="hero" src="/wide.png" width="400" height="400" alt=""><p class="after">The text below the image</p></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{display:block;width:100%;height:auto;background:#ddd}.after{height:40px;background:#eee}'},
  {id: 'hover-shift', title: 'A :hover rule that grows a card and pushes the content below', code: 'E_LAYOUT_HOVER_SHIFT', state: 'hover', hover: '.card',
    html: '<main class="page"><div class="card"></div><div class="below"></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px}.card{height:100px;background:#9cf}.card:hover{height:150px}.below{height:60px;background:#fc9}'},
  {id: 'animation-shift', title: 'A margin animation that moves the page every frame', code: 'E_LAYOUT_ANIMATION_SHIFT', state: 'animation', animated: '.banner',
    html: '<main class="page"><div class="banner"></div><div class="below"></div></main>', css: '@keyframes drop{from{margin-top:0}to{margin-top:60px}}.page{display:grid;grid-template-columns:minmax(0,1fr)}.banner{height:60px;background:#f99;animation:drop 1s infinite}.below{height:60px;background:#9cf}'},
  {id: 'carousel-shift', title: 'Carousel slides of different heights', code: 'E_LAYOUT_CAROUSEL_SHIFT', state: 'slide',
    html: '<main class="page"><section class="c" aria-roledescription="carousel" aria-label="News"><div class="s1" aria-roledescription="slide"></div><div class="s2" aria-roledescription="slide" hidden></div></section><div class="below"></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.c{display:grid;grid-template-columns:minmax(0,1fr)}.s1{height:100px;background:#9cf}.s2{height:180px;background:#69c}.below{height:60px;background:#fc9}'},
  {id: 'font-swap', title: 'Web-font text whose height follows the font', code: 'W_LAYOUT_FONT_SWAP', state: 'font', warning: true, options: {boxes: text('.t', 'A heading set in a web font that wraps onto three lines', {wrap: 'normal'}, 32, 40)},
    html: '<main class="page"><h1 class="t">A heading set in a web font that wraps onto three lines</h1><div class="below"></div></main>', css: '@font-face{font-family:Roboto;src:url(/roboto.ttf);font-display:swap}.page{display:grid;grid-template-columns:300px}.t{font-family:Roboto,serif;font-size:32px;line-height:40px;font-weight:400}.below{height:40px;background:#fc9}'},
  {id: 'lazy-in-viewport', title: 'loading="lazy" on an image above the fold', code: 'W_LAYOUT_LAZY_IN_VIEWPORT', warning: true,
    html: '<main class="page"><img class="hero" src="/wide.png" width="800" height="400" loading="lazy" alt=""></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{display:block;width:100%;height:auto}'},
  {id: 'sizes-small', title: 'A sizes attribute smaller than the rendered width', code: 'W_LAYOUT_SIZES_SMALL', warning: true,
    html: `<main class="page"><img class="hero" src="/w400.png" srcset="${Array.from({length: 30}, (_, i) => `/w${(i + 1) * 40}.png ${(i + 1) * 40}w`).join(', ')}" sizes="25vw" width="800" height="400" alt=""></main>`, css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{display:block;width:100%;height:auto}'},
  {id: 'line-clamp', title: 'A two-line clamp that cuts the title', code: 'W_LAYOUT_LINE_CLAMPED', warning: true, options: {boxes: text('.t', 'A card title that is much longer than the two lines the design allows', {wrap: 'normal'})},
    html: '<main class="page"><p class="t">A card title that is much longer than the two lines the design allows</p></main>', css: '.page{display:grid;grid-template-columns:220px}.t{font-size:16px;line-height:24px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;background:#eef}'},
  {id: 'sticky-inert', title: 'A sticky header wrapped in a box of its own height', code: 'W_LAYOUT_STICKY_INERT', state: 'scroll', warning: true, options: {integrity: true, scrollbars: overlay},
    html: '<main class="page"><div class="wrap"><header class="h"></header></div><div class="content"></div></main>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.wrap{display:grid;grid-template-columns:minmax(0,1fr)}.h{position:sticky;top:0;height:56px;background:#246}.content{height:1600px;background:repeating-linear-gradient(#fff 0 40px,#eee 40px 80px)}'},
  {id: 'sticky-scroller', title: 'A sticky header inside overflow: hidden', code: 'W_LAYOUT_STICKY_SCROLLER', state: 'scroll', warning: true, options: {integrity: true, scrollbars: overlay, boxes: {'.page': {overflow: 'clip', overflowBlock: 'clip'}}},
    html: '<main class="page"><header class="h"></header><div class="content"></div></main>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden}.h{position:sticky;top:0;height:56px;background:#246}.content{height:1600px;background:repeating-linear-gradient(#fff 0 40px,#eee 40px 80px)}'},
  // --- accessibility ---
  {id: 'contrast', title: 'Grey text below 4.5:1', code: 'E_A11Y_CONTRAST', options: {accessibility: true, boxes: text('.t', 'Low contrast text')},
    html: '<main class="page"><p class="t">Low contrast text</p></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.t{color:#999;font-size:16px;line-height:24px;white-space:nowrap}'},
  {id: 'target-size', title: 'A 16 × 16 icon button', code: 'E_A11Y_TARGET_SIZE', options: {accessibility: true},
    html: '<main class="page"><div class="bar"><button class="x" aria-label="Close"></button><button class="y" aria-label="Menu"></button></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.bar{display:grid;grid-template-columns:16px 16px;column-gap:2px}.x,.y{appearance:none;display:block;width:16px;height:16px;padding:0;border:0;min-width:0;min-height:0;background:#c33}'},
  {id: 'occluded', title: 'A button covered by a later box', code: 'E_A11Y_OCCLUDED', options: {accessibility: true, boxes: {'.page': {overflowBlock: 'visible'}}},
    html: '<main class="page"><button class="a" aria-label="Buy"></button><div class="b"></div></main>', css: '.page{display:grid;grid-template-columns:200px;grid-template-rows:30px 30px}.a{appearance:none;display:block;height:60px;padding:0;border:0;min-width:0;min-height:0;background:#c33}.b{background:rgba(40,80,160,.9)}'},
  {id: 'focus-visible', title: 'outline: none without another focus style', code: 'E_A11Y_FOCUS_VISIBLE', state: 'focus', focus: '.b', options: {accessibility: true},
    html: '<main class="page"><button class="b" aria-label="Save"></button></main>', css: '.page{display:grid;grid-template-columns:120px}.b{appearance:none;display:block;height:44px;padding:0;border:0;min-width:0;min-height:0;background:#246}.b:focus{outline:none}'},
  {id: 'visual-order', title: 'Grid placement that reverses the reading order', code: 'W_A11Y_ORDER', options: {accessibility: true},
    html: '<main class="page"><div class="row"><a class="a" href="/1" aria-label="First"></a><a class="b" href="/2" aria-label="Second"></a></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:grid;grid-template-columns:100px 100px;column-gap:8px}.a{grid-column:2;grid-row:1;display:block;height:44px;background:#9cf}.b{grid-column:1;grid-row:1;display:block;height:44px;background:#fc9}'},
  {id: 'accessible-name', title: 'An icon link with no accessible name', code: 'E_A11Y_NAME', options: {accessibility: true},
    html: '<main class="page"><a class="icon" href="/cart"></a></main>', css: '.page{display:grid;grid-template-columns:44px}.icon{display:block;height:44px;background:#246}'},
  {id: 'reflow', title: 'Content that needs horizontal scrolling at 320px', code: 'E_A11Y_REFLOW', options: {accessibility: true},
    html: '<main class="page"><div class="table"></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.table{width:600px;height:80px;background:#c9f}'},
  // --- integrity ---
  {id: 'protrusion', title: 'A badge that sticks out of its card', code: 'E_LAYOUT_PROTRUSION', options: {integrity: true},
    html: '<main class="page"><div class="card"><div class="badge"></div></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr);padding:24px}.card{display:grid;grid-template-columns:minmax(0,1fr);height:80px;background:#eee}.badge{height:24px;background:#c33;transform:translate(20px,-16px)}'},
];

const at = (box, w, h) => ({x: box.x, y: box.y, w: box.w, h: box.h, ok: true});
const point = d => {
  if (d.witness?.viewport !== undefined) return [Math.round(d.witness.viewport), Math.round(d.witness.viewportHeight ?? 600)];
  const pick = r => r ? (r.minInclusive ? r.min : r.maxInclusive ? r.max : (r.min + r.max) / 2) : 600;
  return [Math.round(pick(d.range)), Math.round(d.heightRange ? Math.max(pick(d.heightRange), 480) : 600)];
};
const browser = await chromium.launch();
const rows = [];
for (const c of cases) {
  const doc = `<html lang="en"><body>${c.html}</body></html>`;
  const options = {name: 'P', css: base + c.css, viewport: {min: 320, max: 1024, height: {min: 480, max: 900}}, ...(c.options ?? {})};
  if (!options.scrollbars && !c.noScrollbars) options.scrollbars = overlay;
  const report = analyzeHTML(doc, metrics.resolveOptions(options));
  const all = [...report.diagnostics, ...(report.layoutWarnings ?? []), ...(report.integrity?.warnings ?? []), ...(report.accessibility?.warnings ?? [])];
  const found = all.filter(d => d.code === c.code);
  if (!found.length) { console.error(`${c.id}: expected ${c.code}, got ${report.status}: ${all.map(d => d.code + ' ' + d.message).join(' | ').slice(0, 400)}`); process.exitCode = 1; continue; }
  const d = found[0];
  const [width, height] = point(d);
  const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
  // The web font is held back until the before picture is taken (Playwright's screenshot waits for fonts, so pictures
  // are taken through the DevTools protocol).
  let releaseFont; const fontGate = new Promise(r => { releaseFont = r; });
  await page.route('**/roboto.ttf', async route => { await fontGate; await route.fulfill({body: roboto, contentType: 'font/ttf'}); });
  const cdp = await page.context().newCDPSession(page);
  await page.route(/\/[\w]+\.png$/, async route => { const path = new URL(route.request().url()).pathname; if (c.state === 'load') await new Promise(r => setTimeout(r, 300)); await route.fulfill({body: files[path] ?? files['/small.png'], contentType: 'image/png'}); });
  // The font case renames the web font for the browser (Roboto may also be installed locally, which would be the fallback).
  const css = (c.state === 'font' ? '' : face) + base + (c.state === 'font' ? c.css.replace(/font-family:Roboto/g, 'font-family:WebFace') : c.css) + (c.state === 'animation' ? `${c.animated}{animation-play-state:paused!important}` : '');
  const htmlDoc = `<!doctype html><html lang="en"><head><style>${css}</style></head><body>${c.html}</body></html>`;
  await page.route('http://gallery.test/', route => route.fulfill({contentType: 'text/html', body: htmlDoc}));
  const loaded = page.goto('http://gallery.test/', {waitUntil: c.state === 'load' || c.state === 'font' ? 'commit' : 'load'});
  await loaded;
  if (c.state === 'load' || c.state === 'font') await page.waitForSelector('main');
  else await page.evaluate(() => document.fonts.ready);
  const paths = [...new Set(found.map(f => f.path).filter(Boolean))].slice(0, 4);
  const rects = () => page.evaluate(paths => paths.map(path => {
    let n = document.documentElement;
    for (const i of path.split('/').slice(1).map(Number)) { if (i < 0) return null; n = [...n.children].filter(c => c.tagName !== 'HEAD')[i]; if (!n) return null; }
    const r = n.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height};
  }), paths);
  const draw = (boxes, ghosts, label) => page.evaluate(({boxes, ghosts, label, whole}) => {
    document.querySelectorAll('.__ce').forEach(e => e.remove());
    const add = (r, style) => { if (!r) return; const e = document.createElement('div'); e.className = '__ce'; Object.assign(e.style, {position: 'fixed', left: r.x - 2 + 'px', top: r.y - 2 + 'px', width: r.w + 4 + 'px', height: r.h + 4 + 'px', zIndex: 2147483647, pointerEvents: 'none', boxSizing: 'border-box', ...style}); document.body.append(e); };
    for (const r of ghosts) add(r, {border: '2px dashed #e00', background: 'rgba(255,0,0,.06)'});
    for (const r of boxes) add(r, {border: '3px solid #e00'});
    // The picture: the page content and every outline, padded; the label sits below it.
    const parts = [document.querySelector('main').getBoundingClientRect(), ...[...boxes, ...ghosts].filter(Boolean).map(r => ({left: r.x, top: r.y, right: r.x + r.w, bottom: r.y + r.h}))];
    const full = innerHeight;
    let x0 = Math.max(0, Math.min(...parts.map(r => r.left)) - 16), y0 = Math.max(0, Math.min(...parts.map(r => r.top)) - 16);
    let x1 = Math.min(innerWidth, Math.max(...parts.map(r => r.right)) + 16), y1 = Math.min(full - 30, Math.max(...parts.map(r => r.bottom)) + 16);
    if (whole) { x0 = 0; y0 = 0; x1 = innerWidth; y1 = full - 30; }
    x1 = Math.max(x1, Math.min(innerWidth, x0 + 280));
    const tag = document.createElement('div'); tag.className = '__ce'; tag.textContent = label;
    Object.assign(tag.style, {position: 'fixed', left: x0 + 'px', top: y1 + 4 + 'px', maxWidth: (x1 - x0 - 8) + 'px', font: '600 12px/1.3 Roboto, sans-serif', color: '#fff', background: 'rgba(200,0,0,.92)', padding: '4px 6px', borderRadius: '3px', zIndex: 2147483647, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'});
    document.body.append(tag);
    return {x: x0, y: y0, width: x1 - x0, height: Math.min(full, y1 + 30) - y0};
  }, {boxes, ghosts, label, whole: c.state === 'scroll'});
  const shot = async (name, label, ghosts = []) => { const clip = await draw(await rects(), ghosts, label); const file = `${c.id}-${name}.png`; const {data} = await cdp.send('Page.captureScreenshot', {format: 'png', clip: {...clip, scale: 1}}); writeFileSync(new URL(file, out), Buffer.from(data, 'base64')); return file; };
  const shots = [];
  const stateful = c.state && c.state !== 'focus';
  const before = await rects();
  shots.push(await shot(stateful ? 'before' : 'violation', `${c.code}${stateful ? ' — before' : ''}`));
  if (c.state === 'focus') { await page.evaluate(() => document.querySelectorAll('.__ce').forEach(e => e.remove())); await page.focus(c.focus); shots.splice(0, 1, await shot('violation', `${c.code} — focused, nothing shows focus`)); }
  if (stateful) {
    await page.evaluate(() => document.querySelectorAll('.__ce').forEach(e => e.remove()));
    if (c.state === 'hover') await page.hover(c.hover);
    if (c.state === 'slide') await page.evaluate(() => { const [a, b] = document.querySelectorAll('[aria-roledescription=slide]'); a.hidden = true; b.hidden = false; });
    if (c.state === 'animation') await page.evaluate(sel => { const a = document.querySelector(sel).getAnimations()[0]; a.currentTime = 999; }, c.animated);
    if (c.state === 'load') await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
    if (c.state === 'font') releaseFont();
    if (c.state === 'font') await page.evaluate(async () => { await document.fonts.load('32px WebFace'); await document.fonts.ready; });
    if (c.state === 'scroll') await page.evaluate(async () => { scrollTo(0, 120); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await page.waitForTimeout(50);
    shots.push(await shot('after', `${c.code} — after (${({hover: 'hovered', slide: 'next slide', animation: 'keyframe 100%', load: 'image loaded', font: 'web font loaded', scroll: 'scrolled 120px'})[c.state]})`, before));
  }
  releaseFont();
  await page.close();
  rows.push({...c, d, width, height, shots, count: found.length});
  console.log(`${c.id}: ${c.code} at ${width}×${height} → ${shots.join(', ')}`);
}
await browser.close();

const md = ['# 反例ギャラリー', '',
  '各パターンで、わざと違反する小さなページを静的に検査し、報告された反例の viewport で Chromium に描画した画像。赤い実線の枠が報告された箱、点線の枠が状態が変わる前の位置(動いた分が layout shift)。`node tools/counterexample-gallery.mjs` で再生成する。', '',
  ...rows.flatMap(r => [`## ${r.title}`, '', `\`${r.code}\` — viewport ${r.width} × ${r.height}px`, '', `> ${r.d.message}`, '', r.shots.map(s => `![${r.id}](${s})`).join(' '), '',
    '<details><summary>HTML / CSS</summary>', '', '```html', r.html, '```', '', '```css', r.css, '```', '', '</details>', ''])];
writeFileSync(new URL('README.md', out), md.join('\n'));
writeFileSync(new URL('gallery.json', out), JSON.stringify(rows.map(r => ({id: r.id, title: r.title, code: r.code, width: r.width, height: r.height, message: r.d.message, shots: r.shots, html: r.html, css: r.css})), null, 1));
