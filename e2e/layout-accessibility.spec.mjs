// Differential eval: static accessibility rules (whole viewport domain)
// versus the browser at 1280/768/375. Oracles: Chromium's accessibility tree
// (names), hit testing (occlusion), focus (hidden-focusable), rendered rects
// (overlap, order), computed colors and `vlmkit check a11y contrast` at 1280
// (contrast). Browser runs only cross-check the model; they never accept source.
import {test, expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const results = new URL('../evals/results/layout-accessibility/', import.meta.url);
const widths = [1280, 768, 375], height = 800;
const reset = '*{box-sizing:border-box;margin:0;padding:0}html,body{margin:0}';
const button = 'appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;background:transparent;color:inherit;font:inherit;';
const type = 'font-family:sans-serif;font-size:16px;line-height:20px;';
const label = {minInlineSize: 1, intrinsicBlockSize: 20};
const cases = [
  {name: 'label-hidden-when-narrow', html: '<main class="bar"><a class="go" href="#x"><span class="label">Next page</span></a></main>',
    css: `.bar{display:grid;grid-template-columns:200px;grid-template-rows:40px;background:#fff;color:#000;${type}}.go{display:grid;grid-template-columns:minmax(0,1fr);color:inherit}.label{display:block}@media (width < 600px){.label{display:none}}`, boxes: {'.label': label}},
  {name: 'icon-buttons', html: '<main class="bar"><button class="b1" aria-label="Close"></button><button class="b2"></button><button class="b3" title="Menu"></button></main>',
    css: `.bar{display:grid;grid-template-columns:40px 40px 40px;grid-template-rows:40px;background:#fff}.b1,.b2,.b3{${button}}`},
  {name: 'label-visibility', html: '<main class="bar"><a class="go" href="#x"><span class="label">Hidden label</span></a><a class="ok" href="#y"><span class="shown">Shown</span></a></main>',
    css: `.bar{display:grid;grid-template-columns:150px 150px;grid-template-rows:40px;background:#fff;color:#000;${type}}.go,.ok{display:grid;grid-template-columns:minmax(0,1fr);color:inherit}.label,.shown{display:block}.go{visibility:hidden}.label{visibility:visible}.ok{visibility:hidden}`,
    boxes: {'.label': label, '.shown': label}},
  {name: 'grey-text-by-width', html: '<main class="card"><p class="t">Body text that needs contrast</p></main>',
    css: `.card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:40px;background:#fff;color:#000;${type}}.t{font-size:16px}@media (width >= 800px){.card{color:#777}}`, boxes: {'.t': label}},
  {name: 'translucent-panel', html: '<main class="page"><section class="panel"><p class="t">White on half black</p></section></main>',
    css: `.page{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:60px;background:#fff}.panel{display:grid;grid-template-columns:minmax(0,1fr);background:rgba(0,0,0,.5);color:#fff;${type}}`, boxes: {'.t': label}},
  {name: 'large-grey-heading', html: '<main class="card"><h1 class="t">Large heading</h1></main>',
    css: `.card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:40px;background:#fff;color:#767676;font-family:sans-serif;line-height:30px}.t{font-size:24px;font-weight:400}`, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 30}}},
  {name: 'badge-over-button', html: '<main class="panel"><button class="go" aria-label="Go"></button><div class="cover"></div><div class="ghost"></div></main>',
    css: `.panel{display:grid;grid-template-columns:100px minmax(0,1fr);grid-template-rows:40px;position:relative;background:#fff}.go{${button}}.cover{position:absolute;top:0;left:80px;inline-size:60px;block-size:40px;background:#fdd}.ghost{position:absolute;top:0;left:0;inline-size:30px;block-size:40px;pointer-events:none;background:#ddf}`},
  {name: 'overlapping-links', html: '<main class="panel"><button class="go" aria-label="Go"></button><a class="link" href="#x" aria-label="More"></a></main>',
    css: `.panel{display:grid;grid-template-columns:100px minmax(0,1fr);grid-template-rows:40px;position:relative;background:#fff}.go{${button}}.link{display:block;position:absolute;top:0;left:90px;inline-size:60px;block-size:40px}`},
  {name: 'reordered-grid', html: '<main class="grid"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.grid{display:grid;grid-template-columns:100px 100px;grid-template-rows:40px 40px}.a{grid-column:2;grid-row:1}.b{grid-column:1;grid-row:1}.c{grid-column:1;grid-row:2}@media (width < 600px){.a,.b,.c{grid-column:auto;grid-row:auto}}'},
  {name: 'hidden-dialog', html: '<main class="bar" aria-hidden="true"><button class="b1" aria-label="A"></button><button class="b2" disabled aria-label="B"></button><a class="b3" tabindex="-1" aria-label="C"></a><a class="b4" href="#d" aria-label="D"></a></main>',
    css: `.bar{display:grid;grid-template-columns:40px 40px 40px 40px;grid-template-rows:40px;background:#fff}.b1,.b2{${button}}.b3,.b4{display:block}@media (width < 600px){.b4{display:none}}`},
  {name: 'headings-by-width', html: '<div class="page"><h1 class="h1">Title</h1><h2 class="h2">Section</h2><h3 class="h3">Detail</h3><h2 class="e"></h2></div>',
    css: `.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:30px;background:#fff;color:#000}.h1,.h2,.h3,.e{${type}font-weight:400}@media (width < 600px){.h2{display:none}}`, boxes: {'.h1': label, '.h2': label, '.h3': label}},
  {name: 'nested-and-references', html: '<div class="page"><a class="outer" href="#a" aria-label="Outer"><button class="inner" aria-label="Inner"></button></a><div class="t" id="dup"></div><div class="u" id="dup"></div><button class="b" aria-labelledby="dup missing" tabindex="2"></button></div>',
    css: `.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:30px;background:#fff}.outer{display:grid;grid-template-columns:minmax(0,1fr)}.inner,.b{${button}}`},
  {name: 'two-mains-on-wide', html: '<div class="page"><main class="m1"></main><main class="m2"></main></div>',
    css: '.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:30px}@media (width < 600px){.m2{display:none}}'},
  {name: 'scroller-without-focus', html: '<div class="page"><section class="s"></section><section class="k" tabindex="0"></section></div>',
    css: '.page{display:grid;grid-template-columns:300px;grid-auto-rows:40px}.s,.k{display:grid;grid-template-columns:500px;grid-template-rows:40px;overflow:auto;scrollbar-width:none}@media (width >= 900px){.s{grid-template-columns:200px}}',
    boxes: {'.s': {overflow: 'scroll'}, '.k': {overflow: 'scroll'}}},
  {name: 'wide-banner-at-320', html: '<div class="page"><div class="w"></div></div>', css: '.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:40px}.w{inline-size:350px}',
    boxes: {'.page': {overflow: 'visible'}}, widths: [320, 340, 375], min: 320},
  {name: 'sheet-over-button', html: '<main class="panel"><button class="go" aria-label="Go"></button><button class="zero" aria-label="Zero"></button><div class="sheet"></div></main>',
    css: `.panel{display:grid;grid-template-columns:100px 0px minmax(0,1fr);grid-template-rows:40px;position:relative;background:#fff}.go,.zero{${button}}.sheet{position:absolute;top:0;left:0;inline-size:120px;block-size:40px;background:#eee}@media (width < 600px){.sheet{inline-size:50px}}`},
  {name: 'disabled-pointer-and-fine-print', html: '<main class="bar"><button class="b1" aria-label="A"></button><button class="b2" aria-label="B"></button><p class="fine">Fine print</p></main>',
    css: `.bar{display:grid;grid-template-columns:40px 40px minmax(0,1fr);grid-template-rows:40px;background:#fff;color:#000;pointer-events:none;${type}}.b1,.b2{${button}}.b2{pointer-events:auto}.fine{font-size:11px}@media (width >= 900px){.fine{font-size:14px}}`, boxes: {'.fine': label}},
  {name: 'tight-icon-row', html: '<main class="row"><button class="i1" aria-label="A"></button><button class="i2" aria-label="B"></button><button class="i3" aria-label="C"></button></main>',
    css: `.row{display:flex;column-gap:2px;block-size:20px}.i1,.i2,.i3{${button}flex:none;width:20px;height:20px}@media (width >= 900px){.row{column-gap:4px}}`},
  {name: 'icon-beside-full-button', html: '<main class="row"><button class="i" aria-label="A"></button><button class="f" aria-label="B"></button></main>',
    css: `.row{display:flex;column-gap:1px;align-items:flex-start;block-size:24px}.i,.f{${button}flex:none}.i{width:20px;height:20px}.f{width:24px;height:24px}@media (width >= 600px){.row{column-gap:2px}}`},
  {name: 'stacked-small-links', html: '<main class="list"><a class="l1" href="#1" aria-label="One"></a><a class="l2" href="#2" aria-label="Two"></a></main>',
    css: '.list{display:grid;grid-template-columns:120px;grid-template-rows:16px 16px;row-gap:6px}.l1,.l2{display:block}@media (width >= 700px){.list{row-gap:10px}}'},
  {name: 'icon-with-equivalent', html: '<main class="row"><button class="i" aria-label="Edit" data-a11y-equivalent="edit"></button><button class="j" aria-label="More"></button><button class="t" id="edit">Edit</button></main>',
    css: `.row{display:flex;column-gap:1px;align-items:flex-start;block-size:30px;background:#fff;color:#000;${type}}.i,.j,.t{${button}flex:none}.i,.j{width:20px;height:20px}.t{width:60px;height:30px}@media (width < 600px){.t{display:none}}`, boxes: {'.t': label}},
  {name: 'aaa-forty-pixel-buttons', html: '<main class="row"><button class="b1" aria-label="A"></button><button class="b2" aria-label="B" data-a11y-essential="fixed control panel"></button></main>',
    css: `.row{display:flex;column-gap:40px;align-items:flex-start;block-size:60px}.b1,.b2{${button}flex:none;width:40px;height:40px}`, accessibility: {targetLevel: 'AAA'}},
  {name: 'images-and-image-links', html: '<div class="page"><img class="p1" src="data:," ><img class="p2" src="data:," alt=""><a class="go" href="#h"><img class="p3" src="data:," alt="Home"></a><a class="bad" href="#x"><img class="p4" src="data:," alt=""></a></div>',
    css: `.page{display:grid;grid-template-columns:120px;grid-auto-rows:40px;row-gap:4px;background:#fff}.p1,.p2,.p3,.p4{display:block;inline-size:120px;block-size:40px}.go,.bad{display:grid;grid-template-columns:minmax(0,1fr)}@media (width < 600px){.p1{display:none}}`},
  {name: 'form-fields', html: '<div class="page"><label class="l1" for="email">Email</label><input class="f1" id="email" type="email"><label class="w"><span class="l2">Name</span><input class="f2" type="text"></label><input class="f3" type="text" placeholder="Search"><input class="f4" type="text"><select class="f5" aria-label="Country"></select><textarea class="f6" title="Notes"></textarea><label class="l3" for="nowhere">Ghost</label><input class="f7" type="submit" value="Send"><input class="f8" type="hidden"></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-auto-rows:32px;row-gap:4px;background:#fff;color:#000;${type}}.l1,.l2,.l3{display:block}.w{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:20px 32px}.f1,.f2,.f3,.f4,.f5,.f6,.f7,.f8{${button}inline-size:200px;block-size:32px;border:1px solid #000}@media (width < 600px){.l1{display:none}}`,
    boxes: {'.l1': label, '.l2': label, '.l3': label}},
  {name: 'lists-radios-navs', html: '<div class="page"><ul class="ok"><li class="i1"></li></ul><div class="bad"><li class="i2"></li></div><ul class="mixed"><li class="i3"></li><div class="d"></div></ul><input class="r1" type="radio" name="size" aria-label="S"><input class="r2" type="radio" name="size" aria-label="M"><div class="g" role="radiogroup" aria-label="Color"><input class="r3" type="radio" name="color" aria-label="Red"><input class="r4" type="radio" name="color" aria-label="Blue"></div><nav class="n1"></nav><nav class="n2" aria-label="Footer"></nav></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-auto-rows:30px;background:#fff}.ok,.bad,.mixed,.g{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:30px;margin:0;padding:0}.i1,.i2,.i3,.d{display:block}.r1,.r2,.r3,.r4{${button}inline-size:30px;block-size:30px}@media (width < 600px){.n2{display:none}}`},
  {name: 'aria-roles', html: '<div class="page"><div class="a" role="buton"></div><div class="b" role="button" aria-label="Go"></div><div class="c" role="button" tabindex="0" aria-label="Ok"></div><div class="d" role="checkbox" tabindex="0"></div></div>',
    css: '.page{display:grid;grid-template-columns:100px;grid-auto-rows:30px;background:#fff}.a,.b,.c,.d{display:block}'},
  {name: 'links-in-text', html: '<div class="page"><p class="p1">Read the <a class="u" href="#a">guide</a> first.</p><p class="p2">Or the <a class="c" href="#b">notes</a> or <a class="v" href="#c">faq</a>.</p><p class="p3">An <span class="g">aside</span> and <a class="e" href="#d"></a>.</p></div>',
    css: `.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:24px;background:#fff;color:#222;${type}}.p1,.p2,.p3{display:block}.u{color:#0645ad}.c{color:#333;text-decoration:none}.v{color:#0645ad;text-decoration:none}.g{color:#aaa}.e{color:#0645ad}@media (width < 600px){.c{text-decoration:underline}}`,
    boxes: {'.p1': label, '.p2': label, '.p3': label}},
  {name: 'tables-and-fieldsets', html: '<div class="page"><table class="t1"><thead class="h"><tr class="r"><th class="c" id="name">Name</th></tr></thead><tbody class="b"><tr class="r"><td class="d" headers="name nope">Ada</td></tr></tbody></table><table class="t2"><tbody class="b"><tr class="r"><td class="d">x</td></tr></tbody></table><fieldset class="fs"><input class="i" type="radio" name="q" aria-label="Yes"><input class="i" type="radio" name="q" aria-label="No"></fieldset><fieldset class="fs2"><legend class="lg">Size</legend><input class="i" type="radio" name="s" aria-label="S"></fieldset></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-auto-rows:30px;background:#fff;color:#000;${type}}.t1,.t2{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:24px}.h,.b,.r{display:contents}.c,.d{display:block;font-weight:700;text-align:left}.fs{display:grid;grid-template-columns:30px 30px;margin:0;padding:0;border:0;min-inline-size:0}.fs2{display:contents}.lg{display:block;padding:0}.i{${button}inline-size:30px;block-size:30px}@media (width < 600px){.c{display:none}}`,
    boxes: {'.c': label, '.d': label, '.lg': label}},
  {name: 'link-texts', html: '<div class="page"><a class="a1" href="/s" aria-label="Find">Search</a><a class="a2" href="/s2" aria-label="Search the site">Search</a><a class="a3" href="/p1">Pricing</a><a class="a4" href="/p2">Pricing</a><a class="a5" href="/m">Read more</a><nav class="n1" aria-label="Main"></nav><nav class="n2" aria-label="main"></nav></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-auto-rows:24px;background:#fff;color:#000;${type}}.a1,.a2,.a3,.a4,.a5{display:block;color:inherit}@media (width < 600px){.a4{display:none}}`,
    boxes: {'.a1': label, '.a2': label, '.a3': label, '.a4': label, '.a5': label}},
  {name: 'aria-forms-and-orientation', html: '<div class="page"><div class="t1" role="tab" tabindex="0" aria-label="Tab" aria-selected="true"></div><div class="a1" aria-lable="x"></div><div class="a2" aria-expanded="yes"></div><button class="b1" role="presentation" aria-label="Go"></button><input class="f1" type="email" autocomplete="emial" aria-label="Email"><input class="f2" type="email" autocomplete="shipping email" aria-label="Ship"><input class="f3" type="button"><input class="f4" type="button" value="Go"><p class="p1">Title</p><p class="p2">Body</p><main class="m"></main></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-auto-rows:30px;background:#fff;color:#000;${type}}.t1,.a1,.a2,.m{display:block}.b1,.f1,.f2,.f3,.f4{${button}inline-size:200px;block-size:30px}.p1,.p2{display:block;font-weight:400}.p1{font-weight:700}@media (orientation: landscape){.m{display:none}}`,
    boxes: {'.p1': label, '.p2': label}},
  {name: 'table-scope-and-empty-header', html: '<table class="t"><thead class="h"><tr class="r"><th class="c" scope="column"></th><th class="c2" scope="col">B</th></tr></thead><tbody class="b"><tr class="r"><td class="d" scope="row">1</td><td class="d">2</td></tr></tbody></table>',
    css: `.t{display:grid;grid-template-columns:100px 100px;grid-auto-rows:24px;background:#fff;color:#000;${type}}.h,.b,.r{display:contents}.c,.c2,.d{display:block;font-weight:700;text-align:left}`, boxes: {'.c2': label, '.d': label}},
  {name: 'focus-hover-and-spacing', html: '<div class="page"><button class="b1">Plain</button><button class="b2">No ring</button><button class="b3">Shadow</button><button class="b4">Pale hover</button><p class="t1">Clipped line</p><p class="t2">Roomy line</p></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-template-rows:30px 30px 30px 30px 20px 24px;background:#fff;color:#000;${type}}.b1,.b2,.b3,.b4{${button}inline-size:200px;block-size:30px;background:#fff;color:#000}.b2,.b3{outline:none}.b3:focus-visible{box-shadow:0 0 0 3px #1a73e8}.b4:hover{color:#bbb}.t1,.t2{display:block;font-family:"Noto Sans JP";font-size:16px;line-height:20px;font-weight:400;white-space:nowrap;overflow:hidden}`,
    boxes: {'.b1': label, '.b2': label, '.b3': label, '.b4': label, '.t1': {...label, font: {family: 'Noto Sans JP', size: 16, lineHeight: 20, weight: 400}, wrap: 'nowrap', textMetrics: {kind: 'content', text: 'x', width: 1}, overflow: 'clip', overflowBlock: 'clip'}, '.t2': {...label, font: {family: 'Noto Sans JP', size: 16, lineHeight: 20, weight: 400}, wrap: 'nowrap', textMetrics: {kind: 'content', text: 'x', width: 1}, overflow: 'clip', overflowBlock: 'clip'}}},
  {name: 'frames-and-media', html: '<div class="page"><iframe class="f1" src="about:blank"></iframe><iframe class="f2" src="about:blank" title="Map"></iframe><video class="v1" controls></video><video class="v2" controls autoplay><track kind="captions" src="data:text/vtt,WEBVTT"></video><video class="v3" autoplay muted><track kind="subtitles" src="data:text/vtt,WEBVTT"></video><audio class="a1" autoplay></audio></div>',
    css: '.page{display:grid;grid-template-columns:160px;grid-auto-rows:100px;background:#fff}.f1,.f2,.v1,.v2,.v3{display:block;inline-size:160px;block-size:90px;border:0}'},
  {name: 'hover-revealed-actions', html: '<div class="page"><button class="h1" aria-label="Delete"></button><button class="h2" aria-label="Edit"></button></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-auto-rows:30px;background:#fff}.h1,.h2{${button}inline-size:200px;block-size:30px;opacity:0}.h1:hover,.h2:hover,.h2:focus-visible{opacity:1}`},
  // User preferences: the dark scheme is checked for contrast; reduced motion must stop long animations.
  {name: 'dark-scheme-and-motion', html: '<div class="page"><p class="t1">Always readable</p><p class="t2">Pale in dark</p><div class="spin"></div><div class="calm"></div><div class="ghost"></div></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-auto-rows:24px;background:#fff;color:#000;${type}}.t1,.t2,.spin,.calm,.ghost{display:block}.spin,.calm{animation:spin 1s linear infinite}.ghost{animation:nothing 1s infinite}@keyframes spin{to{opacity:.5}}@media (prefers-reduced-motion: reduce){.calm{animation:none}}@media (prefers-color-scheme: dark){.page{background:#111;color:#eee}.t2{color:#555}}`,
    boxes: {'.t1': label, '.t2': label}, schemes: ['dark']},
  {name: 'color-scheme-system-colors', html: '<div class="page"><section class="s1"><p class="t1">Follows the scheme</p><p class="t2">Grey</p></section><section class="s2"><p class="t3">Always dark</p><p class="t4">Grey</p></section></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-auto-rows:48px;${type}}.s1,.s2{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:24px;background:Canvas;color:CanvasText}.s1{color-scheme:light dark}.s2{color-scheme:dark}.t1,.t2,.t3,.t4{display:block}.t2,.t4{color:#555}`,
    boxes: {'.t1': label, '.t2': label, '.t3': label, '.t4': label}, schemes: ['dark']},
  {name: 'caption-outside-table-background', html: '<div class="page"><table class="t"><caption class="cap">Prices</caption><tbody class="b"><tr class="r"><td class="d">Tea</td></tr></tbody></table></div>',
    css: `.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;${type}}.t{table-layout:fixed;inline-size:300px;border-spacing:0;background:#000;color:#fff}.cap,.d{block-size:20px;padding:0}`,
    boxes: {'.cap': label, '.d': label},
    // vlmkit composites DOM ancestors' backgrounds, as the table's background were behind the caption;
    // the rendered pixels decide instead: white caption text over the white page leaves the caption all white.
    pixels: {selector: '.cap', uniform: [255, 255, 255]}},
  {name: 'fragment-links-and-image-buttons', html: '<div class="page"><a class="k1" href="#main" aria-label="Skip"></a><a class="k2" href="#nowhere" aria-label="Broken"></a><a class="k3" href="#side" aria-label="Side"></a><input class="i1" type="image" src="data:," alt="Search"><input class="i2" type="image" src="data:,"><input class="i3" type="image" src="data:," value="Go"><section class="s" id="main"></section><aside class="d" id="side"></aside></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-auto-rows:24px;background:#fff}.k1,.k2,.k3,.s,.d{display:block}.i1,.i2,.i3{${button}inline-size:24px;block-size:24px}@media (width < 600px){.d{display:none}}`},
  {name: 'clickable-lists-and-markup', html: '<div class="page"><div class="card"></div><button class="b" aria-label="Go"></button><ul class="l"><li class="i"></li></ul><ul class="l2" role="list"><li class="i"></li></ul><dl class="d"><dt class="dt"></dt><p class="p"></p></dl><marquee class="m"></marquee><a class="k1" href="#1" accesskey="s" aria-label="One"></a><a class="k2" href="#2" accesskey="s" aria-label="Two"></a><img class="im" src="data:," alt="Map" ismap></div>',
    css: `.page{display:grid;grid-template-columns:200px;grid-auto-rows:24px;background:#fff}.card{display:block;cursor:pointer}.b{${button}cursor:pointer;inline-size:24px;block-size:24px}.l,.l2,.d{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:24px;list-style:none}.i,.dt,.p{display:block}.m{display:block;inline-size:200px;block-size:24px}.k1,.k2{display:block}.im{display:block;inline-size:24px;block-size:24px}`},
];
const rules = ['accessible-name', 'text-contrast', 'occluded-target', 'target-overlap', 'visual-order', 'hidden-focusable', 'empty-heading', 'heading-order', 'nested-interactive', 'duplicate-id', 'aria-reference', 'positive-tabindex', 'multiple-main', 'scrollable-region-focusable', 'reflow', 'focus-obscured', 'focus-area', 'pointer-disabled', 'small-text', 'target-size', 'image-alt', 'form-label', 'label-for', 'list-structure', 'radio-group', 'landmark-name', 'role-valid', 'interactive-role-focusable', 'link-in-text-block', 'table-headers', 'td-headers', 'fieldset-name', 'label-in-name', 'link-purpose', 'link-text', 'role-parent', 'aria-attr', 'aria-value', 'presentation-conflict', 'empty-th', 'input-button-name', 'autocomplete', 'scope', 'p-as-heading', 'orientation', 'focus-visible', 'state-contrast', 'text-spacing', 'frame-title', 'video-caption', 'autoplay-audio', 'hover-only', 'clickable-look', 'list-style-semantics', 'motion', 'blink', 'definition-list', 'accesskeys', 'server-side-image-map', 'fragment-target', 'input-image-alt'];
const value = text => { const [n, d = '1'] = String(text).split('/'); return Number(n) / Number(d); };
// Exact membership when the finding carries its region constraints (slack = a·width + b·height + c ≥ 0, or > 0).
const holds = (row, width) => row.range && (row.range.minInclusive === false ? width > row.range.min : width >= row.range.min) && (row.range.maxInclusive === false ? width < row.range.max : width <= row.range.max)
  && (!row.heightRange || (height >= row.heightRange.min && height <= row.heightRange.max))
  && (!row.regionConstraints || row.regionConstraints.every(c => { const slack = value(c.coefficient) * width + value(c.heightCoefficient ?? '0') * height + value(c.constant); return c.strict ? slack > 1e-9 : slack >= -1e-9; }));

// Paths of the static report ("Page/0/1") as element selectors under body.
async function runtime(page, sample) {
  const level = sample.accessibility?.targetLevel ?? 'AA', size = level === 'AAA' ? 44 : 24;
  const client = await page.context().newCDPSession(page);
  const found = new Map(rules.map(rule => [rule, new Set()]));
  const elements = await page.evaluate(() => {
    const out = [], walk = (node, path) => { out.push({path, tag: node.tagName.toLowerCase()}); [...node.children].forEach((child, i) => walk(child, `${path}/${i}`)); };
    walk(document.body.firstElementChild, 'Page'); return out;
  });
  const handle = path => page.evaluateHandle(indices => { let node = document.body.firstElementChild; for (const i of indices) node = node.children[i]; return node; }, path.split('/').slice(1).map(Number));
  const facts = await page.evaluate(() => {
    const out = {}, walk = (node, path) => {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      out[path] = {rect: {x: rect.x, y: rect.y, w: rect.width, h: rect.height}, display: style.display, visibility: style.visibility, position: style.position};
      [...node.children].forEach((child, i) => walk(child, `${path}/${i}`));
    };
    walk(document.body.firstElementChild, 'Page'); return out;
  });
  for (const element of elements) {
    const fact = facts[element.path];
    if (fact.display === 'none') continue; // zero-size elements are still exposed and need names
    const isLink = element.tag === 'a' && await (await handle(element.path)).evaluate(node => node.hasAttribute('href'));
    const widget = await (await handle(element.path)).evaluate(node => /^(?:button|link|checkbox|radio|switch|tab|menuitem|menuitemcheckbox|menuitemradio|option|slider|spinbutton|textbox|searchbox|combobox|treeitem|gridcell)$/.test((node.getAttribute('role') ?? '').trim().split(/\s+/)[0]));
    if (element.tag === 'button' || isLink || widget) {
      // Names: Chromium's computed accessible name.
      const {result} = await client.send('Runtime.evaluate', {expression: `(() => { let n = document.body.firstElementChild; for (const i of ${JSON.stringify(element.path.split('/').slice(1).map(Number))}) n = n.children[i]; return n; })()`});
      const {node} = await client.send('DOM.describeNode', {objectId: result.objectId});
      const {nodes} = await client.send('Accessibility.getPartialAXTree', {backendNodeId: node.backendNodeId, fetchRelatives: false});
      const name = nodes[0]?.name?.value ?? '';
      const ariaHidden = await page.evaluate(indices => { let n = document.body.firstElementChild; for (const i of indices) n = n.children[i]; return n.closest('[aria-hidden="true"]') !== null; }, element.path.split('/').slice(1).map(Number));
      if (fact.visibility === 'visible' && !ariaHidden && !name.trim()) found.get('accessible-name').add(element.path);
    }
  }
  // Occlusion and overlap: rect intersections, then hit testing at the overlap centre.
  const links = new Set(await page.evaluate(() => [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea')].map(node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); })));
  const targets = elements.filter(e => facts[e.path].display !== 'none' && facts[e.path].visibility === 'visible' && facts[e.path].rect.w > 0 && links.has(e.path));
  const inside = (a, b) => b.startsWith(a + '/') || a.startsWith(b + '/') || a === b;
  for (const target of targets) {
    const t = facts[target.path].rect;
    for (const other of elements) {
      if (inside(target.path, other.path)) continue;
      const o = facts[other.path].rect;
      const x0 = Math.max(t.x, o.x), x1 = Math.min(t.x + t.w, o.x + o.w), y0 = Math.max(t.y, o.y), y1 = Math.min(t.y + t.h, o.y + o.h);
      if (x1 <= x0 || y1 <= y0 || facts[other.path].display === 'none') continue;
      const hit = await page.evaluate(({x, y, indices}) => { let node = document.body.firstElementChild; for (const i of indices) node = node.children[i]; const top = document.elementFromPoint(x, y); return top !== null && !node.contains(top); }, {x: (x0 + x1) / 2, y: (y0 + y1) / 2, indices: target.path.split('/').slice(1).map(Number)});
      if (hit) found.get('occluded-target').add(target.path);
      if (targets.includes(other) && facts[other.path].visibility === 'visible') found.get('target-overlap').add([target.path, other.path].sort()[0]);
    }
  }
  // Visual order among siblings in flow.
  for (const a of elements) for (const b of elements) {
    if (a.path === b.path || a.path.slice(0, a.path.lastIndexOf('/')) !== b.path.slice(0, b.path.lastIndexOf('/')) || !a.path.includes('/')) continue;
    const [ia, ib] = [a, b].map(e => Number(e.path.slice(e.path.lastIndexOf('/') + 1)));
    if (ia >= ib || facts[a.path].position !== 'static' || facts[b.path].position !== 'static' || ['none', 'contents'].includes(facts[a.path].display) || ['none', 'contents'].includes(facts[b.path].display)) continue; // display: contents has no box (its rect is all zeros)
    const A = facts[a.path].rect, B = facts[b.path].rect;
    if (B.y + B.h <= A.y || (B.y < A.y + A.h && A.y < B.y + B.h && B.x + B.w <= A.x)) found.get('visual-order').add(b.path);
  }
  // Focus inside aria-hidden.
  for (const element of elements) {
    const focused = await page.evaluate(indices => { let node = document.body.firstElementChild; for (const i of indices) node = node.children[i]; node.focus(); return document.activeElement === node && node.closest('[aria-hidden="true"]') !== null && node.tabIndex >= 0; }, element.path.split('/').slice(1).map(Number));
    if (focused) found.get('hidden-focusable').add(element.path);
  }
  // Batch 2: headings, nesting, ids, tabindex and main landmarks.
  const structure = await page.evaluate(() => {
    const out = {empty: [], order: [], nested: [], duplicate: [], reference: [], tabindex: [], main: []};
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const shown = node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return getComputedStyle(node).visibility === 'visible' && !node.closest('[aria-hidden="true"]'); };
    const all = [document.body.firstElementChild, ...document.body.firstElementChild.querySelectorAll('*')];
    const headings = all.filter(n => /^H[1-6]$/.test(n.tagName) && shown(n));
    for (const h of headings) if (!h.textContent.trim() && !h.getAttribute('aria-label')?.trim()) out.empty.push(pathOf(h));
    for (let i = 1; i < headings.length; i++) if (Number(headings[i].tagName[1]) > Number(headings[i - 1].tagName[1]) + 1) out.order.push(pathOf(headings[i]));
    const interactive = n => n.matches('a[href], button, input:not([type=hidden]), select, textarea');
    for (const n of all) if (interactive(n) && shown(n) && n.parentElement?.closest('a[href], button, input:not([type=hidden]), select, textarea') && document.body.firstElementChild.contains(n.parentElement.closest('a[href], button, input:not([type=hidden]), select, textarea'))) out.nested.push(pathOf(n));
    const ids = new Map(); for (const n of all) if (n.id) ids.set(n.id, [...(ids.get(n.id) ?? []), n]);
    for (const owners of ids.values()) if (owners.length > 1) out.duplicate.push(pathOf(owners[1]));
    for (const n of all) for (const name of ['aria-labelledby', 'aria-describedby', 'aria-controls']) for (const id of (n.getAttribute(name) ?? '').split(/\s+/).filter(Boolean)) if (!document.getElementById(id)) out.reference.push(pathOf(n));
    for (const n of all) if (n.tabIndex > 0) out.tabindex.push(pathOf(n));
    const mains = all.filter(n => n.tagName === 'MAIN' && shown(n)); for (const m of mains.slice(1)) out.main.push(pathOf(m));
    return out;
  });
  for (const [rule, key] of [['empty-heading', 'empty'], ['heading-order', 'order'], ['nested-interactive', 'nested'], ['duplicate-id', 'duplicate'], ['aria-reference', 'reference'], ['positive-tabindex', 'tabindex'], ['multiple-main', 'main']])
    for (const path of structure[key]) found.get(rule).add(path);
  // Batch 3: scroll containers, reflow, obscured focus, zero focus area.
  const focusStuff = await page.evaluate(() => {
    const out = {scroll: [], reflow: [], obscured: [], area: []};
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const shown = node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return getComputedStyle(node).visibility === 'visible'; };
    const focusable = node => shown(node) && (node.matches('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])') || node.tabIndex >= 0 && node.hasAttribute('tabindex'));
    const all = [document.body.firstElementChild, ...document.body.firstElementChild.querySelectorAll('*')];
    for (const n of all) {
      const style = getComputedStyle(n);
      if (['auto', 'scroll'].includes(style.overflowX) && n.scrollWidth > n.clientWidth && !focusable(n) && ![...n.querySelectorAll('*')].some(focusable)) out.scroll.push(pathOf(n));
      if (innerWidth <= 320 && shown(n) && n.getBoundingClientRect().right > innerWidth) out.reflow.push(pathOf(n));
      if (!focusable(n)) continue;
      const r = n.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { out.area.push(pathOf(n)); continue; }
      const points = [[r.left + 0.5, r.top + 0.5], [r.right - 0.5, r.top + 0.5], [r.left + 0.5, r.bottom - 0.5], [r.right - 0.5, r.bottom - 0.5], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
      const covers = points.map(([x, y]) => document.elementFromPoint(x, y));
      if (covers.every(c => c && !n.contains(c) && c === covers[0] && getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)')) out.obscured.push(pathOf(n));
    }
    return out;
  });
  for (const [rule, key] of [['scrollable-region-focusable', 'scroll'], ['reflow', 'reflow'], ['focus-obscured', 'obscured'], ['focus-area', 'area']]) for (const path of focusStuff[key]) found.get(rule).add(path);
  const pointer = await page.evaluate(() => {
    const out = {disabled: [], small: []};
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    for (const n of [document.body.firstElementChild, ...document.body.firstElementChild.querySelectorAll('*')]) {
      const style = getComputedStyle(n);
      if (style.display === 'none' || style.visibility !== 'visible') continue;
      if (n.matches('a[href], button, input:not([type=hidden]), select, textarea') && style.pointerEvents === 'none') out.disabled.push(pathOf(n));
      if ([...n.childNodes].some(c => c.nodeType === 3 && c.data.trim()) && parseFloat(style.fontSize) < 12) out.small.push(pathOf(n));
    }
    return out;
  });
  for (const path of pointer.disabled) found.get('pointer-disabled').add(path);
  for (const path of pointer.small) found.get('small-text').add(path);
  // SC 2.5.8 with the spacing exception, from the rendered rects.
  const spacing = await page.evaluate(({size, level}) => {
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const shown = node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return getComputedStyle(node).visibility === 'visible' && !node.closest('[aria-hidden="true"]'); };
    // The inline exception: targets in a sentence (display: inline) are exempt.
    const targetsAll = [...document.body.firstElementChild.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea'), ...(document.body.firstElementChild.matches('a[href], button, input:not([type=hidden]), select, textarea') ? [document.body.firstElementChild] : [])].filter(shown).map(n => ({n, r: n.getBoundingClientRect()}));
    const targets = targetsAll.filter(t => getComputedStyle(t.n).display !== 'inline');
    const small = t => t.r.width < size || t.r.height < size, centre = t => [t.r.x + t.r.width / 2, t.r.y + t.r.height / 2];
    const failing = t => {
      if (!small(t)) return false;
      if (level === 'AAA') return true;
      const [cx, cy] = centre(t);
      return targets.some(o => o !== t && !o.n.contains(t.n) && !t.n.contains(o.n) && (Math.hypot(Math.max(o.r.left - cx, 0, cx - o.r.right), Math.max(o.r.top - cy, 0, cy - o.r.bottom)) < size / 2
        || (small(o) && Math.hypot(cx - centre(o)[0], cy - centre(o)[1]) < size)));
    };
    const out = [];
    for (const t of targets) {
      if (!failing(t) || t.n.hasAttribute('data-a11y-essential')) continue;
      const equivalent = t.n.dataset.a11yEquivalent && targets.find(o => o.n.id === t.n.dataset.a11yEquivalent);
      if (equivalent && !failing(equivalent)) continue;
      out.push(pathOf(t.n));
    }
    return out;
  }, {size, level});
  for (const path of spacing) found.get('target-size').add(path);
  // Images and form fields: alt, the AX name without the placeholder, and label.control.
  const media = await page.evaluate(() => {
    const out = {alt: [], unlabelled: [], dangling: []};
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const shown = node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return getComputedStyle(node).visibility === 'visible' && !node.closest('[aria-hidden="true"]'); };
    const all = [document.body.firstElementChild, ...document.body.firstElementChild.querySelectorAll('*')];
    for (const n of all) {
      if (n.tagName === 'IMG' && shown(n) && !n.hasAttribute('alt')) out.alt.push(pathOf(n));
      if (n.tagName === 'LABEL' && n.hasAttribute('for') && n.control === null) out.dangling.push(pathOf(n));
      if (n.matches('input:not([type=hidden]):not([type=submit]):not([type=reset]):not([type=button]):not([type=image]), select, textarea') && shown(n)) { if (n.hasAttribute('placeholder')) { n.dataset.placeholder = n.getAttribute('placeholder'); n.removeAttribute('placeholder'); } out.unlabelled.push(pathOf(n)); }
    }
    return out;
  });
  for (const path of media.alt) found.get('image-alt').add(path);
  const structure2 = await page.evaluate(() => {
    const out = {list: [], radio: [], nav: []};
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const shown = node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return getComputedStyle(node).visibility === 'visible' && !node.closest('[aria-hidden="true"]'); };
    const all = [document.body.firstElementChild, ...document.body.firstElementChild.querySelectorAll('*')].filter(shown);
    for (const n of all) {
      if (n.tagName === 'LI' && !['UL', 'OL'].includes(n.parentElement.tagName)) out.list.push(pathOf(n));
      if (['UL', 'OL'].includes(n.tagName) && [...n.children].some(c => c.tagName !== 'LI')) out.list.push(pathOf(n));
    }
    const radios = all.filter(n => n.matches('input[type=radio][name]')), grouped = n => n.closest('fieldset, [role=radiogroup], [role=group]') !== null;
    for (let i = 0; i < radios.length; i++) for (let j = i + 1; j < radios.length; j++) if (radios[i].name === radios[j].name && !(grouped(radios[i]) && grouped(radios[j]))) out.radio.push(pathOf(radios[j]));
    const navs = all.filter(n => n.matches('nav, [role=navigation]'));
    for (let i = 0; i < navs.length; i++) for (let j = i + 1; j < navs.length; j++) { const a = navs[i].getAttribute('aria-label')?.trim().toLowerCase(), b = navs[j].getAttribute('aria-label')?.trim().toLowerCase(); if (!(a && b) || a === b) out.nav.push(pathOf(navs[j])); }
    return out;
  });
  for (const [rule, key] of [['list-structure', 'list'], ['radio-group', 'radio'], ['landmark-name', 'nav']]) for (const path of structure2[key]) found.get(rule).add(path);
  const inText = await page.evaluate(() => {
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const parse = value => { const m = value.match(/[\d.]+/g).map(Number); return {r: m[0], g: m[1], b: m[2], a: m[3] ?? 1}; };
    const over = (t, b) => { const a = t.a + b.a * (1 - t.a); const mix = k => (t[k] * t.a + b[k] * b.a * (1 - t.a)) / a; return {r: mix('r'), g: mix('g'), b: mix('b'), a}; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const out = [];
    for (const a of document.body.firstElementChild.querySelectorAll('a[href]')) {
      const style = getComputedStyle(a), parent = a.parentElement, parentStyle = getComputedStyle(parent);
      if (style.display !== 'inline' || ![...parent.childNodes].some(n => n.nodeType === 3 && n.data.trim()) || style.visibility !== 'visible') continue;
      if (style.textDecorationLine.includes('underline') && !parentStyle.textDecorationLine.includes('underline')) continue;
      const layers = []; for (let n = parent; n; n = n.parentElement) layers.push(parse(getComputedStyle(n).backgroundColor));
      let bg = {r: 255, g: 255, b: 255, a: 1}; for (const layer of layers.reverse()) bg = over(layer, bg);
      const [x, y] = [lum(over(parse(style.color), bg)), lum(over(parse(parentStyle.color), bg))].sort((p, q) => q - p);
      if ((x + 0.05) / (y + 0.05) < 3) out.push(pathOf(a));
    }
    return out;
  });
  for (const path of inText) found.get('link-in-text-block').add(path);
  const tables = await page.evaluate(() => {
    const out = {headers: [], refs: [], fieldset: []};
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const shown = node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return getComputedStyle(node).visibility === 'visible'; };
    for (const t of document.body.firstElementChild.querySelectorAll('table:not([role=presentation]):not([role=none])')) {
      const cells = [...t.querySelectorAll('td')], heads = [...t.querySelectorAll('th')];
      if (cells.some(shown) && !heads.some(shown)) out.headers.push(pathOf(t));
      for (const c of [...cells, ...heads]) for (const id of (c.getAttribute('headers') ?? '').split(/\s+/).filter(Boolean)) { const h = document.getElementById(id); if (!h || h.tagName !== 'TH' || h.closest('table') !== t) out.refs.push(pathOf(c)); }
    }
    for (const f of document.body.firstElementChild.querySelectorAll('fieldset')) if (![...f.children].some(c => c.tagName === 'LEGEND') && !f.getAttribute('aria-label') && [f, ...f.querySelectorAll('*')].some(shown)) out.fieldset.push(pathOf(f));
    return out;
  });
  for (const [rule, key] of [['table-headers', 'headers'], ['td-headers', 'refs'], ['fieldset-name', 'fieldset']]) for (const path of tables[key]) found.get(rule).add(path);
  const texts = await page.evaluate(() => {
    const out = {inName: [], purpose: [], generic: [], navs: []};
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const shown = node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return getComputedStyle(node).visibility === 'visible'; };
    const norm = t => t.toLowerCase().replace(/\s+/g, ' ').trim();
    const links = [...document.body.firstElementChild.querySelectorAll('a[href]')].filter(shown);
    for (const a of links) {
      const label = a.getAttribute('aria-label'), visible = a.innerText;
      if (label !== null && visible.trim() && !norm(label).includes(norm(visible))) out.inName.push(pathOf(a));
      const name = norm(label ?? a.textContent);
      if (/^(?:click here|here|read more|more|learn more|link|this|go|details|こちら|ここ|詳細|詳しくはこちら|もっと見る|続きを読む|クリック)$/.test(name)) out.generic.push(pathOf(a));
    }
    for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) { const n = x => norm(x.getAttribute('aria-label') ?? x.textContent); if (n(links[i]) && n(links[i]) === n(links[j]) && links[i].getAttribute('href') !== links[j].getAttribute('href')) out.purpose.push(pathOf(links[j])); }
    return out;
  });
  for (const [rule, key] of [['label-in-name', 'inName'], ['link-purpose', 'purpose'], ['link-text', 'generic']]) for (const path of texts[key]) found.get(rule).add(path);
  const batch = await page.evaluate(() => {
    const out = {parent: [], attr: [], value: [], conflict: [], autocomplete: [], scope: [], heading: [], orientation: []};
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const all = [document.body.firstElementChild, ...document.body.firstElementChild.querySelectorAll('*')];
    const known = new Set('activedescendant atomic autocomplete braillelabel brailleroledescription busy checked colcount colindex colindextext colspan controls current describedby description details disabled dropeffect errormessage expanded flowto grabbed haspopup hidden invalid keyshortcuts label labelledby level live modal multiline multiselectable orientation owns placeholder posinset pressed readonly relevant required roledescription rowcount rowindex rowindextext rowspan selected setsize sort valuemax valuemin valuenow valuetext'.split(' '));
    for (const n of all) {
      const role = (n.getAttribute('role') ?? '').trim().split(/\s+/)[0];
      if (role === 'tab' && !n.parentElement.closest('[role=tablist]')) out.parent.push(pathOf(n));
      for (const a of n.getAttributeNames().filter(a => a.startsWith('aria-'))) {
        if (!known.has(a.slice(5))) out.attr.push(pathOf(n));
        else if (a === 'aria-expanded' && !['true', 'false', 'undefined'].includes(n.getAttribute(a))) out.value.push(pathOf(n));
      }
      if (['none', 'presentation'].includes(role) && (n.matches('button, input, select, textarea, a[href]') || n.hasAttribute('aria-label'))) out.conflict.push(pathOf(n));
      if (n.hasAttribute('autocomplete') && n.autocomplete === '') out.autocomplete.push(pathOf(n)); // Chromium normalizes invalid tokens to ''
      if (n.hasAttribute('scope') && (n.tagName !== 'TH' || !['row', 'col', 'rowgroup', 'colgroup'].includes(n.getAttribute('scope')))) out.scope.push(pathOf(n));
      if (n.tagName === 'P' && n.nextElementSibling?.tagName === 'P' && Number(getComputedStyle(n).fontWeight) >= 600 && Number(getComputedStyle(n.nextElementSibling).fontWeight) < 600) out.heading.push(pathOf(n));
    }
    const main = document.querySelector('main');
    if (main && innerWidth > innerHeight && getComputedStyle(main).display === 'none') out.orientation.push(pathOf(main));
    return out;
  });
  for (const [rule, key] of [['role-parent', 'parent'], ['aria-attr', 'attr'], ['aria-value', 'value'], ['presentation-conflict', 'conflict'], ['autocomplete', 'autocomplete'], ['scope', 'scope'], ['p-as-heading', 'heading'], ['orientation', 'orientation']]) for (const path of batch[key]) found.get(rule).add(path);
  // Forced :focus/:focus-visible/:hover through CDP, compared with the base computed style.
  await client.send('DOM.enable'); await client.send('CSS.enable'); await client.send('DOM.getDocument', {depth: -1});
  const parse = v => { const m = v.match(/[\d.]+/g).map(Number); return {r: m[0], g: m[1], b: m[2], a: m[3] ?? 1}; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const element of elements) {
    if (!(await (await handle(element.path)).evaluate(node => node.matches('button:not([disabled]), a[href], input:not([type=hidden]), select, textarea, [tabindex]') && getComputedStyle(node).display !== 'none'))) continue;
    const {result} = await client.send('Runtime.evaluate', {expression: `(() => { let n = document.body.firstElementChild; for (const i of ${JSON.stringify(element.path.split('/').slice(1).map(Number))}) n = n.children[i]; return n; })()`});
    const {nodeId} = await client.send('DOM.requestNode', {objectId: result.objectId});
    const read = () => (handle(element.path)).then(h => h.evaluate(node => { const s = getComputedStyle(node); return {shown: s.visibility === 'visible' && Number(s.opacity) > 0, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow, color: s.color, background: s.backgroundColor, text: [...node.childNodes].some(c => c.nodeType === 3 && c.data.trim())}; }));
    const base = await read();
    await client.send('CSS.forcePseudoState', {nodeId, forcedPseudoClasses: ['focus', 'focus-visible', 'focus-within']});
    const focus = await read();
    await client.send('CSS.forcePseudoState', {nodeId, forcedPseudoClasses: ['hover']});
    const hover = await read();
    await client.send('CSS.forcePseudoState', {nodeId, forcedPseudoClasses: []});
    if (!base.shown && hover.shown && !focus.shown) found.get('hover-only').add(element.path);
    const ring = !['none', 'hidden'].includes(focus.outlineStyle) && focus.outlineWidth !== '0px';
    const changed = (focus.boxShadow !== 'none' && focus.boxShadow !== base.boxShadow) || focus.color !== base.color || focus.background !== base.background;
    if (!ring && !changed) found.get('focus-visible').add(element.path);
    for (const state of [hover, focus]) if (base.text && (state.color !== base.color || state.background !== base.background) && ratio(parse(state.color), parse(state.background === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : state.background)) < 4.5) found.get('state-contrast').add(element.path);
  }
  // Text spacing: line-height 1.5 on clipping text boxes.
  const spaced = await page.evaluate(() => {
    const style = document.createElement('style'); style.textContent = '* { line-height: 1.5 !important; }'; document.head.append(style);
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const out = [...document.body.firstElementChild.querySelectorAll('*')].filter(n => ['hidden', 'clip'].includes(getComputedStyle(n).overflowY) && [...n.childNodes].some(c => c.nodeType === 3 && c.data.trim()) && n.scrollHeight > n.clientHeight).map(pathOf);
    style.remove(); return out;
  });
  for (const path of spaced) found.get('text-spacing').add(path);
  const mediaFacts = await page.evaluate(() => {
    const out = {frame: [], caption: [], autoplay: []};
    const pathOf = node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const shown = node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return getComputedStyle(node).visibility === 'visible'; };
    for (const n of document.body.firstElementChild.querySelectorAll('iframe')) if (shown(n) && !(n.getAttribute('title') ?? n.getAttribute('aria-label') ?? '').trim()) out.frame.push(pathOf(n));
    for (const n of document.body.firstElementChild.querySelectorAll('video')) if (shown(n) && ![...n.querySelectorAll('track')].some(t => ['captions', 'subtitles'].includes(t.kind))) out.caption.push(pathOf(n));
    for (const n of document.body.firstElementChild.querySelectorAll('video, audio')) if (n.autoplay && !n.muted) out.autoplay.push(pathOf(n));
    return out;
  });
  for (const [rule, key] of [['frame-title', 'frame'], ['video-caption', 'caption'], ['autoplay-audio', 'autoplay']]) for (const path of mediaFacts[key]) found.get(rule).add(path);
  // Empty headers and input buttons: Chromium's AX names.
  for (const element of elements) {
    const kind = await (await handle(element.path)).evaluate(node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return ''; return node.matches('th') ? 'th' : node.matches('input[type=button]') ? 'button' : ''; });
    if (!kind) continue;
    const {result} = await client.send('Runtime.evaluate', {expression: `(() => { let n = document.body.firstElementChild; for (const i of ${JSON.stringify(element.path.split('/').slice(1).map(Number))}) n = n.children[i]; return n; })()`});
    const {node} = await client.send('DOM.describeNode', {objectId: result.objectId});
    const {nodes} = await client.send('Accessibility.getPartialAXTree', {backendNodeId: node.backendNodeId, fetchRelatives: false});
    if (!(nodes[0]?.name?.value ?? '').trim()) found.get(kind === 'th' ? 'empty-th' : 'input-button-name').add(element.path);
  }
  // Roles: Chromium's computed AX role must be the authored one; widget roles need focus.
  for (const element of elements) {
    const info = await (await handle(element.path)).evaluate(node => ({role: (node.getAttribute('role') ?? '').trim().split(/\s+/)[0], tabIndex: node.tabIndex, shown: getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility === 'visible'}));
    if (!info.role) continue;
    const {result} = await client.send('Runtime.evaluate', {expression: `(() => { let n = document.body.firstElementChild; for (const i of ${JSON.stringify(element.path.split('/').slice(1).map(Number))}) n = n.children[i]; return n; })()`});
    const {node} = await client.send('DOM.describeNode', {objectId: result.objectId});
    const {nodes} = await client.send('Accessibility.getPartialAXTree', {backendNodeId: node.backendNodeId, fetchRelatives: false});
    // none/presentation on a focusable element is overridden by conflict resolution (presentation-conflict).
    if (!['none', 'presentation'].includes(info.role) && nodes[0]?.role?.value !== info.role) found.get('role-valid').add(element.path);
    if (info.shown && /^(?:button|link|checkbox|radio|switch|tab|menuitem|menuitemcheckbox|menuitemradio|option|slider|spinbutton|textbox|searchbox|combobox|treeitem|gridcell)$/.test(info.role) && info.tabIndex < 0) found.get('interactive-role-focusable').add(element.path);
  }
  for (const path of media.dangling) found.get('label-for').add(path);
  for (const path of media.unlabelled) {
    const {result} = await client.send('Runtime.evaluate', {expression: `(() => { let n = document.body.firstElementChild; for (const i of ${JSON.stringify(path.split('/').slice(1).map(Number))}) n = n.children[i]; return n; })()`});
    const {node} = await client.send('DOM.describeNode', {objectId: result.objectId});
    const {nodes} = await client.send('Accessibility.getPartialAXTree', {backendNodeId: node.backendNodeId, fetchRelatives: false});
    if (!(nodes[0]?.name?.value ?? '').trim()) found.get('form-label').add(path);
  }
  await page.evaluate(() => { for (const n of document.querySelectorAll('[data-placeholder]')) { n.setAttribute('placeholder', n.dataset.placeholder); delete n.dataset.placeholder; } });
  // Contrast from computed colors, composited over the ancestors like the WCAG definition.
  const low = await page.evaluate(() => {
    const parse = value => { const m = value.match(/[\d.]+/g).map(Number); return {r: m[0], g: m[1], b: m[2], a: m[3] ?? 1}; };
    const over = (t, b) => { const a = t.a + b.a * (1 - t.a); const mix = k => (t[k] * t.a + b[k] * b.a * (1 - t.a)) / a; return {r: mix('r'), g: mix('g'), b: mix('b'), a}; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const out = [];
    const walk = (node, path) => {
      const style = getComputedStyle(node);
      if (style.display !== 'none' && style.visibility === 'visible' && [...node.childNodes].some(n => n.nodeType === 3 && n.data.trim())) {
        // A table's background paints the table box, not its caption (measured in a screenshot).
        const layers = []; for (let n = node; n; n = n.parentElement) if (!(n.tagName === 'TABLE' && node.closest('caption')?.parentElement === n)) layers.push(parse(getComputedStyle(n).backgroundColor));
        let bg = {r: 255, g: 255, b: 255, a: 1}; for (const layer of layers.reverse()) bg = over(layer, bg);
        const fg = over(parse(style.color), bg), [x, y] = [lum(fg), lum(bg)].sort((p, q) => q - p), ratio = (x + 0.05) / (y + 0.05);
        const size = parseFloat(style.fontSize), large = size >= 24 || (size >= 56 / 3 && Number(style.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) out.push(path);
      }
      [...node.children].forEach((child, i) => walk(child, `${path}/${i}`));
    };
    walk(document.body.firstElementChild, 'Page'); return out;
  });
  for (const path of low) found.get('text-contrast').add(path);
  // Pointer cursors, list markers, marquee, definition lists, accesskeys and ismap from the DOM and computed styles.
  const markup = await page.evaluate(() => {
    const root = document.body.firstElementChild, all = [root, ...root.querySelectorAll('*')], out = {click: [], listStyle: [], blink: [], dl: [], keys: [], ismap: []};
    const pathOf = node => { const path = []; for (let n = node; n !== root; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const shown = node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return getComputedStyle(node).visibility === 'visible' && !node.closest('[aria-hidden="true"]'); };
    const operable = 'a[href],button,input,select,textarea,label,summary,option,[tabindex]:not([tabindex^="-"]),[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=slider],[role=textbox],[role=combobox]';
    for (const n of all) if (shown(n) && getComputedStyle(n).cursor === 'pointer' && getComputedStyle(n.parentElement).cursor !== 'pointer' && !n.closest(operable)) out.click.push(pathOf(n));
    for (const n of all.filter(n => /^(?:UL|OL)$/.test(n.tagName) && shown(n) && !n.hasAttribute('role') && !n.closest('nav'))) { const items = [...n.children].filter(c => c.tagName === 'LI' && shown(c)); if (items.length && items.every(c => getComputedStyle(c).listStyleType === 'none')) out.listStyle.push(pathOf(n)); }
    for (const n of all) if (/^(?:MARQUEE|BLINK)$/.test(n.tagName) && shown(n)) out.blink.push(pathOf(n));
    const group = c => /^(?:DT|DD)$/.test(c.tagName);
    for (const n of all.filter(shown)) {
      if (n.tagName === 'DL' && !n.hasAttribute('role') && [...n.children].some(c => !group(c) && !/^(?:SCRIPT|TEMPLATE)$/.test(c.tagName) && !(c.tagName === 'DIV' && [...c.children].every(group)))) out.dl.push(pathOf(n));
      if (group(n) && !(n.parentElement.tagName === 'DL' || (n.parentElement.tagName === 'DIV' && n.parentElement.parentElement?.tagName === 'DL'))) out.dl.push(pathOf(n));
    }
    const seen = new Set(); for (const n of all) { const key = n.getAttribute('accesskey')?.trim().toLowerCase(); if (!key) continue; if (seen.has(key)) out.keys.push(pathOf(n)); seen.add(key); }
    for (const n of all) if (n.tagName === 'IMG' && n.isMap && shown(n)) out.ismap.push(pathOf(n));
    return out;
  });
  // In-page links: the target exists and renders (client rects of it or a descendant); image inputs: Chromium's AX name.
  const anchors = await page.evaluate(() => {
    const root = document.body.firstElementChild, pathOf = node => { const path = []; for (let n = node; n !== root; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    const shown = node => { for (let n = node; n; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return getComputedStyle(node).visibility === 'visible' && !node.closest('[aria-hidden="true"]'); };
    const renders = node => node.getClientRects().length > 0 || [...node.querySelectorAll('*')].some(n => n.getClientRects().length > 0);
    const out = {fragment: [], images: []};
    for (const a of root.querySelectorAll('a[href^="#"]')) { const id = a.getAttribute('href').slice(1); if (!id || id === 'top' || !shown(a)) continue; const t = document.getElementById(decodeURIComponent(id)); if (!t || !renders(t)) out.fragment.push(pathOf(a)); }
    for (const i of root.querySelectorAll('input[type=image]')) if (shown(i)) out.images.push(pathOf(i));
    return out;
  });
  for (const path of anchors.fragment) found.get('fragment-target').add(path);
  for (const path of anchors.images) {
    const {result} = await client.send('Runtime.evaluate', {expression: `(() => { let n = document.body.firstElementChild; for (const i of ${JSON.stringify(path.split('/').slice(1).map(Number))}) n = n.children[i]; return n; })()`});
    const {node} = await client.send('DOM.describeNode', {objectId: result.objectId});
    const {nodes} = await client.send('Accessibility.getPartialAXTree', {backendNodeId: node.backendNodeId, fetchRelatives: false});
    // Chromium falls back to "Submit" (a source on the type attribute): flag when no author source gave the name.
    const sources = nodes[0]?.name?.sources ?? [];
    if (!sources.some(source => (source.value?.value ?? '').trim() && !source.superseded && source.attribute !== 'type')) found.get('input-image-alt').add(path);
  }
  for (const [rule, key] of [['clickable-look', 'click'], ['list-style-semantics', 'listStyle'], ['blink', 'blink'], ['definition-list', 'dl'], ['accesskeys', 'keys'], ['server-side-image-map', 'ismap']]) for (const path of markup[key]) found.get(rule).add(path);
  // Motion: with prefers-reduced-motion: reduce, the animations still running past 5s.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const moving = await page.evaluate(() => {
    const root = document.body.firstElementChild, pathOf = node => { const path = []; for (let n = node; n !== root; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); };
    return document.getAnimations().filter(a => { const t = a.effect.getComputedTiming(); return a.playState === 'running' && (t.iterations === Infinity || t.duration * t.iterations > 5000); }).map(a => pathOf(a.effect.target));
  });
  await page.emulateMedia({reducedMotion: 'no-preference'});
  for (const path of moving) found.get('motion').add(path);
  return found;
}

const table = [];
test.afterAll(() => {
  mkdirSync(results, {recursive: true});
  writeFileSync(new URL('report.json', results), JSON.stringify({version: 1, widths, height, rules, scope: 'Static accessibility rules vs the browser (AX tree names, hit testing, focus, rects, computed colors; vlmkit a11y contrast at 1280).', cases: table}, null, 2) + '\n');
});

for (const sample of cases) {
  test(`${sample.name}: static accessibility agrees with the browser`, async ({page}) => {
    const css = reset + sample.css;
    const report = analyzeHTML(sample.html, {name: 'Page', css, viewport: {min: sample.min ?? 375, max: 1280, height: {min: 600, max: 1000}}, accessibility: sample.accessibility ?? true, ...(sample.boxes ? {boxes: sample.boxes} : {})});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics)).toBe(false);
    const rows = [...report.diagnostics, ...report.accessibility.warnings].filter(row => rules.includes(row.rule) && !row.preference);
    const darkRows = report.diagnostics.filter(row => row.rule === 'text-contrast' && (row.preference === 'prefers-color-scheme: dark' || row.alsoUnder?.includes('prefers-color-scheme: dark')));
    const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>${sample.html}</body></html>`;
    const row = {name: sample.name, static: {}, runtime: {}};
    for (const width of sample.widths ?? widths) {
      await page.setViewportSize({width, height});
      await page.setContent(document);
      const found = await runtime(page, sample);
      for (const rule of rules) {
        const expected = [...found.get(rule)].sort(), actual = [...new Set(rows.filter(r => r.rule === rule && holds(r, width)).map(r => r.path))].sort();
        (row.static[rule] ??= []).push(actual); (row.runtime[rule] ??= []).push(expected);
        expect(actual, `${rule} at ${width}`).toEqual(expected);
      }
      // Dark scheme: the same contrast oracle under emulated prefers-color-scheme: dark.
      if (sample.schemes?.includes('dark')) {
        await page.emulateMedia({colorScheme: 'dark'});
        const dark = await runtime(page, sample);
        await page.emulateMedia({colorScheme: 'light'});
        const expected = [...dark.get('text-contrast')].sort(), actual = [...new Set(darkRows.filter(r => holds(r, width)).map(r => r.path))].sort();
        (row.static['text-contrast (dark)'] ??= []).push(actual); (row.runtime['text-contrast (dark)'] ??= []).push(expected);
        expect(actual, `text-contrast (dark) at ${width}`).toEqual(expected);
      }
    }
    // The independent contrast gate at its own viewport (1280×900).
    mkdirSync(results, {recursive: true});
    const file = new URL(`${sample.name}.html`, results);
    writeFileSync(file, document);
    const run = spawnSync('pnpm', ['exec', 'vlmkit', 'check', 'a11y', 'contrast', file.pathname, '--json', '--output-dir', new URL('../test-results/a11y-contrast-eval/', import.meta.url).pathname], {encoding: 'utf8', env: process.env});
    const gate = JSON.parse(run.stdout);
    if (sample.pixels) {
      await page.setViewportSize({width: 1280, height});
      await page.setContent(document);
      const box = await page.locator(sample.pixels.selector).boundingBox();
      const png = (await page.screenshot({clip: box})).toString('base64');
      const distinct = await page.evaluate(async data => {
        const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data, out = new Set();
        for (let i = 0; i < pixels.length; i += 4) out.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
        return [...out];
      }, png);
      expect(distinct, 'rendered caption pixels').toEqual([sample.pixels.uniform.join(',')]);
      expect(rows.some(r => r.rule === 'text-contrast' && r.path && holds({...r, heightRange: undefined}, 1280)), 'static contrast finding at 1280').toBe(true);
      table.push(row);
      return;
    }
    const vlmkit = gate.findings.length > 0, staticLow = rows.some(r => r.rule === 'text-contrast' && holds({...r, heightRange: undefined}, 1280));
    expect(staticLow, `contrast at 1280: static ${staticLow} vs vlmkit ${vlmkit}`).toBe(vlmkit);
    table.push(row);
  });
}

// aria-hidden-body: the root is the body itself. Oracle: Chromium's full AX tree, which ignores aria-hidden on body
// (the content stays exposed); the static rule warns because other user agents honor it.
for (const hidden of [true, false]) {
  test(`aria-hidden-body (${hidden ? 'hidden' : 'shown'}): static agrees with Chromium's AX tree`, async ({page}) => {
    const body = `<body class="page"${hidden ? ' aria-hidden="true"' : ''}><main class="m"><button class="b" aria-label="Go"></button></main></body>`;
    const css = `${reset}.page{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:40px;background:#fff}.m{display:grid;grid-template-columns:40px;grid-template-rows:40px}.b{${button}}`;
    const report = analyzeHTML(body, {name: 'Page', css, viewport: {min: 375, max: 1280, height: {min: 600, max: 1000}}, accessibility: true});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics)).toBe(false);
    const flagged = report.accessibility.warnings.some(d => d.code === 'W_A11Y_ARIA_HIDDEN_BODY');
    // The other rules keep the button exposed: it is named, so no name finding either way.
    expect(report.diagnostics.filter(d => d.code === 'E_A11Y_NAME')).toEqual([]);
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head>${body}</html>`);
    const client = await page.context().newCDPSession(page);
    const {nodes} = await client.send('Accessibility.getFullAXTree');
    const exposed = nodes.some(n => !n.ignored && ['main', 'button'].includes(n.role?.value));
    expect(flagged).toBe(hidden);
    expect(exposed, 'Chromium keeps the content of an aria-hidden body exposed').toBe(true);
  });
}

// Generated overlays (::after with content "" and position absolute): Chromium hit-tests them as their element.
test('generated ::after overlays occlude like Chromium hit testing', async ({page}) => {
  const html = '<main class="page"><div class="card"><div class="x"></div></div><button class="b1" aria-label="One"></button><button class="b2" aria-label="Two"></button></main>';
  for (const [cover, occluded] of [['inline-size:200px;block-size:80px', ['Page/1']], ['inline-size:200px;block-size:40px', []], ['inline-size:200px;block-size:120px;pointer-events:none', []], ['inline-size:200px;block-size:120px', ['Page/1', 'Page/2']]]) {
    const css = `${reset}.page{display:grid;grid-template-columns:200px;grid-auto-rows:40px;position:relative;background:#fff}.card{display:grid;grid-template-columns:minmax(0,1fr)}.b1,.b2{${button}}.card::after{content:"";position:absolute;left:0;top:0;${cover}}`;
    const report = analyzeHTML(html, {name: 'Page', css, viewport: {min: 375, max: 1280, height: {min: 600, max: 1000}}, accessibility: true});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics)).toBe(false);
    const statics = [...new Set(report.diagnostics.filter(d => d.code === 'E_A11Y_OCCLUDED').map(d => d.path))].sort();
    await page.setViewportSize({width: 800, height: 800});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const browser = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); for (let x = r.left + 0.5; x < r.right; x += 4) for (let y = r.top + 0.5; y < r.bottom; y += 4) if (document.elementFromPoint(x, y) !== b) return true; return false; }).map(b => `Page/${[...b.parentElement.children].indexOf(b)}`));
    expect(statics, cover).toEqual(occluded);
    expect(browser.sort(), cover).toEqual(occluded);
  }
});
