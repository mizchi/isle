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
// A disc on a square file: drawn with object-fit: fill into a wide box, it becomes an ellipse.
const disc = n => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2; const rows = []; for (let y = 0; y < n; y++) { const row = [0]; for (let x = 0; x < n; x++) { const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5); row.push(...(d < n * 0.42 ? [226, 120, 40] : d < n * 0.46 ? [120, 60, 20] : [236, 242, 250])); } rows.push(...row); } return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]); };
files['/disc.png'] = disc(120);
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
  {id: 'image-distorted', title: 'A square photo stretched by width: 100% and a fixed height', code: 'W_LAYOUT_IMAGE_DISTORTED', warning: true, state: 'load', options: {images: {'/disc.png': {width: 120, height: 120}}},
    html: '<main class="page"><img class="hero" src="/disc.png" width="120" height="120" alt="A logo"></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{display:block;width:100%;height:160px}'},
  {id: 'sizes-small', title: 'A sizes attribute smaller than the rendered width', code: 'W_LAYOUT_SIZES_SMALL', warning: true,
    html: `<main class="page"><img class="hero" src="/w400.png" srcset="${Array.from({length: 30}, (_, i) => `/w${(i + 1) * 40}.png ${(i + 1) * 40}w`).join(', ')}" sizes="25vw" width="800" height="400" alt=""></main>`, css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{display:block;width:100%;height:auto}'},
  {id: 'truncated', title: 'A product name cut with an ellipsis', code: 'W_LAYOUT_TRUNCATED', warning: true, options: {boxes: text('.t', 'Wireless noise-cancelling headphones, midnight blue')},
    html: '<main class="page"><p class="t">Wireless noise-cancelling headphones, midnight blue</p></main>', css: '.page{display:grid;grid-template-columns:240px}.t{font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#eef}'},
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

  // --- accessibility (more) ---
  {id: 'target-overlap', title: 'Two targets that overlap', code: 'E_A11Y_TARGET_OVERLAP', options: {accessibility: true},
    html: '<main class="page"><button class="go" aria-label="Go"></button><a class="more" href="/more" aria-label="More"></a></main>', css: '.page{display:grid;grid-template-columns:200px;grid-template-rows:44px;position:relative}.go{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.more{position:absolute;left:150px;top:10px;width:80px;height:44px;display:block;background:rgba(220,120,40,.85)}'},
  {id: 'focus-obscured', title: 'A focused button entirely under another box', code: 'E_A11Y_FOCUS_OBSCURED', state: 'focus', focus: '.go', focusLabel: 'focused, under the cover', options: {accessibility: true},
    html: '<main class="page"><button class="go" aria-label="Pay"></button><div class="cover"></div></main>', css: '.page{display:grid;grid-template-columns:200px;grid-template-rows:44px;position:relative;background:#fff}.go{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.go:focus{outline:3px solid #1a73e8}.cover{position:absolute;left:0;top:0;width:200px;height:44px;background:#f4f4f4}'},
  {id: 'state-contrast', title: 'A hover color with too little contrast', code: 'E_A11Y_STATE_CONTRAST', state: 'hover', hover: '.b', options: {accessibility: true, boxes: text('.b', 'Subscribe')},
    html: '<main class="page"><button class="b">Subscribe</button></main>', css: '.page{display:grid;grid-template-columns:160px;background:#fff;color:#000}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;font-family:Roboto;font-size:16px;line-height:24px;background:#fff;color:#000;white-space:nowrap}.b:hover{color:#bbb}'},
  {id: 'focus-contrast', title: 'A pale focus outline', code: 'E_A11Y_FOCUS_CONTRAST', state: 'focus', focus: '.b', focusLabel: 'focused: the #ddd outline is barely visible', options: {accessibility: true},
    html: '<main class="page"><button class="b" aria-label="Save"></button></main>', css: '.page{display:grid;grid-template-columns:120px;padding:8px;background:#fff}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.b:focus{outline:3px solid #ddd;outline-offset:2px}'},
  {id: 'focus-clipped', title: 'A button inside overflow: clip, below the clip edge', code: 'E_A11Y_FOCUS_CLIPPED', options: {accessibility: true, boxes: {'.c': {overflowBlock: 'clip'}}},
    html: '<main class="page"><div class="c"><div class="s"></div><button class="b" aria-label="Next"></button></div></main>', css: '.page{display:grid;grid-template-columns:200px;background:#fff}.c{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:60px 30px;height:60px;overflow:clip;outline:1px dashed #999}.s{background:#eee}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;background:#c33}'},
  {id: 'focus-ring-clipped', title: 'A focus ring cut off by a flush overflow: clip container', code: 'W_A11Y_FOCUS_RING_CLIPPED', warning: true, state: 'focus', focus: '.b', focusLabel: 'focused: the ring is cut at the clip left edge', options: {accessibility: true, boxes: {'.c': {overflow: 'clip', overflowBlock: 'clip'}}},
    html: '<main class="page"><div class="c"><button class="b" aria-label="Save"></button></div></main>', css: '.page{display:grid;grid-template-columns:200px;padding:16px;background:#fff}.c{display:grid;grid-template-columns:minmax(0,1fr);overflow:clip;padding:8px 8px 8px 0;background:#eef}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.b:focus{outline:4px solid #e8710a}'},
  {id: 'hidden-control', title: 'A custom checkbox whose real input is display: none', code: 'E_A11Y_CONTROL_HIDDEN', act: async page => { await page.keyboard.press('Tab'); }, afterLabel: 'after one Tab: focus skips the checkbox', options: {accessibility: true, boxes: text('.t', 'Remember me')},
    html: '<main class="page"><input class="f" type="checkbox" id="opt"><label class="l" for="opt"><span class="box"></span><span class="t">Remember me</span></label><button class="b" aria-label="Sign in"></button></main>', css: '.page{display:grid;grid-template-columns:220px;row-gap:12px;background:#fff;color:#111}.f{display:none}.l{display:grid;grid-template-columns:24px minmax(0,1fr);column-gap:8px}.box{display:block;height:24px;border:2px solid #246;border-radius:4px}.t{display:block;font-family:Roboto;font-size:16px;line-height:24px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px;background:#246}.b:focus{outline:3px solid #e8710a;outline-offset:2px}'},
  {id: 'select-indicator', title: 'An appearance: none select with no arrow', code: 'W_A11Y_SELECT_INDICATOR', warning: true, options: {accessibility: true},
    html: '<main class="page"><select class="s" aria-label="Size"></select><input class="f" type="text" aria-label="Name"></main>', css: '.page{display:grid;grid-template-columns:240px;row-gap:12px;background:#fff;color:#111}.s,.f{appearance:none;display:block;width:240px;height:40px;padding:0;border:1px solid #767676;border-radius:4px;min-width:0;min-height:0;background-color:#fff}'},
  {id: 'stretched-link', title: 'A stretched link that covers the card\'s other button', code: 'E_A11Y_OCCLUDED', options: {accessibility: true},
    html: '<main class="page"><article class="card"><a class="l" href="/item" aria-label="Item"></a><button class="b" aria-label="Save"></button></article></main>', css: '.page{display:grid;grid-template-columns:240px;background:#fff}.card{display:grid;grid-template-columns:minmax(0,1fr);position:relative;grid-auto-rows:40px;row-gap:8px;padding:0;background:#eef}.l{display:block;height:40px;background:#cde}.l::after{content:"";position:absolute;inset:0;outline:2px dashed #246}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px;background:#c33}'},
  {id: 'tabindex-removed', title: 'A visible button taken out of the tab order', code: 'W_A11Y_TABINDEX_REMOVED', warning: true, act: async page => { await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); }, afterLabel: 'after two Tabs: the middle button was skipped', options: {accessibility: true},
    html: '<main class="page"><button class="b" aria-label="Back"></button><button class="b r" aria-label="Save" tabindex="-1"></button><button class="b" aria-label="Next"></button></main>', css: '.page{display:grid;grid-template-columns:repeat(3,80px);column-gap:16px;grid-auto-rows:40px;background:#fff}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;background:#246}.r{background:#c33}.b:focus{outline:3px solid #e8710a;outline-offset:2px}'},
  {id: 'focus-clipped-away', title: 'A visually hidden skip link that :focus does not reveal', code: 'E_A11Y_FOCUS_CLIPPED_AWAY', state: 'focus', focus: '.s', focusLabel: 'focused: the skip link stays clipped to nothing', options: {accessibility: true},
    html: '<main class="page"><a class="s" href="#main" aria-label="Skip to content"></a><div class="d"></div></main>', css: '.page{position:relative;display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:30px;background:#fff;color:#000}.s{position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;display:block;clip:rect(0 0 0 0)}.d{background:#eee}'},
  {id: 'focus-scrolled-under', title: 'A button that can sit entirely behind a fixed header', code: 'E_A11Y_FOCUS_SCROLLED_UNDER', act: async page => { await page.evaluate(async () => { scrollTo(0, 1000); document.querySelector('.b').focus({preventScroll: true}); await new Promise(r => requestAnimationFrame(r)); }); }, afterLabel: 'focused at scroll 1000px', options: {accessibility: true, scrollbars: overlay},
    html: '<main class="page"><div class="h"></div><div class="gap"></div><button class="b" aria-label="Buy"></button><div class="tall"></div></main>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff}.h{position:fixed;top:0;left:0;width:100%;height:60px;background:rgba(36,68,102,.97)}.gap{height:1010px}.tall{height:2000px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px;background:#c33}.b:focus{outline:3px solid #1a73e8}'},
  {id: 'fixed-contained', title: 'A fixed bottom bar inside a transformed card', code: 'U_LAYOUT_FIXED_CONTAINED', act: async page => { await page.evaluate(async () => { scrollTo(0, 300); await new Promise(r => requestAnimationFrame(r)); }); }, afterLabel: 'scrolled 300px: the bar is gone', options: {accessibility: true, scrollbars: overlay},
    html: '<main class="page"><div class="card"><p class="t"></p><div class="bar"></div></div><div class="gap"></div></main>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff}.card{display:grid;grid-template-columns:minmax(0,1fr);height:240px;background:#eef;transform:translateX(0px)}.bar{position:fixed;left:0;bottom:0;width:100%;height:56px;background:rgba(36,68,102,.97)}.gap{height:2000px;background:repeating-linear-gradient(#fff 0 40px,#f3f3f3 40px 80px)}'},
  {id: 'bar-transparent', title: 'A sticky header with no background', code: 'W_A11Y_BAR_TRANSPARENT', warning: true, act: async page => { await page.evaluate(async () => { scrollTo(0, 60); await new Promise(r => requestAnimationFrame(r)); }); }, afterLabel: 'scrolled 60px: the content shows through', options: {accessibility: true, scrollbars: overlay, boxes: text('.t', 'Menu')},
    html: '<main class="page"><header class="h"><span class="t">Menu</span></header><div class="card"></div><div class="tall"></div></main>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#111}.h{position:sticky;top:0;display:grid;grid-template-columns:minmax(0,1fr);height:56px}.t{display:block;font-family:Roboto;font-size:16px;line-height:24px}.card{height:200px;background:repeating-linear-gradient(90deg,#246 0 20px,#f2c94c 20px 40px)}.tall{height:2000px}'},
  {id: 'bar-covered', title: 'Cards that slide over a sticky header', code: 'W_A11Y_BAR_COVERED', warning: true, act: async page => { await page.evaluate(async () => { scrollTo(0, 40); await new Promise(r => requestAnimationFrame(r)); }); }, afterLabel: 'scrolled 40px: the card paints over the header', options: {accessibility: true, scrollbars: overlay},
    html: '<main class="page"><header class="h"></header><div class="card"></div><div class="card"></div><div class="tall"></div></main>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);row-gap:12px;background:#fff}.h{position:sticky;top:0;height:56px;background:#246}.card{position:relative;height:90px;background:#f2c94c}.tall{height:2000px}'},
  {id: 'sticky-table-wrapper', title: 'A sticky table header inside an overflow-x: auto wrapper', code: 'W_LAYOUT_STICKY_SCROLLER', warning: true, act: async page => { await page.evaluate(async () => { scrollTo(0, 300); await new Promise(r => requestAnimationFrame(r)); }); }, afterLabel: 'scrolled: header gone', options: {integrity: true, scrollbars: overlay},
    html: '<main class="page"><div class="wrap"><div class="h"></div><div class="rows"></div></div><div class="tall"></div></main>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.wrap{display:grid;grid-template-columns:minmax(0,1fr);overflow-x:auto}.h{position:sticky;top:0;height:44px;background:#246}.rows{height:1200px;background:repeating-linear-gradient(#fff 0 40px,#eef 40px 80px)}.tall{height:1500px}'},
  {id: 'fixed-hides', title: 'A fixed footer that covers the end of the page', code: 'E_A11Y_FIXED_HIDES', act: async page => { await page.evaluate(async () => { scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => requestAnimationFrame(r)); }); }, afterLabel: 'scrolled to the end', options: {accessibility: true, scrollbars: overlay},
    html: '<main class="page"><div class="gap"></div><button class="b" aria-label="Accept"></button><footer class="f"></footer></main>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff}.f{position:fixed;bottom:0;left:0;width:100%;height:60px;background:rgba(36,68,102,.97)}.gap{height:2000px;background:repeating-linear-gradient(#fff 0 40px,#f3f3f3 40px 80px)}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px;background:#c33}'},
  {id: 'fragment-under-bar', title: 'An #id jump that lands under a fixed header', code: 'W_A11Y_FRAGMENT_UNDER_BAR', act: async page => { await page.click('.l'); await page.waitForTimeout(100); }, afterLabel: 'after following the link: the heading is under the header', highlight: '#s', options: {accessibility: true, scrollbars: overlay, boxes: text('.t', 'Pricing', {}, 20, 30)},
    html: '<main class="page"><div class="h"></div><div class="top"></div><a class="l" href="#s" aria-label="Jump to pricing"></a><div class="gap"></div><h2 class="t" id="s">Pricing</h2><div class="tall"></div></main>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.h{position:fixed;top:0;left:0;width:100%;height:60px;background:#333}.top{height:60px}.l{display:block;height:30px;background:#06c}.gap{height:1000px}.t{display:block;font-family:Roboto;font-size:20px;line-height:30px;font-weight:400;white-space:nowrap}.tall{height:2000px}', expectWarning: true},
  {id: 'field-boundary', title: 'A text field whose border is too faint', code: 'E_A11Y_FIELD_BOUNDARY', options: {accessibility: true},
    html: '<main class="page"><input class="i" type="text" aria-label="Email"></main>', css: '.page{display:grid;grid-template-columns:240px;background:#fff;color:#000}.i{appearance:none;display:block;padding:0 8px;min-width:0;min-height:0;width:240px;height:36px;border:1px solid #ddd;background:transparent;font:16px Roboto}'},
  {id: 'placeholder-contrast', title: 'Placeholder text with too little contrast', code: 'E_A11Y_PLACEHOLDER_CONTRAST', options: {accessibility: true},
    html: '<main class="page"><input class="i" type="text" aria-label="Search" placeholder="Search products"></main>', css: '.page{display:grid;grid-template-columns:240px;background:#fff;color:#000}.i{appearance:none;display:block;padding:0 8px;min-width:0;min-height:0;width:240px;height:36px;border:1px solid #000;background:#fff;font-size:16px}.i::placeholder{color:#ccc}'},
  {id: 'checked-indicator', title: 'A custom checkbox that looks the same when checked', code: 'E_A11Y_CHECKED_INDICATOR', act: async page => { await page.click('.c'); }, afterLabel: 'checked', options: {accessibility: true},
    html: '<main class="page"><input class="c" type="checkbox" aria-label="Agree"></main>', css: '.page{display:grid;grid-template-columns:24px;background:#fff;color:#000}.c{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:24px;height:24px;border:2px solid #000;background:#fff;margin:0}'},
  {id: 'text-obscured', title: 'Text entirely under a later opaque box', code: 'E_A11Y_TEXT_OBSCURED', options: {accessibility: true, boxes: text('.t', 'Price: 1,200 USD', {}, 16, 20)},
    html: '<main class="page"><p class="t">Price: 1,200 USD</p><div class="over"></div></main>', css: '.page{position:relative;display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:20px;background:#fff;color:#000}.t{display:block;font-family:Roboto;font-size:16px;line-height:20px;white-space:nowrap}.over{position:absolute;left:0;top:0;width:100%;height:20px;background:#333}'},
  // --- integrity (more) ---
  {id: 'clipped', title: 'Content cut off by overflow: hidden', code: 'W_LAYOUT_CLIPPED', warning: true, options: {integrity: true, boxes: {'.box': {overflowBlock: 'clip'}}},
    html: '<main class="page"><div class="box"><div class="item a"></div><div class="item b"></div><div class="item c"></div></div></main>', css: '.page{display:grid;grid-template-columns:240px}.box{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px;height:90px;overflow:hidden;background:#eee;padding:8px}.item{height:40px;background:#69c}.b{background:#9c6}.c{background:#c96}'},

  {id: 'hover-only', title: 'A control that only hover reveals', code: 'E_A11Y_HOVER_ONLY', state: 'focus', focus: '.b', focusLabel: 'focused: the button stays invisible', options: {accessibility: true},
    html: '<main class="page"><div class="row"><div class="item"></div><button class="b" aria-label="Delete"></button></div></main>', css: '.page{display:grid;grid-template-columns:240px;background:#fff}.row{display:grid;grid-template-columns:minmax(0,1fr) 44px;height:44px;background:#eee}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;opacity:0;background:#c33}.b:hover{opacity:1}'},
  {id: 'text-spacing', title: 'Text cut off at 1.5 line-height (user text spacing)', code: 'E_A11Y_TEXT_SPACING', act: async page => { await page.addStyleTag({content: '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}'}); }, afterLabel: 'with the WCAG text spacing applied', options: {accessibility: true, boxes: text('.t', 'Order status: shipped', {overflow: 'clip', overflowBlock: 'clip'}, 16, 20)},
    html: '<main class="page"><p class="t">Order status: shipped</p></main>', css: '.page{display:grid;grid-template-columns:190px;grid-template-rows:20px;background:#fff;color:#000}.t{font-family:Roboto;font-size:16px;line-height:20px;white-space:nowrap;overflow:hidden;background:#eef}'},
  {id: 'small-text', title: 'Text below 12px on narrow screens', code: 'W_A11Y_SMALL_TEXT', warning: true, options: {accessibility: true, boxes: text('.t', 'Terms and conditions apply', {}, 10, 14)},
    html: '<main class="page"><p class="t">Terms and conditions apply</p></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.t{font-family:Roboto;font-size:10px;line-height:14px;white-space:nowrap}'},
  {id: 'pointer-disabled', title: 'A visible button under pointer-events: none', code: 'E_A11Y_POINTER_DISABLED', options: {accessibility: true},
    html: '<main class="page"><div class="panel"><button class="go" aria-label="Continue"></button></div></main>', css: '.page{display:grid;grid-template-columns:160px;background:#fff}.panel{display:grid;grid-template-columns:minmax(0,1fr);pointer-events:none}.go{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}'},
  {id: 'hidden-focusable', title: 'A focusable button inside aria-hidden', code: 'E_A11Y_HIDDEN_FOCUSABLE', state: 'focus', focus: '.b', focusLabel: 'focused, yet hidden from screen readers', options: {accessibility: true},
    html: '<main class="page"><div class="bar" aria-hidden="true"><button class="b" aria-label="Share"></button></div></main>', css: '.page{display:grid;grid-template-columns:120px;padding:4px;background:#fff}.bar{display:grid;grid-template-columns:minmax(0,1fr)}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.b:focus{outline:3px solid #1a73e8}'},
  {id: 'modal-background', title: 'Focus can leave an open modal dialog', code: 'W_A11Y_MODAL_BACKGROUND', warning: true, state: 'focus', focus: '.o', focusLabel: 'Tab reaches the page behind the open dialog', highlight: '.d', options: {accessibility: true},
    html: '<main class="page"><div class="bg"><button class="o" aria-label="Background action"></button></div><div class="d" role="dialog" aria-modal="true" aria-label="Confirm"><button class="i" aria-label="OK"></button></div></main>', css: '.page{position:relative;display:grid;grid-template-columns:240px;grid-template-rows:44px;background:#fff}.bg{display:grid;grid-template-columns:minmax(0,1fr)}.o{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#999}.o:focus{outline:3px solid #1a73e8}.d{position:absolute;left:40px;top:60px;width:160px;height:80px;display:grid;grid-template-columns:minmax(0,1fr);padding:18px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.3)}.i{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}'},
  // --- layout (more) ---
  {id: 'box-edges', title: 'Padding larger than the fixed size', code: 'E_LAYOUT_BOX_EDGES',
    html: '<main class="page"><div class="pill"></div></main>', css: '.page{display:grid;grid-template-columns:200px}.pill{height:24px;padding:16px 0;background:#9cf}'},
  // --- integrity (more) ---
  {id: 'page-overflow-x', title: 'A rigid row wider than the page', code: 'E_LAYOUT_PAGE_OVERFLOW', options: {integrity: true, boxes: {'.row': {overflow: 'visible'}}},
    html: '<main class="page"><div class="row"><div class="a"></div><div class="b"></div></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:flex;column-gap:8px}.a{flex:none;width:300px;height:60px;background:#9cf}.b{flex:none;width:200px;height:60px;background:#fc9}'},
  {id: 'text-collision', title: 'Text that spills into its neighbour', code: 'E_LAYOUT_TEXT_COLLISION', options: {integrity: true, boxes: {...text('.a', 'A long product name that overflows', {overflow: 'visible'}), ...text('.b', '19.99 USD')}},
    html: '<main class="page"><div class="row"><p class="t a">A long product name that overflows</p><p class="t b">19.99 USD</p></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.t{font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap}.b{background:rgba(255,200,120,.5)}'},
  {id: 'nested-scroll', title: 'A scroll area inside a scroll area', code: 'W_LAYOUT_NESTED_SCROLL', warning: true, options: {integrity: true, boxes: {'.outer': {overflow: 'scroll'}, '.inner': {overflow: 'scroll'}}},
    html: '<main class="page"><div class="outer"><div class="inner"><div class="content"></div></div></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.outer{display:grid;grid-template-columns:600px;overflow:auto;height:140px;background:#eee;padding:8px}.inner{display:grid;grid-template-columns:900px;overflow:auto;background:#cde}.content{min-width:0;height:100px;background:repeating-linear-gradient(90deg,#9cf 0 40px,#cde 40px 80px)}'},

  {id: 'forced-colors', title: 'A button drawn only by its fill, in forced colors', code: 'W_A11Y_FORCED_COLORS', warning: true, act: async page => { await page.emulateMedia({forcedColors: 'active'}); }, afterLabel: 'forced colors (Windows high contrast)', options: {accessibility: true},
    html: '<main class="page"><button class="b" aria-label="Save"></button><button class="c" aria-label="Cancel"></button></main>', css: '.page{display:grid;grid-template-columns:140px 140px;column-gap:12px;background:#fff}.b,.c{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.c{background:#ddd}'},
  {id: 'input-zoom', title: 'A 14px field that iOS zooms into on focus', code: 'W_LAYOUT_INPUT_ZOOM', warning: true, markup: true, mark: 'font-size:14px', options: {scrollbars: overlay},
    html: '<main class="page"><input class="i" type="search" aria-label="Search"></main>', css: '.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0 8px;min-width:0;min-height:0;width:200px;height:36px;border:1px solid #000;background:#fff;font-size:14px}', source: '.i {\n  font-size:14px;  /* iOS Safari zooms the page in when the field takes focus */\n}'},
  {id: 'vh-toolbar', title: 'A 100vh hero under the mobile toolbar', code: 'W_LAYOUT_VH_TOOLBAR', warning: true, markup: true, mark: 'height:100vh', options: {scrollbars: overlay},
    html: '<main class="page"><section class="hero"></section></main>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{height:100vh;background:#246}', source: '.hero {\n  height:100vh;  /* the viewport with the toolbars hidden: use 100svh */\n}'},
  {id: 'forced-colors-focus', title: 'A focus ring made of box-shadow, in forced colors', code: 'W_A11Y_FORCED_COLORS_FOCUS', warning: true, beforeAct: async page => { await page.focus('.b'); }, beforeLabel: 'focused, normal colours: the shadow ring shows', act: async page => { await page.emulateMedia({forcedColors: 'active'}); await page.focus('.b'); }, afterLabel: 'focused, in forced colors: no ring', options: {accessibility: true},
    html: '<main class="page"><button class="b" aria-label="Save"></button></main>', css: '.page{display:grid;grid-template-columns:160px;padding:8px;background:#fff}.b{appearance:none;display:block;padding:0;border:2px solid #246;min-width:0;min-height:0;height:44px;background:#fff}.b:focus{outline:none;box-shadow:0 0 0 4px #1a73e8}', state: undefined},
  {id: 'smooth-scroll', title: 'Smooth page scrolling with no reduced-motion rule', code: 'W_A11Y_SMOOTH_SCROLL', warning: true, markup: true, mark: 'scroll-behavior:smooth', options: {accessibility: true},
    html: '<main class="page"><div class="x"></div></main>', css: 'html{scroll-behavior:smooth}.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}', source: 'html {\n  scroll-behavior:smooth;  /* kept under prefers-reduced-motion: reduce */\n}'},
  // --- markup (DOM rules: nothing to see on screen, so the picture is the markup with the reported part marked) ---
  {id: 'html-lang', title: 'A document without lang', code: 'E_A11Y_HTML_LANG', markup: true, mark: '<html>', options: {accessibility: true},
    doc: '<html><body><main class="page"><div class="x"></div></main></body></html>', html: '<html>\n  <body>\n    <main class="page">…</main>\n  </body>\n</html>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}'},
  {id: 'meta-viewport', title: 'A viewport meta tag that disables zoom', code: 'E_A11Y_META_VIEWPORT', markup: true, mark: 'maximum-scale=1, user-scalable=no', options: {accessibility: true},
    doc: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, maximum-scale=1, user-scalable=no"><title>Shop</title></head><body><main class="page"><div class="x"></div></main></body></html>', html: '<head>\n  <meta name="viewport" content="width=device-width, maximum-scale=1, user-scalable=no">\n</head>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}'},
  {id: 'touch-zoom', title: 'touch-action on body that blocks pinch-zoom', code: 'E_A11Y_TOUCH_ZOOM', markup: true, mark: 'touch-action: pan-x pan-y', options: {accessibility: true},
    html: '<main class="page"><div class="x"></div></main>', css: 'body{touch-action:pan-x pan-y}.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}', source: 'body {\n  touch-action: pan-x pan-y;  /* no pinch-zoom */\n}'},
  {id: 'duplicate-id', title: 'Two elements with the same id', code: 'E_A11Y_DUPLICATE_ID', markup: true, mark: 'id="email"', options: {accessibility: true},
    html: '<main class="page"><label class="l" for="email" id="email">Email</label><input class="i" type="email" id="email"></main>', css: '.page{display:grid;grid-template-columns:200px}.l{display:block;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}', boxes: text('.l', 'Email')},
  {id: 'aria-reference', title: 'aria-labelledby that points at nothing', code: 'E_A11Y_REFERENCE', markup: true, mark: 'aria-labelledby="dialog-title"', options: {accessibility: true},
    html: '<main class="page"><div class="d" role="dialog" aria-labelledby="dialog-title"><button class="b" aria-label="Close"></button></div></main>', css: '.page{display:grid;grid-template-columns:200px}.d{display:grid;grid-template-columns:44px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}'},
  {id: 'nested-interactive', title: 'A button inside a link', code: 'E_A11Y_NESTED_INTERACTIVE', markup: true, mark: '<button class="b" aria-label="Add to cart"></button>', options: {accessibility: true},
    html: '<main class="page"><a class="card" href="/item"><button class="b" aria-label="Add to cart"></button></a></main>', css: '.page{display:grid;grid-template-columns:200px}.card{display:grid;grid-template-columns:44px;padding:8px;background:#eee}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}'},
  {id: 'image-alt', title: 'An image without alt', code: 'E_A11Y_IMAGE_ALT', markup: true, mark: '<img class="p" src="/wide.png" width="320" height="160">', options: {accessibility: true},
    html: '<main class="page"><img class="p" src="/wide.png" width="320" height="160"></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.p{display:block;width:100%;height:auto}'},
  {id: 'form-label', title: 'A text field with no label', code: 'E_A11Y_LABEL', markup: true, mark: '<input class="i" type="text">', options: {accessibility: true},
    html: '<main class="page"><input class="i" type="text"></main>', css: '.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}'},
  {id: 'role-valid', title: 'A misspelled role', code: 'E_A11Y_ROLE', markup: true, mark: 'role="buton"', options: {accessibility: true},
    html: '<main class="page"><div class="b" role="buton" tabindex="0" aria-label="Save"></div></main>', css: '.page{display:grid;grid-template-columns:120px}.b{height:44px;background:#246}'},
  {id: 'list-structure', title: 'A list with a non-item child', code: 'E_A11Y_LIST', markup: true, mark: '<div class="x"></div>', options: {accessibility: true},
    html: '<main class="page"><ul class="u"><li class="a"></li><div class="x"></div></ul></main>', css: '.page{display:grid;grid-template-columns:200px}.u{display:grid;grid-template-columns:minmax(0,1fr);list-style:none;padding:0}.a,.x{display:block;height:20px}'},
  {id: 'positive-tabindex', title: 'A positive tabindex', code: 'W_A11Y_POSITIVE_TABINDEX', warning: true, markup: true, mark: 'tabindex="3"', options: {accessibility: true},
    html: '<main class="page"><button class="a" aria-label="First"></button><button class="b" tabindex="3" aria-label="Jumps ahead"></button></main>', css: '.page{display:grid;grid-template-columns:120px;row-gap:4px}.a,.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}'},

  {id: 'heading-order', title: 'A heading level skipped', code: 'W_A11Y_HEADING_ORDER', warning: true, markup: true, mark: '<h3 class="h b">Shipping</h3>', options: {accessibility: true}, boxes: {...text('.a', 'Checkout', {}, 20, 28), ...text('.b', 'Shipping', {}, 20, 28)},
    html: '<main class="page"><h1 class="h a">Checkout</h1><h3 class="h b">Shipping</h3></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.h{display:block;font-family:Roboto;font-size:20px;line-height:28px;font-weight:400;white-space:nowrap}'},
  {id: 'empty-heading', title: 'A heading with no text', code: 'E_A11Y_EMPTY_HEADING', markup: true, mark: '<h2 class="e"></h2>', options: {accessibility: true},
    html: '<main class="page"><h2 class="e"></h2></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.e{display:block;height:28px}'},
  {id: 'region', title: 'Content outside every landmark', code: 'W_A11Y_REGION', warning: true, markup: true, mark: '<p class="t">Free shipping over 50 USD</p>', options: {accessibility: true}, boxes: text('.t', 'Free shipping over 50 USD'),
    doc: '<html lang="en"><body><p class="t">Free shipping over 50 USD</p><main class="page"><div class="x"></div></main></body></html>', html: '<body><p class="t">Free shipping over 50 USD</p><main class="page"><div class="x"></div></main></body>', css: '.t{display:block;font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap}.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}'},
  {id: 'multiple-main', title: 'Two main landmarks', code: 'W_A11Y_MULTIPLE_MAIN', warning: true, markup: true, mark: '<main class="m2">', options: {accessibility: true},
    doc: '<html lang="en"><body><main class="m1"><div class="x"></div></main><main class="m2"><div class="x"></div></main></body></html>', html: '<body><main class="m1"><div class="x"></div></main><main class="m2"><div class="x"></div></main></body>', css: '.m1,.m2{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}'},
  {id: 'link-text', title: 'A link named “Read more”', code: 'W_A11Y_LINK_TEXT', warning: true, markup: true, mark: 'aria-label="Read more"', options: {accessibility: true},
    html: '<main class="page"><a class="l" href="/posts/42" aria-label="Read more"></a></main>', css: '.page{display:grid;grid-template-columns:120px}.l{display:block;height:44px;background:#246}'},
  {id: 'new-window', title: 'A link that opens a new tab without saying so', code: 'W_A11Y_NEW_WINDOW', warning: true, markup: true, mark: 'target="_blank"', options: {accessibility: true},
    html: '<main class="page"><a class="l" href="https://example.com/terms" target="_blank" aria-label="Terms of service"></a></main>', css: '.page{display:grid;grid-template-columns:120px}.l{display:block;height:44px;background:#246}'},
  {id: 'autocomplete', title: 'An autocomplete value that is not an autofill token', code: 'E_A11Y_AUTOCOMPLETE', markup: true, mark: 'autocomplete="e-mail"', options: {accessibility: true},
    html: '<main class="page"><input class="i" type="email" aria-label="Email" autocomplete="e-mail"></main>', css: '.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}'},
  {id: 'frame-title', title: 'An iframe without a title', code: 'E_A11Y_FRAME_TITLE', markup: true, mark: '<iframe class="f" src="/map.html">', options: {accessibility: true},
    html: '<main class="page"><iframe class="f" src="/map.html"></iframe></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.f{display:block;width:300px;height:150px;border:0}'},
  {id: 'video-caption', title: 'A video without a captions track', code: 'E_A11Y_VIDEO_CAPTION', markup: true, mark: '<video class="v" src="/intro.mp4" controls>', options: {accessibility: true},
    html: '<main class="page"><video class="v" src="/intro.mp4" controls></video></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.v{display:block;width:320px;height:180px}'},
  // --- what is outside the viewport: a map, or two orientations ---
  {id: 'focus-offscreen', title: 'A skip link parked left of the viewport', code: 'E_A11Y_FOCUS_OFFSCREEN', map: true, options: {accessibility: true},
    html: '<main class="page"><a class="skip" href="#main" aria-label="Skip to content"></a><div class="d"></div></main>', css: '.page{position:relative;display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:30px;background:#fff}.skip{position:absolute;left:-200px;top:0;width:160px;height:30px;display:block;background:#c33}.d{background:#eee}'},
  {id: 'orientation', title: 'Content shown only in portrait', code: 'E_A11Y_ORIENTATION', orientations: [[390, 700], [700, 390]], options: {accessibility: true},
    html: '<main class="m"><div class="x"></div></main>', css: '.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:120px;background:#9cf}@media (orientation: landscape){.m{display:none}}'},
  // --- markup (more) ---
  {id: 'aria-attr', title: 'An unknown aria-* attribute', code: 'E_A11Y_ARIA_ATTR', markup: true, mark: 'aria-lable="Close"', options: {accessibility: true},
    html: '<main class="page"><button class="b" aria-label="Close" aria-lable="Close"></button></main>', css: '.page{display:grid;grid-template-columns:44px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}'},
  {id: 'aria-value', title: 'aria-expanded with an invalid value', code: 'E_A11Y_ARIA_VALUE', markup: true, mark: 'aria-expanded="yes"', options: {accessibility: true},
    html: '<main class="page"><button class="b" aria-label="Menu" aria-expanded="yes"></button></main>', css: '.page{display:grid;grid-template-columns:44px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}'},
  {id: 'role-attr', title: 'A checkbox role without aria-checked', code: 'E_A11Y_ROLE_ATTR', markup: true, mark: 'role="checkbox"', options: {accessibility: true},
    html: '<main class="page"><div class="c" role="checkbox" tabindex="0" aria-label="Agree"></div></main>', css: '.page{display:grid;grid-template-columns:24px}.c{height:24px;border:2px solid #000}'},
  {id: 'role-parent', title: 'A tab outside a tablist', code: 'E_A11Y_ROLE_PARENT', markup: true, mark: 'role="tab"', options: {accessibility: true},
    html: '<main class="page"><div class="g"><button class="t" role="tab" aria-label="Details"></button></div></main>', css: '.page{display:grid;grid-template-columns:120px}.g{display:grid;grid-template-columns:minmax(0,1fr)}.t{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}'},
  {id: 'interactive-role-focusable', title: 'A role=button that cannot take focus', code: 'E_A11Y_ROLE_FOCUS', markup: true, mark: '<div class="b" role="button" aria-label="Save"></div>', options: {accessibility: true},
    html: '<main class="page"><div class="b" role="button" aria-label="Save"></div></main>', css: '.page{display:grid;grid-template-columns:120px}.b{height:44px;background:#246}'},
  {id: 'presentation-conflict', title: 'role=presentation on a focusable element', code: 'E_A11Y_PRESENTATION_CONFLICT', markup: true, mark: 'role="presentation"', options: {accessibility: true},
    html: '<main class="page"><a class="l" href="/home" role="presentation" aria-label="Home"></a></main>', css: '.page{display:grid;grid-template-columns:120px}.l{display:block;height:44px;background:#246}'},
  {id: 'label-for', title: 'label for= that names no field', code: 'E_A11Y_LABEL_FOR', markup: true, mark: 'for="mail"', options: {accessibility: true},
    html: '<main class="page"><label class="l" for="mail" aria-label="Email"></label><input class="i" type="email" id="email" aria-label="Email"></main>', css: '.page{display:grid;grid-template-columns:200px}.l{display:block;height:20px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}'},
  {id: 'absolute-page', title: 'A card badge with no positioned ancestor', code: 'W_LAYOUT_ABSOLUTE_PAGE', warning: true, options: {},
    html: '<main class="page"><div class="gap"></div><div class="card"><span class="badge"></span></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr);row-gap:12px}.gap{height:120px}.card{display:grid;grid-template-columns:minmax(0,1fr);height:120px;background:#eef;outline:1px dashed #999}.badge{position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:12px;background:#c33}'},
  {id: 'declaration-inert', title: 'grid-column on an item of a flex container', code: 'W_LAYOUT_DECLARATION_INERT', warning: true, options: {},
    html: '<main class="page"><div class="row"><div class="c wide"></div><div class="c"></div><div class="c"></div></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:flex;column-gap:8px}.c{width:80px;height:60px;background:#246}.wide{grid-column:span 2;background:#c33}'},
  {id: 'vw-scrollbar', title: 'width: 100vw on a page with a classic scrollbar', code: 'W_LAYOUT_VW_SCROLLBAR', warning: true, markup: true, mark: 'width: 100vw', noScrollbars: true, options: {scrollbars: [{name: 'classic', inlineSize: 15, blockSize: 15}]},
    source: '<style>\n  .hero { width: 100vw; }  /* 100vw = the page + the 15px scrollbar */\n</style>\n<div class="hero"></div>\n<div class="tall"></div>   <!-- the page scrolls: a scrollbar takes 15px -->',
    html: '<div class="hero"></div><div class="tall"></div>', css: 'html{overflow-y:auto}.hero{height:100px;width:100vw}.tall{height:3000px}'},
  {id: 'hyphens-no-lang', title: 'hyphens: auto on a page with no lang', code: 'W_LAYOUT_HYPHENS_NO_LANG', warning: true, markup: true, mark: '<html>', doc: '<html><body><main class="page"><p class="t">Internationalization</p></main></body></html>', options: {boxes: {'.t': {minInlineSize: 40, intrinsicBlockSize: 20}}},
    source: '<html>  <!-- no lang: no hyphenation dictionary -->\n  <body>\n    <p style="hyphens: auto">Internationalization</p>\n  </body>\n</html>',
    html: '<main class="page"><p class="t">Internationalization</p></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.t{line-height:20px;hyphens:auto}'},
  {id: 'font-zoom', title: 'A heading sized only in vw', code: 'W_LAYOUT_FONT_ZOOM', warning: true, markup: true, mark: 'font-size: 5vw', doc: '<html lang="en"><body><main class="page"><h1 class="t"></h1></main></body></html>',
    source: '<style>\n  h1 { font-size: 5vw; }  /* 200% zoom halves the viewport: the heading stays the same size */\n</style>',
    html: '<main class="page"><h1 class="t"></h1></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.t{height:40px;font-size:5vw}'},
  {id: 'root-font-fixed', title: 'A px font-size on html', code: 'W_LAYOUT_ROOT_FONT_FIXED', warning: true, markup: true, mark: 'font-size: 16px', doc: '<html lang="en"><body><main class="page"><div class="b"></div></main></body></html>',
    source: '<style>\n  html { font-size: 16px; }  /* the browser setting "font size: large" is ignored */\n</style>',
    html: '<main class="page"><div class="b"></div></main>', css: 'html{font-size:16px}.page{display:grid;grid-template-columns:minmax(0,1fr)}.b{height:20px}'},
  {id: 'physical-in-rtl', title: 'padding-left in right-to-left content', code: 'W_LAYOUT_PHYSICAL_IN_RTL', warning: true, markup: true, mark: 'padding-left', doc: '<html lang="ar"><body><main class="page" dir="rtl"><div class="item"><div class="icon"></div></div></main></body></html>',
    source: '<style>\n  .item { padding-left: 32px; }  /* room for the icon: on the left in rtl too */\n</style>\n<main dir="rtl">\n  <div class="item">…</div>\n</main>',
    html: '<main class="page" dir="rtl"><div class="item"><div class="icon"></div></div></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.item{display:grid;grid-template-columns:minmax(0,1fr);padding-left:32px}.icon{height:20px}'},
  {id: 'autofocus-hidden', title: 'An autofocus search field hidden on mobile', code: 'W_A11Y_AUTOFOCUS_HIDDEN', warning: true, markup: true, mark: 'display: none', options: {accessibility: true},
    source: '<style>\n  @media (max-width: 500px) { .search { display: none; } }\n</style>\n<input class="search" type="search" aria-label="Search" autofocus>\n<!-- on a phone nothing takes focus on load -->',
    html: '<main class="page"><input class="search" type="search" aria-label="Search" autofocus></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.search{appearance:none;display:block;width:200px;height:32px;padding:0;border:1px solid #000;min-width:0;min-height:0;background:#fff}@media (max-width: 500px){.search{display:none}}'},
  {id: 'live-hidden', title: 'A status message region kept display: none until it is used', code: 'W_A11Y_LIVE_HIDDEN', warning: true, markup: true, mark: 'display: none', options: {accessibility: true, boxes: {'.toast': {minInlineSize: 1, intrinsicBlockSize: 20}}},
    source: '<style>\n  .toast { display: none; }\n  .toast.shown { display: block; }\n</style>\n<div class="toast" role="status"></div>\n<script>\n  toast.textContent = "Saved";  // not reliably announced:\n  toast.classList.add("shown");  // the region was not in the tree yet\n</script>',
    html: '<main class="page"><div class="toast" role="status"></div></main>', css: '.page{display:grid;grid-template-columns:200px}.toast{display:none}'},
  {id: 'title-only', title: 'A field named only by its title', code: 'W_A11Y_TITLE_ONLY', warning: true, markup: true, mark: 'title="Phone number"', options: {accessibility: true},
    html: '<main class="page"><input class="i" type="tel" title="Phone number"></main>', css: '.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}'},
  {id: 'input-button-name', title: 'input type=button with no value', code: 'E_A11Y_INPUT_BUTTON_NAME', markup: true, mark: '<input class="i" type="button">', options: {accessibility: true},
    html: '<main class="page"><input class="i" type="button"></main>', css: '.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}'},
  {id: 'input-image-alt', title: 'input type=image without alt', code: 'E_A11Y_INPUT_IMAGE_ALT', markup: true, mark: '<input class="i" type="image" src="/wide.png">', options: {accessibility: true},
    html: '<main class="page"><input class="i" type="image" src="/wide.png"></main>', css: '.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}'},
  {id: 'scope', title: 'scope on a data cell', code: 'E_A11Y_SCOPE', markup: true, mark: 'scope="col"', options: {accessibility: true},
    html: '<main class="page"><table class="t"><tbody><tr class="r"><td class="c" scope="col"></td></tr></tbody></table></main>', css: '.page{display:grid;grid-template-columns:200px}.t{table-layout:fixed;width:200px;border-spacing:0}.c{padding:0;height:20px}'},
  {id: 'td-headers', title: 'td headers= that names no th', code: 'E_A11Y_TABLE_HEADERS_REF', markup: true, mark: 'headers="price"', options: {accessibility: true},
    html: '<main class="page"><table class="t"><tbody><tr class="r"><th class="h" id="name" aria-label="Name"></th><td class="c" headers="price"></td></tr></tbody></table></main>', css: '.page{display:grid;grid-template-columns:200px}.t{table-layout:fixed;width:200px;border-spacing:0}.h,.c{padding:0;height:20px;width:100px}'},
  {id: 'empty-th', title: 'A header cell with no text', code: 'E_A11Y_EMPTY_TH', markup: true, mark: '<th class="h"></th>', options: {accessibility: true},
    html: '<main class="page"><table class="t"><tbody><tr class="r"><th class="h"></th><td class="c"></td></tr></tbody></table></main>', css: '.page{display:grid;grid-template-columns:200px}.t{table-layout:fixed;width:200px;border-spacing:0}.h,.c{padding:0;height:20px;width:100px}'},
  {id: 'accesskeys', title: 'The same accesskey twice', code: 'W_A11Y_ACCESSKEY', warning: true, markup: true, mark: 'accesskey="s"', options: {accessibility: true},
    html: '<main class="page"><button class="a" accesskey="s" aria-label="Save"></button><button class="b" accesskey="s" aria-label="Search"></button></main>', css: '.page{display:grid;grid-template-columns:120px;row-gap:4px}.a,.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}'},
  {id: 'native-aria-conflict', title: 'aria-checked that contradicts the native state', code: 'W_A11Y_NATIVE_ARIA_CONFLICT', warning: true, markup: true, mark: 'aria-checked="false"', options: {accessibility: true},
    html: '<main class="page"><input class="c" type="checkbox" checked aria-checked="false" aria-label="Agree"></main>', css: '.page{display:grid;grid-template-columns:24px}.c{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:24px;height:24px;border:2px solid #000;background:#fff;margin:0}.c:checked{background:#000}'},
  {id: 'blink', title: 'A marquee', code: 'E_A11Y_BLINK', markup: true, mark: '<marquee class="m">', options: {accessibility: true},
    html: '<main class="page"><marquee class="m"></marquee></main>', css: '.page{display:grid;grid-template-columns:200px}.m{display:block;width:200px;height:24px}'},
  // --- markup and semantics (more) ---
  {id: 'radio-group', title: 'Same-name radios outside a group', code: 'W_A11Y_RADIO_GROUP', warning: true, markup: true, mark: 'name="size"', options: {accessibility: true},
    html: '<main class="page"><input class="a" type="radio" name="size" aria-label="Small"><input class="b" type="radio" name="size" aria-label="Large"></main>', css: '.page{display:grid;grid-template-columns:24px;row-gap:6px}.a,.b{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:24px;height:24px;border:2px solid #000;border-radius:50%;background:#fff;margin:0}'},
  {id: 'fieldset-name', title: 'A fieldset with no legend', code: 'W_A11Y_FIELDSET_NAME', warning: true, markup: true, mark: '<fieldset class="f">', options: {accessibility: true},
    html: '<main class="page"><fieldset class="f"><input class="i" type="text" aria-label="City"></fieldset></main>', css: '.page{display:grid;grid-template-columns:240px}.f{display:grid;grid-template-columns:200px;border:1px solid #999;padding:8px;min-width:0}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}'},
  {id: 'form-submit', title: 'A form with fields but no submit button', code: 'W_A11Y_FORM_SUBMIT', warning: true, markup: true, mark: '<form class="f">', options: {accessibility: true},
    html: '<main class="page"><form class="f"><input class="i" type="search" aria-label="Search"></form></main>', css: '.page{display:grid;grid-template-columns:200px}.f{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}'},
  {id: 'error-message', title: 'aria-invalid with no message', code: 'W_A11Y_INVALID_NO_MESSAGE', warning: true, markup: true, mark: 'aria-invalid="true"', options: {accessibility: true},
    html: '<main class="page"><input class="i" type="email" aria-label="Email" aria-invalid="true"></main>', css: '.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #c00;background:#fff}'},
  {id: 'landmark-name', title: 'Two unnamed navigation landmarks', code: 'W_A11Y_LANDMARK_NAME', warning: true, markup: true, mark: '<nav class="b">', options: {accessibility: true},
    html: '<main class="page"><nav class="a"><a class="l" href="/" aria-label="Home"></a></nav><nav class="b"><a class="l" href="/help" aria-label="Help"></a></nav></main>', css: '.page{display:grid;grid-template-columns:120px;row-gap:6px}.a,.b{display:grid;grid-template-columns:minmax(0,1fr)}.l{display:block;height:44px;background:#246}'},
  {id: 'list-style', title: 'A list styled without markers loses its role in Safari', code: 'W_A11Y_LIST_STYLE', warning: true, markup: true, mark: 'list-style:none', options: {accessibility: true},
    html: '<main class="page"><ul class="u"><li class="a"></li><li class="b"></li></ul></main>', css: '.page{display:grid;grid-template-columns:200px}.u{display:grid;grid-template-columns:minmax(0,1fr);list-style:none;padding:0}.a,.b{display:block;height:20px;background:#eee}', source: '.page{ display:grid; grid-template-columns:200px}\n.u{ display:grid; grid-template-columns:minmax(0,1fr); list-style:none; padding:0}\n.a,.b{ display:block; height:20px; background:#eee}\n'},
  {id: 'clickable-look', title: 'cursor: pointer on something that is not a control', code: 'W_A11Y_CLICK_LOOK', warning: true, markup: true, mark: 'cursor:pointer', options: {accessibility: true},
    html: '<main class="page"><div class="card"></div></main>', css: '.page{display:grid;grid-template-columns:200px}.card{height:60px;background:#9cf;cursor:pointer}', source: '.page{ display:grid; grid-template-columns:200px}\n.card{ height:60px; background:#9cf; cursor:pointer}\n'},
  {id: 'hidden-overridden', title: 'A hidden element that author CSS shows', code: 'W_A11Y_HIDDEN_OVERRIDDEN', warning: true, markup: true, mark: 'hidden', options: {accessibility: true},
    html: '<main class="page"><div class="note" hidden></div></main>', css: '.page{display:grid;grid-template-columns:200px}.note{display:block !important;height:40px;background:#fc9}'},
  {id: 'state-mismatch', title: 'aria-expanded=true while the panel is hidden', code: 'W_A11Y_STATE_MISMATCH', warning: true, markup: true, mark: 'aria-expanded="true"', options: {accessibility: true},
    html: '<main class="page"><button class="b" aria-label="Filters" aria-expanded="true" aria-controls="panel"></button><div class="p" id="panel"></div></main>', css: '.page{display:grid;grid-template-columns:120px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.p{display:none}'},
  {id: 'focus-transparent', title: 'A focusable control that stays at opacity 0', code: 'W_A11Y_FOCUS_TRANSPARENT', warning: true, markup: true, mark: 'opacity:0', options: {accessibility: true},
    html: '<main class="page"><button class="b" aria-label="Upload"></button></main>', css: '.page{display:grid;grid-template-columns:120px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246;opacity:0}', source: '.page{ display:grid; grid-template-columns:120px}\n.b{ appearance:none; display:block; padding:0; border:0; min-width:0; min-height:0; height:44px; background:#246; opacity:0}\n'},
  {id: 'autoplay-audio', title: 'Autoplaying media that is not muted', code: 'W_A11Y_AUTOPLAY_AUDIO', warning: true, markup: true, mark: 'autoplay', options: {accessibility: true},
    html: '<main class="page"><video class="v" src="/intro.mp4" autoplay><track kind="captions" src="/intro.vtt"></video></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.v{display:block;width:320px;height:180px}'},
  {id: 'motion', title: 'A long animation that reduced motion does not stop', code: 'W_A11Y_MOTION', warning: true, markup: true, mark: 'animation:spin 10s infinite', options: {accessibility: true},
    html: '<main class="page"><div class="spinner"></div></main>', css: '@keyframes spin{to{transform:rotate(90deg)}}.page{display:grid;grid-template-columns:60px}.spinner{height:60px;background:#9cf;animation:spin 10s infinite}', source: '@keyframes spin{ to{ transform:rotate(90deg)}\n}\n.page{ display:grid; grid-template-columns:60px}\n.spinner{ height:60px; background:#9cf; animation:spin 10s infinite}\n'},
  {id: 'p-as-heading', title: 'A bold paragraph used as a heading', code: 'W_A11Y_P_AS_HEADING', warning: true, options: {accessibility: true, boxes: {'.p': {text: {font: {...ro(16, 24), weight: 700}, content: 'Delivery options'}}, ...text('.q', 'Choose a delivery time', {}, 16, 24)}},
    html: '<main class="page"><p class="p">Delivery options</p><p class="q">Choose a delivery time</p></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p,.q{display:block;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}.p{font-weight:700}'},
  // --- markup (last) ---
  {id: 'redundant-alt', title: 'An image alt that repeats its caption', code: 'W_A11Y_REDUNDANT_ALT', warning: true, options: {accessibility: true, boxes: text('.c', 'Mount Fuji at dawn')}, highlight: '.c',
    html: '<main class="page"><img class="p" src="/wide.png" width="320" height="160" alt="Mount Fuji at dawn"><p class="c">Mount Fuji at dawn</p></main>', css: '.page{display:grid;grid-template-columns:320px;background:#fff;color:#000}.p{display:block;width:100%;height:auto}.c{display:block;font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap}'},
  {id: 'landmark-top-level', title: 'A main landmark nested in an aside', code: 'W_A11Y_LANDMARK_TOP_LEVEL', warning: true, markup: true, mark: '<main class="m">', options: {accessibility: true},
    doc: '<html lang="en"><body><aside class="a"><main class="m"><div class="x"></div></main></aside></body></html>', html: '<body><aside class="a"><main class="m"><div class="x"></div></main></aside></body>', css: '.a{display:grid;grid-template-columns:minmax(0,1fr)}.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}'},
  {id: 'duplicate-landmark', title: 'Two banner landmarks', code: 'W_A11Y_DUPLICATE_LANDMARK', warning: true, markup: true, mark: '<header class="h2">', options: {accessibility: true},
    doc: '<html lang="en"><body><header class="h1"><div class="x"></div></header><header class="h2"><div class="x"></div></header><main class="m"><div class="x"></div></main></body></html>', html: '<body><header class="h1"><div class="x"></div></header><header class="h2"><div class="x"></div></header><main class="m"><div class="x"></div></main></body>', css: '.h1,.h2,.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}'},
  {id: 'page-h1', title: 'A page with no h1', code: 'W_A11Y_PAGE_H1', warning: true, markup: true, mark: '<main class="m">', options: {accessibility: true},
    doc: '<html lang="en"><body><main class="m"><div class="x"></div></main></body></html>', html: '<body><main class="m"><div class="x"></div></main></body>', css: '.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}'},
  {id: 'no-main', title: 'A page with no main landmark', code: 'W_A11Y_NO_MAIN', warning: true, markup: true, mark: '<div class="m">', options: {accessibility: true},
    doc: '<html lang="en"><body><div class="m"><div class="x"></div></div></body></html>', html: '<body><div class="m"><div class="x"></div></div></body>', css: '.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}'},
  {id: 'link-purpose', title: 'Two links with the same name to different pages', code: 'W_A11Y_LINK_PURPOSE', warning: true, markup: true, mark: 'aria-label="Details"', options: {accessibility: true},
    html: '<main class="page"><a class="a" href="/plans/basic" aria-label="Details"></a><a class="b" href="/plans/pro" aria-label="Details"></a></main>', css: '.page{display:grid;grid-template-columns:120px;row-gap:6px}.a,.b{display:block;height:44px;background:#246}'},
  {id: 'generated-name', title: 'A button named only by CSS generated text', code: 'W_A11Y_GENERATED_NAME', warning: true, markup: true, mark: 'content:"Next"', options: {accessibility: true},
    html: '<main class="page"><button class="b"></button></main>', css: '.page{display:grid;grid-template-columns:120px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:120px;height:44px;background:#246;color:#fff;font-family:Roboto;font-size:16px;line-height:24px}.b::before{content:"Next"}'},
  {id: 'ismap', title: 'A server-side image map', code: 'W_A11Y_ISMAP', warning: true, markup: true, mark: 'ismap', options: {accessibility: true},
    html: '<main class="page"><a class="l" href="/map"><img class="p" src="/wide.png" width="320" height="160" alt="Store map" ismap></a></main>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.l{display:grid;grid-template-columns:minmax(0,1fr)}.p{display:block;width:100%;height:auto}'},
  {id: 'aria-hidden-body', title: 'aria-hidden on body', code: 'W_A11Y_ARIA_HIDDEN_BODY', warning: true, markup: true, mark: 'aria-hidden="true"', options: {accessibility: true},
    doc: '<html lang="en"><body aria-hidden="true"><main class="m"><div class="x"></div></main></body></html>', html: '<body aria-hidden="true"><main class="m"><div class="x"></div></main></body>', css: '.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}'},
  {id: 'safe-area', title: 'A bottom bar under the home indicator (viewport-fit=cover)', code: 'W_LAYOUT_SAFE_AREA', warning: true, band: 34,
    options: {accessibility: true, scrollbars: overlay, safeArea: {top: 47, bottom: 34}, viewport: {min: 390, max: 390, height: {min: 844, max: 844}}},
    doc: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, viewport-fit=cover"><title>Shop</title></head><body><main class="page"><div class="c"></div></main><nav class="bar"><a class="l" href="/" aria-label="Home"></a><a class="l" href="/cart" aria-label="Cart"></a></nav></body></html>',
    html: '<main class="page"><div class="c"></div></main><nav class="bar"><a class="l" href="/" aria-label="Home"></a><a class="l" href="/cart" aria-label="Cart"></a></nav>', css: 'body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:200px;background:#eee}.bar{position:fixed;left:0;bottom:0;width:100%;height:56px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:8px;padding:4px 8px 0;background:#246}.l{display:block;height:48px;background:#9cf}'},
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
  const doc = c.doc ?? `<html lang="en"><body>${c.html}</body></html>`;
  const options = {name: 'P', css: base + c.css, viewport: {min: 320, max: 1024, height: {min: 480, max: 900}}, ...(c.options ?? {}), ...(c.boxes ? {boxes: {...(c.options?.boxes ?? {}), ...c.boxes}} : {})};
  if (!options.scrollbars && !c.noScrollbars) options.scrollbars = overlay;
  const report = analyzeHTML(doc, metrics.resolveOptions(options));
  const all = [...report.diagnostics, ...(report.layoutWarnings ?? []), ...(report.integrity?.warnings ?? []), ...(report.accessibility?.warnings ?? [])];
  const found = all.filter(d => d.code === c.code);
  if (!found.length) { console.error(`${c.id}: expected ${c.code}, got ${report.status}: ${all.map(d => d.code + ' ' + d.message).join(' | ').slice(0, 400)}`); process.exitCode = 1; continue; }
  const d = found[0];
  if (c.markup) {
    // The markup with the reported part marked, and the report under it.
    const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Mark first (sentinels), then break and indent the tags one per line.
    const broken = text => c.source ? text : text.replace(/></g, '>\n<');
    const raw = broken(c.source ?? c.html).split(broken(c.mark)).join(`\u0001${broken(c.mark)}\u0002`);
    let depth = 0;
    const source = c.source ? raw : raw.split('\n').map(line => {
      const plain = line.replace(/[\u0001\u0002]/g, '');
      if (/^<\//.test(plain)) depth = Math.max(0, depth - 1);
      const out = '  '.repeat(depth) + line;
      if (/^<[a-z][^>]*>$/i.test(plain) && !/^<(?:img|input|meta|br|hr|source)\b/i.test(plain) && !/<\/[a-z]+>$/i.test(plain)) depth++;
      return out;
    }).join('\n');
    const marked = esc(source).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
    const card = `<!doctype html><html><head><style>${face}body{margin:0;background:#fff;font-family:Roboto,sans-serif}.card{display:inline-grid;gap:10px;padding:16px;min-width:440px;max-width:620px}pre{margin:0;padding:12px 14px;background:#f5f6f8;border:1px solid #dde1e6;border-radius:4px;font:13px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:#1b1f24}mark{background:none;color:#c00;outline:2px solid #e00;outline-offset:1px;border-radius:2px}.r{font:600 12px/1.4 Roboto,sans-serif;color:#fff;background:rgba(200,0,0,.92);padding:4px 6px;border-radius:3px;justify-self:start}.m{font:12px/1.5 ui-monospace,Menlo,monospace;color:#5b6470;max-width:600px}</style></head><body><div class="card"><pre>${marked}</pre><div class="r">${c.code}</div><div class="m">${esc(d.message)}</div></div></body></html>`;
    const page = await browser.newPage({viewport: {width: 680, height: 600}, deviceScaleFactor: 1});
    await page.setContent(card);
    const box = await page.evaluate(() => { const r = document.querySelector('.card').getBoundingClientRect(); return {x: r.left, y: r.top, width: Math.ceil(r.width), height: Math.ceil(r.height)}; });
    const file = `${c.id}-markup.png`;
    await page.screenshot({path: new URL(file, out).pathname, clip: box});
    await page.close();
    rows.push({...c, d, width: 0, height: 0, shots: [file], count: found.length});
    console.log(`${c.id}: ${c.code} → ${file}`);
    continue;
  }
  if (c.orientations || c.map) {
    const shots = [];
    for (const [i, [w, h]] of (c.orientations ?? [[point(d)[0], point(d)[1]]]).entries()) {
      const page = await browser.newPage({viewport: {width: w, height: h}, deviceScaleFactor: 1});
      await page.setContent(`<!doctype html><html lang="en"><head><style>${face}${base}${c.css}</style></head><body>${c.html}</body></html>`);
      const file = `${c.id}-${c.orientations ? (w < h ? 'portrait' : 'landscape') : 'map'}.png`;
      if (c.map) {
        // A map of the page around the viewport: the viewport frame and the reported box, drawn at half scale.
        const r = await page.evaluate(() => { const e = document.querySelector('.skip'); const b = e.getBoundingClientRect(); return {x: b.left, y: b.top, w: b.width, h: b.height}; });
        const shotData = (await page.screenshot()).toString('base64');
        const left = Math.min(0, r.x) - 24, scale = 0.5, W = (w - left + 24) * scale, Hh = 140;
        const map = `<!doctype html><html><head><style>${face}body{margin:0;background:#f5f6f8;font-family:Roboto,sans-serif}</style></head><body><div id="m" style="position:relative;width:${W}px;height:${Hh + 36}px">
          <img src="data:image/png;base64,${shotData}" style="position:absolute;left:${(0 - left) * scale}px;top:12px;width:${w * scale}px;height:${Math.min(h, (Hh - 12) / scale) * scale}px;object-fit:cover;object-position:top;outline:2px solid #1b1f24">
          <div style="position:absolute;left:${(0 - left) * scale}px;top:${Hh + 2}px;font:600 11px Roboto;color:#1b1f24">viewport (0 … ${w}px)</div>
          <div style="position:absolute;left:${(r.x - left) * scale}px;top:${12 + r.y * scale}px;width:${r.w * scale}px;height:${r.h * scale}px;border:3px solid #e00;background:rgba(255,0,0,.15)"></div>
          <div style="position:absolute;left:4px;top:${Hh + 18}px;font:600 12px Roboto;color:#fff;background:rgba(200,0,0,.92);padding:2px 6px;border-radius:3px;white-space:nowrap">${c.code} — the focusable link is at x = ${Math.round(r.x)}px, outside the viewport</div></div></body></html>`;
        await page.setViewportSize({width: Math.max(Math.ceil(W) + 380, 720), height: Hh + 60});
        await page.setContent(map);
        const box = await page.evaluate(() => { const b = document.getElementById('m').getBoundingClientRect(); return {x: 0, y: 0, width: Math.ceil(Math.max(b.width, 660)), height: Math.ceil(b.height)}; });
        await page.screenshot({path: new URL(file, out).pathname, clip: box});
      } else {
        const visible = await page.evaluate(() => getComputedStyle(document.querySelector('.m')).display !== 'none');
        await page.evaluate(({label, visible}) => { const m = document.querySelector('.m'); if (visible) { const r = m.getBoundingClientRect(); const e = document.createElement('div'); Object.assign(e.style, {position: 'fixed', left: r.left - 2 + 'px', top: r.top - 2 + 'px', width: r.width + 4 + 'px', height: r.height + 4 + 'px', border: '3px solid #e00', boxSizing: 'border-box'}); document.body.append(e); }
          const t = document.createElement('div'); t.textContent = label; Object.assign(t.style, {position: 'fixed', left: '4px', bottom: '4px', font: '600 12px Roboto, sans-serif', color: '#fff', background: 'rgba(200,0,0,.92)', padding: '4px 6px', borderRadius: '3px'}); document.body.append(t); },
          {label: `${c.code} — ${w < h ? 'portrait: shown' : 'landscape: the content is gone'}`, visible});
        await page.screenshot({path: new URL(file, out).pathname});
      }
      await page.close();
      shots.push(file);
    }
    rows.push({...c, d, width: c.orientations ? 0 : point(d)[0], height: c.orientations ? 0 : point(d)[1], shots, count: found.length});
    console.log(`${c.id}: ${c.code} → ${shots.join(', ')}`);
    continue;
  }
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
  // The reported boxes (by path), plus any element the case names to outline as well (such as a jump target).
  const rects = () => page.evaluate(({paths, extra}) => [...paths.map(path => {
    let n = document.documentElement;
    for (const i of path.split('/').slice(1).map(Number)) { if (i < 0) return null; n = [...n.children].filter(c => c.tagName !== 'HEAD')[i]; if (!n) return null; }
    return n;
  }), ...(extra ? [document.querySelector(extra)] : [])].map(n => { if (!n) return null; const r = n.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; }), {paths, extra: c.highlight});
  const draw = (boxes, ghosts, label) => page.evaluate(({boxes, ghosts, label, whole, band}) => {
    document.querySelectorAll('.__ce').forEach(e => e.remove());
    const add = (r, style) => { if (!r) return; const e = document.createElement('div'); e.className = '__ce'; Object.assign(e.style, {position: 'fixed', left: r.x - 2 + 'px', top: r.y - 2 + 'px', width: r.w + 4 + 'px', height: r.h + 4 + 'px', zIndex: 2147483647, pointerEvents: 'none', boxSizing: 'border-box', forcedColorAdjust: 'none', ...style}); document.body.append(e); };
    for (const r of ghosts) add(r, {border: '2px dashed #e00', background: 'rgba(255,0,0,.06)'});
    if (band) { const e = document.createElement('div'); e.className = '__ce'; e.textContent = `safe area ${band}px (home indicator)`; Object.assign(e.style, {position: 'fixed', left: 0, right: 0, bottom: 0, height: band + 'px', zIndex: 2147483646, pointerEvents: 'none', font: '600 11px Roboto, sans-serif', color: '#fff', display: 'grid', placeItems: 'center', background: 'repeating-linear-gradient(135deg, rgba(0,0,0,.55) 0 6px, rgba(0,0,0,.35) 6px 12px)'}); document.body.append(e); }
    for (const r of boxes) add(r, {border: '3px solid #e00'});
    // The picture: the page content and every outline, padded; the label sits below it.
    const parts = [document.querySelector('main').getBoundingClientRect(), ...[...boxes, ...ghosts].filter(Boolean).map(r => ({left: r.x, top: r.y, right: r.x + r.w, bottom: r.y + r.h}))];
    const full = innerHeight;
    let x0 = Math.max(0, Math.min(...parts.map(r => r.left)) - 16), y0 = Math.max(0, Math.min(...parts.map(r => r.top)) - 16);
    let x1 = Math.min(innerWidth, Math.max(...parts.map(r => r.right)) + 16), y1 = Math.min(full - 30, Math.max(...parts.map(r => r.bottom)) + 16);
    if (whole) { x0 = 0; y0 = 0; x1 = innerWidth; y1 = full - 30; }
    x1 = Math.max(x1, Math.min(innerWidth, x0 + 280));
    const tag = document.createElement('div'); tag.className = '__ce'; tag.textContent = label;
    Object.assign(tag.style, {position: 'fixed', left: x0 + 'px', top: (band ? 4 : y1 + 4) + 'px', maxWidth: (x1 - x0 - 8) + 'px', font: '600 12px/1.3 Roboto, sans-serif', color: '#fff', background: 'rgba(200,0,0,.92)', padding: '4px 6px', borderRadius: '3px', zIndex: 2147483647, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', forcedColorAdjust: 'none'});
    document.body.append(tag);
    // The DevTools clip is in document coordinates: add the scroll offset.
    return {x: x0 + scrollX, y: y0 + scrollY, width: x1 - x0, height: Math.min(full, y1 + 30) - y0};
  }, {boxes, ghosts, label, band: c.band, whole: c.state === 'scroll' || Boolean(c.act && c.options?.scrollbars) || Boolean(c.band)});
  const shot = async (name, label, ghosts = []) => { const clip = await draw(await rects(), ghosts, label); const file = `${c.id}-${name}.png`; const {data} = await cdp.send('Page.captureScreenshot', {format: 'png', clip: {...clip, scale: 1}}); writeFileSync(new URL(file, out), Buffer.from(data, 'base64')); return file; };
  const shots = [];
  const stateful = (c.state && c.state !== 'focus') || Boolean(c.act);
  if (c.beforeAct) await c.beforeAct(page);
  const before = await rects();
  shots.push(await shot(stateful ? 'before' : 'violation', `${c.code}${stateful ? ` — ${c.beforeLabel ?? 'before'}` : ''}`));
  if (c.state === 'focus') { await page.evaluate(() => document.querySelectorAll('.__ce').forEach(e => e.remove())); await page.focus(c.focus); shots.splice(0, 1, await shot('violation', `${c.code} — ${c.focusLabel ?? 'focused, nothing shows focus'}`)); }
  if (stateful) {
    await page.evaluate(() => document.querySelectorAll('.__ce').forEach(e => e.remove()));
    if (c.act) await c.act(page);
    if (c.state === 'hover') await page.hover(c.hover);
    if (c.state === 'slide') await page.evaluate(() => { const [a, b] = document.querySelectorAll('[aria-roledescription=slide]'); a.hidden = true; b.hidden = false; });
    if (c.state === 'animation') await page.evaluate(sel => { const a = document.querySelector(sel).getAnimations()[0]; a.currentTime = 999; }, c.animated);
    if (c.state === 'load') await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
    if (c.state === 'font') releaseFont();
    if (c.state === 'font') await page.evaluate(async () => { await document.fonts.load('32px WebFace'); await document.fonts.ready; });
    if (c.state === 'scroll') await page.evaluate(async () => { scrollTo(0, 120); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await page.waitForTimeout(50);
    shots.push(await shot('after', `${c.code} — after (${c.afterLabel ?? ({hover: 'hovered', slide: 'next slide', animation: 'keyframe 100%', load: 'image loaded', font: 'web font loaded', scroll: 'scrolled 120px'})[c.state]})`, before));
  }
  releaseFont();
  await page.close();
  rows.push({...c, d, width, height, shots, count: found.length});
  console.log(`${c.id}: ${c.code} at ${width}×${height} → ${shots.join(', ')}`);
}
await browser.close();

const md = ['# 反例ギャラリー', '',
  '各パターンで、わざと違反する小さなページを静的に検査し、報告された反例の viewport で Chromium に描画した画像。赤い実線の枠が報告された箱、点線の枠が状態が変わる前の位置(動いた分が layout shift)。`node tools/counterexample-gallery.mjs` で再生成する。', '',
  ...rows.flatMap(r => [`## ${r.title}`, '', r.width ? `\`${r.code}\` — viewport ${r.width} × ${r.height}px` : `\`${r.code}\` — markup rule (nothing to see on screen)`, '', `> ${r.d.message}`, '', r.shots.map(s => `![${r.id}](${s})`).join(' '), '',
    '<details><summary>HTML / CSS</summary>', '', '```html', r.html, '```', '', '```css', r.css, '```', '', '</details>', ''])];
writeFileSync(new URL('README.md', out), md.join('\n'));
writeFileSync(new URL('gallery.json', out), JSON.stringify(rows.map(r => ({id: r.id, title: r.title, code: r.code, width: r.width, height: r.height, message: r.d.message, shots: r.shots, html: r.html, css: r.css})), null, 1));
