// Supplementary browser eval for the flex and display: contents subsets. The
// static rectangles (affine in the viewport) are evaluated at sample sizes and
// compared with Chromium. Browser rendering is not used to accept source.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const reset = '*{box-sizing:border-box;margin:0;padding:0}';
const cases = [
  {name: 'fixed and flexible items', html: '<main class="row"><div class="avatar"></div><div class="name"></div><div class="tail"></div></main>',
    css: '.row{display:flex;column-gap:8px;padding:0 16px;block-size:72px}.avatar{flex:none;width:48px}.name{flex:1 1 0;min-width:0}.tail{flex:0 0 30px;min-width:30px}'},
  {name: 'weighted items with padding and borders', html: '<main class="row"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:40px;border:2px solid red}.a{flex:1 1 0;min-width:0}.b{flex:2 1 0;min-width:0;padding:0 10px}.c{flex:1 0 0;min-width:0;border:3px solid red;box-sizing:content-box}'},
  {name: 'factor sum below one', html: '<main class="row"><div class="a"></div><div class="b"></div></main>',
    css: '.row{display:flex;block-size:30px}.a{flex:0.25 1 0;min-width:0}.b{flex:0.5 1 0;min-width:0}'},
  {name: 'contents inside a grid', html: '<main class="grid"><div class="wrap"><div class="cell"></div><div class="cell"></div></div><div class="cell"></div></main>',
    css: '.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:4px;grid-auto-rows:20px}.wrap{display:contents;padding:30px}'},
  {name: 'nested contents inside a flex row', html: '<main class="row"><div class="outer"><div class="inner"><div class="a"></div></div><div class="b"></div></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:24px;column-gap:6px}.outer,.inner{display:contents}.a,.b{flex:1 1 0;min-width:0}.c{flex:none;width:50px}'},
  {name: 'flex item that is a grid', html: '<main class="row"><section class="g"><div></div><div></div></section><div class="side"></div></main>',
    css: '.row{display:flex;block-size:50px}.g{flex:1 1 0;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) 20px}.side{flex:none;width:64px}'},
  {name: 'column with fixed header/footer and a flexible body', html: '<main class="page"><header class="h"></header><section class="b"></section><footer class="f"></footer></main>',
    css: '.page{display:flex;flex-direction:column;block-size:100%;row-gap:8px;padding:16px 12px}.h{flex:none;block-size:56px}.b{flex:1 1 0;min-block-size:0;padding:10px 0}.f{flex:0 0 40px;min-block-size:0}', fullHeight: true},
  {name: 'column with weighted bodies and a content-sized grid item', html: '<main class="page"><div class="c"><div></div></div><div class="x"></div><div class="y"></div></main>',
    css: '.page{display:flex;flex-direction:column;block-size:100%}.c{flex:none;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:30px;border:2px solid red}.x{flex:1 1 0;min-block-size:0}.y{flex:3 0 0;min-block-size:0;border:5px solid red}', fullHeight: true},
  {name: 'column stretched by a definite row', html: '<main class="row"><div class="stack"><div class="a"></div><div class="g"><div></div></div></div><div class="side"></div></main>',
    css: '.row{display:flex;block-size:200px}.stack{flex:1 1 0;min-width:0;display:flex;flex-direction:column;row-gap:4px}.a{flex:none;block-size:20px}.g{flex:none;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:18px}.side{flex:none;width:40px}'},
  {name: 'flexible item frozen at its min-width', html: '<main class="row"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:20px;column-gap:4px}.a{flex:1 1 0;min-width:180px}.b{flex:1 1 0;min-width:0}.c{flex:2 1 0;min-width:0}'},
  {name: 'freezing in rounds with a content-box minimum', html: '<main class="row"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:20px}.a{flex:1 1 0;min-width:100px;padding:0 10px;box-sizing:content-box}.b{flex:2 1 0;min-width:300px}.c{flex:1 1 0;min-width:0}',
    // Below 420px the frozen minimums overflow the line; the geometry is still compared there.
    expected: 'violated'},
  {name: 'column item frozen at its min-height', html: '<main class="page"><div class="a"></div><div class="b"></div></main>',
    css: '.page{display:flex;flex-direction:column;block-size:100%}.a{flex:1 1 0;min-block-size:250px}.b{flex:1 1 0;min-block-size:0}', fullHeight: true},
  {name: 'scroll container items have a zero automatic minimum', html: '<main class="row"><div class="a"><div class="w"></div></div><div class="b"></div></main>',
    css: '.row{display:flex;block-size:30px}.a{flex:1 1 0;overflow:hidden;display:grid;grid-template-columns:500px}.b{flex:1 1 0;min-width:0}',
    boxes: {'.a': {overflow: 'clip'}}},
  {name: 'justify-content: flex-end', html: '<main class="row"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:30px;column-gap:6px;justify-content:flex-end}.a,.b,.c{flex:none;width:50px}'},
  {name: 'justify-content: center', html: '<main class="row"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:30px;column-gap:6px;justify-content:center}.a,.b,.c{flex:none;width:50px}'},
  {name: 'justify-content: space-between', html: '<main class="row"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:30px;column-gap:6px;justify-content:space-between}.a,.b,.c{flex:none;width:50px}'},
  {name: 'justify-content: space-around', html: '<main class="row"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:30px;column-gap:6px;justify-content:space-around}.a,.b,.c{flex:none;width:50px}'},
  {name: 'justify-content: space-evenly', html: '<main class="row"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:30px;column-gap:6px;justify-content:space-evenly}.a,.b,.c{flex:none;width:50px}'},
  {name: 'navigation with a main-axis auto margin', html: '<main class="row"><div class="logo"></div><nav class="nav"></nav><div class="me"></div></main>',
    css: '.row{display:flex;block-size:48px;column-gap:8px;padding:0 12px}.logo{flex:none;width:60px}.nav{flex:none;width:60px;margin-left:auto}.me{flex:none;width:40px}'},
  {name: 'cross-axis alignment in a row', html: '<main class="row"><div class="a"></div><div class="b"><div></div></div><div class="c"></div></main>',
    css: '.row{display:flex;block-size:60px;align-items:center}.a{flex:none;width:40px;block-size:20px}.b{flex:1 1 0;min-width:0;align-self:flex-end;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:24px}.c{flex:none;width:10px;align-self:stretch}'},
  {name: 'wrapping cards with gaps', html: '<main class="row"><div class="card"><div></div></div><div class="card"><div></div></div><div class="card"><div></div></div></main>',
    css: '.row{display:flex;flex-wrap:wrap;column-gap:16px;row-gap:12px}.card{flex:1 1 200px;min-width:0;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:30px}',
    // Line-break thresholds: 2·200 + 16 and 3·200 + 32.
    widths: [415, 416, 631, 632]},
  {name: 'wrapping fixed chips in a definite container', html: '<main class="row"><div class="x"></div><div class="x"></div><div class="x"></div><div class="x"></div></main>',
    css: '.row{display:flex;flex-wrap:wrap;column-gap:10px;row-gap:5px;block-size:200px}.x{flex:none;width:150px;block-size:20px}',
    widths: [309, 310, 469, 470]},
  {name: 'shrinking items with px bases', html: '<main class="row"><div class="a"></div><div class="b"></div></main>',
    css: '.row{display:flex;block-size:20px}.a{flex:0 1 400px;min-width:0}.b{flex:0 3 300px;min-width:100px}'},
  {name: 'column with centered fixed-width items', html: '<main class="page"><div class="a"></div><div class="b"></div></main>',
    css: '.page{display:flex;flex-direction:column;block-size:100%;align-items:center;justify-content:space-evenly}.a{flex:none;width:120px;block-size:40px}.b{flex:none;width:80px;block-size:60px;align-self:flex-end}', fullHeight: true},
  {name: 'fieldset with a rendered legend in a thin border', html: '<main class="page"><fieldset class="fs"><legend class="lg"></legend><div class="a"></div><div class="b"></div></fieldset></main>',
    css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.fs{display:grid;grid-template-columns:minmax(0,1fr) 40px;grid-template-rows:30px;border:2px solid red;padding:5px 7px;min-inline-size:0;margin:0}.lg{display:block;inline-size:80px;block-size:20px;padding:0}'},
  {name: 'fieldset with a legend centred in a thick border', html: '<main class="page"><fieldset class="fs"><legend class="lg"></legend><div class="a"></div></fieldset></main>',
    css: '.page{display:grid;grid-template-columns:minmax(0,1fr)}.fs{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:24px;border:30px solid red;padding:0;min-inline-size:0;margin:0}.lg{display:block;inline-size:60px;block-size:20px;padding:2px;border:1px solid red;box-sizing:content-box}'},
  {name: 'fixed table with proportional px columns', html: '<table class="t"><tbody><tr><td class="a"></td><td class="b"></td></tr><tr><td class="a"></td><td class="b"></td></tr></tbody></table>',
    css: '.t{table-layout:fixed;inline-size:100%}.a,.b{block-size:20px}.a{inline-size:50px}.b{inline-size:70px}'},
  {name: 'fixed table with an auto column, spacing, border and padding', html: '<table class="t"><tbody><tr><td class="a"></td><td class="b"></td></tr><tr><td class="a"></td><td class="b"></td></tr></tbody></table>',
    css: '.t{table-layout:fixed;inline-size:100%;border:5px solid red;padding:4px;border-spacing:6px 3px}.a,.b{block-size:20px}.b{inline-size:100px}'},
  {name: 'automatic tables: auto width, explicit width, one auto column and fitting text', html: '<div class="g"><table class="t1"><tbody><tr><td class="a"></td><td class="b"></td></tr><tr><td class="a"></td><td class="b"></td></tr></tbody></table><table class="t2"><tbody><tr><td class="a"></td><td class="b"></td></tr></tbody></table><table class="t3"><tbody><tr><td class="a"></td><td class="c"></td></tr></tbody></table><table class="t4"><tbody><tr><td class="a x">ab</td><td class="b"></td></tr></tbody></table></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr);row-gap:4px;font-size:16px;line-height:18px;background:#fff;color:#000}td{block-size:20px}.a{inline-size:50px}.b{inline-size:70px}.t2,.t3{inline-size:100%}',
    boxes: {'.x': {minInlineSize: 40, intrinsicBlockSize: 18}}},
  {name: 'automatic table at the root shrinks to its px columns', html: '<table class="t"><tbody><tr><td class="a"></td><td class="b"></td></tr><tr><td class="a"></td><td class="b"></td></tr></tbody></table>',
    css: 'td{block-size:20px}.a{inline-size:50px}.b{inline-size:70px}'},
  {name: 'fixed table with a spanning first row and spacing', html: '<table class="t"><tbody><tr><td class="s" colspan="2"></td><td class="b"></td></tr><tr><td class="a"></td><td class="a"></td><td class="a"></td></tr><tr><td class="w" colspan="3"></td></tr></tbody></table>',
    css: '.t{table-layout:fixed;inline-size:182px;border-spacing:4px}.s,.a,.b,.w{block-size:20px}.s{inline-size:120px}.b{inline-size:50px}'},
  {name: 'fixed table with an empty rowspan cell and spacing', html: '<table class="t"><thead><tr><th class="h" rowspan="2"></th><th class="a"></th><th class="a"></th></tr><tr><th class="b"></th><th class="b"></th></tr></thead><tbody><tr><td class="s" rowspan="3"></td><td class="c" colspan="2"></td></tr><tr><td class="a"></td><td class="a"></td></tr><tr><td class="c" colspan="2"></td></tr></tbody></table>',
    css: '.t{table-layout:fixed;inline-size:100%;border-spacing:3px 5px}.h{inline-size:60px}.a{block-size:20px}.b{block-size:16px;padding:2px}.c{block-size:24px}.h,.s{padding:0}'},
  {name: 'taller px rowspan cells with content grow their rows', html: '<div class="g"><table class="t"><tbody><tr><td class="s">note</td><td class="p"></td></tr><tr><td class="q"></td></tr><tr><td class="z"></td></tr></tbody></table><table class="t u"><tbody><tr><td class="s2"></td><td class="e"></td></tr><tr><td class="e"></td></tr></tbody></table></div>'.replace('class="s"', 'class="s" rowspan="3"').replace('class="s2"', 'class="s2" rowspan="2"'),
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px;font-size:16px;line-height:18px;background:#fff;color:#000}.t{table-layout:fixed;inline-size:180px;border-spacing:4px}td{padding:0}.s{block-size:150px;inline-size:60px}.p{block-size:10px}.q{block-size:30px}.z{block-size:60px}.s2{block-size:60px;inline-size:60px}.e{block-size:0px}',
    boxes: {'.s': {minInlineSize: 40, intrinsicBlockSize: 18}}},
  {name: 'nested px rowspan cells sharing a first row', html: '<div class="g"><table class="t"><tbody><tr><td class="a" rowspan="3"></td><td class="b" rowspan="2"></td><td class="c"></td></tr><tr><td class="c"></td></tr><tr><td class="c"></td><td class="c"></td></tr></tbody></table><table class="t"><tbody><tr><td class="d" rowspan="4"></td><td class="e" rowspan="3"></td><td class="c"></td></tr><tr><td class="c"></td></tr><tr><td class="f"></td></tr><tr><td class="c"></td><td class="c"></td></tr></tbody></table></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px}.t{table-layout:fixed;inline-size:180px;border-spacing:2px}td{padding:0}.a{block-size:100px;inline-size:40px}.b{block-size:50px;inline-size:40px}.c{block-size:10px}.d{block-size:120px;inline-size:40px}.e{block-size:30px;inline-size:40px}.f{block-size:20px}'},
  {name: 'rowspan cells starting inside another span, and an empty last row', html: '<div class="g"><table class="t"><tbody><tr><td class="a" rowspan="2"></td><td class="p"></td><td class="o"></td></tr><tr><td class="q"></td><td class="b" rowspan="2"></td></tr><tr><td class="o"></td><td class="z"></td></tr></tbody></table><table class="t"><tbody><tr><td class="a2" rowspan="2"></td><td class="p"></td><td class="o"></td></tr><tr><td class="q"></td><td class="b2" rowspan="2"></td></tr><tr><td class="o"></td><td class="z"></td></tr></tbody></table><table class="t"><tbody><tr><td class="s" rowspan="3"></td><td class="p"></td></tr><tr><td class="q"></td></tr><tr><td class="e"></td></tr></tbody></table></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px}.t{table-layout:fixed;inline-size:180px;border-spacing:3px}td{padding:0}.p{block-size:10px}.q{block-size:20px}.z{block-size:30px}.o{block-size:0px}.e{block-size:0px}.a{block-size:70px;inline-size:40px}.b{block-size:30px;inline-size:40px}.a2{block-size:20px;inline-size:40px}.b2{block-size:80px;inline-size:40px}.s{block-size:60px;inline-size:40px}'},
  {name: 'crossing rowspans follow Chromium order (lower start row first)', html: '<table class="t"><tbody><tr><td class="a" rowspan="3"></td><td class="c"></td><td class="c"></td></tr><tr><td class="c"></td><td class="c"></td></tr><tr><td class="c"></td><td class="b" rowspan="2"></td></tr><tr><td class="c"></td><td class="c"></td></tr></tbody></table>',
    css: '.t{table-layout:fixed;inline-size:180px;border-spacing:0}td{padding:0}.c{block-size:10px}.a{block-size:90px;inline-size:40px}.b{block-size:60px}'},
  {name: 'table cells with block children (block flow)', html: '<div class="g"><table class="t"><tbody><tr><td class="c"><div class="k1"></div><div class="k2"></div></td><td class="o"></td></tr></tbody></table><table class="t"><tbody><tr><td class="v"><div class="k1"></div></td><td class="v"><div class="k2"></div><div class="k2"></div><div class="k1"></div></td></tr><tr><td class="v"><div class="k2"></div></td><td class="v"><div class="k3"></div></td></tr></tbody></table></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px}.t{table-layout:fixed;inline-size:100%;border-spacing:3px}td{padding:2px}.v{vertical-align:top}.k1{block-size:30px}.k2{block-size:12px;inline-size:40px}.k3{display:grid;grid-template-columns:minmax(0,1fr);block-size:16px}'},
  {name: 'grid align-content center and end', html: '<div class="g"><div class="c"><div class="a"></div><div class="b"></div></div><div class="e"><div class="a"></div><div class="b"></div></div><div class="o"><div class="a"></div><div class="a"></div><div class="a"></div></div></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);column-gap:4px}.c,.e,.o{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:auto;row-gap:6px;block-size:100px;padding:3px;border:2px solid red}.c{align-content:center}.e{align-content:end}.o{align-content:center;block-size:40px;overflow:hidden}.a{block-size:20px}.b{block-size:14px;inline-size:30px}',
    boxes: {'.o': {overflowBlock: 'clip'}}},
  {name: 'table cells aligned middle and bottom in taller rows', html: '<table class="t"><tbody><tr><td class="m"><div class="k"></div><div class="k"></div></td><td class="b"><div class="k"></div></td><td class="p"></td></tr></tbody></table>',
    css: '.t{table-layout:fixed;inline-size:192px;border-spacing:3px}td{padding:4px;block-size:90px}.b{vertical-align:bottom}.k{block-size:15px}'},
  {name: 'a sole baseline cell sits at the top of its row', html: '<table class="t"><tbody><tr><td class="s"><div class="k"></div><div class="k"></div></td><td class="e"></td><td class="m"><div class="k"></div></td></tr></tbody></table>',
    css: '.t{table-layout:fixed;inline-size:192px;border-spacing:3px}td{padding:4px;block-size:90px}.s,.e{vertical-align:baseline}.k{block-size:15px}'},
  {name: 'several baseline cells align their content bottoms', html: '<table class="t"><tbody><tr><td class="b1"><div class="k"></div><div class="k"></div></td><td class="b2"><div class="h"></div></td><td class="b3"><div class="k"></div></td><td class="e"></td><td class="m"><div class="k"></div><div class="h"></div><div class="h"></div></td></tr></tbody></table>',
    css: '.t{table-layout:fixed;inline-size:198px;border-spacing:3px}td{padding:4px}.b1,.b2,.b3,.e{vertical-align:baseline}.b2{padding-top:10px}.b3{padding-top:1px}.k{block-size:15px}.h{block-size:44px;inline-size:20px}'},
  {name: 'px translate moves a box and its descendants, and contains absolute children', html: '<div class="g"><div class="w"><div class="a"></div><div class="b"></div></div><div class="t"><div class="abs"></div></div><div class="n"></div></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);row-gap:6px;position:relative;padding:5px}.w{display:grid;grid-template-columns:minmax(0,1fr);transform:translate(12px, -3px)}.a,.b{block-size:20px}.b{transform:translateY(7px)}.t{display:grid;grid-template-columns:minmax(0,1fr);block-size:40px;transform:translateX(-9px)}.abs{position:absolute;left:4px;top:6px;inline-size:30px;block-size:10px}.n{block-size:15px}', options: {integrity: true}, expected: 'violated'},
  {name: 'scaled leaves keep their centre', html: '<div class="g"><div class="a"></div><div class="b"></div><div class="c"></div><div class="d"></div></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr) 80px;grid-auto-rows:40px;row-gap:4px;padding:3px}.a{transform:scale(.5)}.b{transform:scale(1.25, .75)}.c{transform:scaleX(2)}.d{inline-size:30px;block-size:20px;transform:scaleY(1.5) }', options: {integrity: true}, expected: 'violated'},
  {name: 'scaled boxes scale their descendants (nested scale and translate)', html: '<div class="g"><div class="w"><div class="a"></div><div class="i"><div class="x"></div><div class="y"></div></div></div><div class="n"></div></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr);row-gap:4px;padding:3px}.w{display:grid;grid-template-columns:minmax(0,1fr) 60px;column-gap:8px;padding:4px;transform:scale(.8)}.a{block-size:30px}.i{display:grid;grid-template-columns:minmax(0,1fr);transform:scale(1.5, .5)}.x{block-size:20px}.y{block-size:12px;transform:translate(3px, 2px)}.n{block-size:10px}', options: {integrity: true}, expected: 'violated'},
  {name: 'quarter-turn rotations keep boxes axis-aligned', html: '<div class="g"><div class="w"><div class="a"></div><div class="b"></div></div><div class="r1"></div><div class="r2"></div><div class="r3"></div></div>',
    css: '.g{display:grid;grid-template-columns:120px 80px;grid-auto-rows:60px;column-gap:10px;row-gap:10px;padding:20px}.w{display:grid;grid-template-columns:minmax(0,1fr) 30px;transform:rotate(90deg)}.a{block-size:20px}.b{block-size:40px}.r1{inline-size:60px;block-size:20px;transform:rotate(180deg)}.r2{inline-size:50px;block-size:16px;transform:rotate(-90deg)}.r3{transform:rotate(0.5turn) scale(1)}', options: {integrity: true}, expected: 'violated'},
  {name: 'transform lists compose in order', html: '<div class="g"><div class="p"></div><div class="q"></div><div class="r"></div></div>',
    css: '.g{display:grid;grid-template-columns:100px;grid-auto-rows:40px;row-gap:30px;padding:30px}.p,.q,.r{inline-size:60px;block-size:20px}.p{transform:translate(20px, 0) rotate(90deg)}.q{transform:rotate(90deg) translate(20px, 0)}.r{transform:scale(2) translateY(5px) rotate(-90deg) scaleX(.5)}', options: {integrity: true}},
  {name: 'percentage translations follow the box size', html: '<div class="g"><div class="w"><div class="a"></div></div><div class="c"></div></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:40px;row-gap:20px;padding:20px 40px;position:relative}.w{display:grid;grid-template-columns:minmax(0,1fr);transform:translate(-10%, 25%)}.a{block-size:20px;transform:rotate(90deg) translateX(50%)}.c{position:absolute;left:50%;top:50%;inline-size:60px;block-size:20px;transform:translate(-50%, -50%)}', options: {integrity: true}, expected: 'violated'},
  {name: 'em translations use the element font-size', html: '<div class="g"><div class="a"></div><div class="b"></div></div>',
    css: '.g{display:grid;grid-template-columns:120px;grid-auto-rows:30px;row-gap:10px;padding:20px;font-size:10px}.a{font-size:12px;transform:translate(1.5em, -0.5em)}.b{transform:scale(2) translateX(1em)}', options: {integrity: true}, expected: 'violated'},
  {name: 'style attributes win over selectors and layers, below importance', html: '<div class="g" style="column-gap: 12px"><div class="a" style="block-size: 30px"></div><div class="b" id="b" style="block-size: 30px; inline-size: 50px"></div><div class="c" style="block-size: 10px !important"></div></div>',
    css: '@layer base{.a{block-size:80px !important}}.g{display:grid;grid-template-columns:minmax(0,1fr) 100px minmax(0,1fr);column-gap:2px}#b{block-size:70px}.a{block-size:60px}.c{block-size:40px !important}'},
  {name: 'rtl mirrors grid, flex and nested placement', html: '<div class="g" dir="rtl"><div class="a"></div><div class="b"><div class="x"></div><div class="y"></div></div><div class="f"><div class="p"></div><div class="q"></div></div><div class="l" dir="ltr"><div class="x"></div><div class="y"></div></div></div>',
    css: '.g{display:grid;grid-template-columns:60px minmax(0,1fr);column-gap:8px;row-gap:4px;padding:3px 10px 3px 4px;border:2px solid red}.a{block-size:20px}.b,.l{display:grid;grid-template-columns:30px 40px;column-gap:5px}.x,.y{block-size:12px}.y{inline-size:25px}.f{display:flex;column-gap:6px}.p,.q{flex:none;inline-size:20px;block-size:10px}.q{inline-size:30px}'},
  {name: 'absolute boxes in rtl keep physical insets unless their containing block moves', html: '<div class="g" dir="rtl"><div class="k"><div class="in"></div></div><div class="m"></div><div class="out"></div></div>',
    css: '.g{display:grid;grid-template-columns:70px 50px;grid-auto-rows:40px;column-gap:6px;padding:4px;position:relative}.k{display:grid;grid-template-columns:minmax(0,1fr);position:relative}.in{position:absolute;left:5px;top:3px;inline-size:12px;block-size:8px}.out{position:absolute;right:7px;top:20px;inline-size:15px;block-size:10px}'},
  {name: 'rtl scroll containers keep their box', html: '<div class="g" dir="rtl"><div class="s"><div class="i"></div></div><div class="n"></div></div>',
    css: '.g{display:grid;grid-template-columns:120px minmax(0,1fr);column-gap:5px;padding:3px}.s{display:grid;grid-template-columns:minmax(0,1fr);block-size:50px;overflow-y:scroll;scrollbar-width:none;border:2px solid red}.i{block-size:80px}.n{block-size:30px}',
    boxes: {'.s': {overflowBlock: 'scroll'}}},
  {name: 'dir=auto takes the direction of the first strong character', html: '<div class="w"><div class="g" dir="auto"><p class="t">123 שלום</p><div class="b"></div></div><div class="g" dir="auto"><p class="t">42 hello</p><div class="b"></div></div></div>',
    css: '.w{display:grid;grid-template-columns:minmax(0,1fr);row-gap:4px}.g{display:grid;grid-template-columns:90px 40px;column-gap:6px}.t{font-size:16px;line-height:20px;white-space:nowrap}.b{block-size:20px}',
    boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 20, wrap: 'nowrap', overflow: 'visible'}}},
  {name: 'fixed tables with captions and border-spacing, colspan and rowspan', html: '<div class="g"><table class="t"><caption class="c">x</caption><tbody><tr><td class="a" colspan="2"></td><td class="b"></td></tr><tr><td class="a"></td><td class="a"></td><td class="a"></td></tr></tbody></table><table class="t u"><caption class="c">y</caption><tbody><tr><td class="s" rowspan="2"></td><td class="a"></td></tr><tr><td class="a"></td></tr></tbody></table></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px}.t{table-layout:fixed;inline-size:196px;border-spacing:4px 6px}.u{caption-side:bottom}.c{block-size:18px;padding:0}.a,.b{block-size:20px;padding:0}.s{padding:0}',
    boxes: {'.c': {minInlineSize: 1, intrinsicBlockSize: 18}}},
  {name: 'captions on tables with border and padding', html: '<div class="g"><table class="t"><caption class="c">x</caption><tbody><tr><td class="a"></td><td class="a"></td></tr></tbody></table><table class="t u"><caption class="c">y</caption><tbody><tr><td class="a"></td><td class="a"></td></tr></tbody></table></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px}.t{table-layout:fixed;inline-size:180px;border-spacing:4px 6px;padding:5px;border:3px solid red}.u{box-sizing:content-box;caption-side:bottom}.c{block-size:18px;padding:0}.a{block-size:20px;padding:0}',
    boxes: {'.c': {minInlineSize: 1, intrinsicBlockSize: 18}}},
  {name: 'fixed table with top and bottom captions', html: '<div class="g"><table class="t"><caption class="c">x</caption><tbody><tr><td class="a"></td><td class="a"></td></tr></tbody></table><table class="t u"><caption class="c">y</caption><tbody><tr><td class="a"></td><td class="a"></td></tr></tbody></table></div>',
    css: '.g{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px}.t{table-layout:fixed;inline-size:100%;border-spacing:0}.u{caption-side:bottom}.c{block-size:18px;padding:0}.a{block-size:20px;padding:0}',
    boxes: {'.c': {minInlineSize: 1, intrinsicBlockSize: 18}}},
  {name: 'fixed content-box table with thead, tbody and cell padding', html: '<table class="t"><thead><tr><th class="h"></th><th class="h"></th></tr></thead><tbody><tr><td class="a"></td><td class="b"></td></tr></tbody></table>',
    css: '.t{table-layout:fixed;inline-size:180px;box-sizing:content-box;border:5px solid red}.h,.a,.b{block-size:24px;padding:3px}.h{font-weight:700;text-align:left}.a{inline-size:60px}'},
  {name: 'grid tracks centered by justify-content', html: '<main class="grid"><div></div><div></div></main>',
    css: '.grid{display:grid;grid-template-columns:60px 60px;column-gap:10px;grid-template-rows:20px;justify-content:center}'},
];
const evaluate = (affine, width, height) => {
  const value = text => { const [n, d = '1'] = text.split('/'); return Number(n) / Number(d); };
  return value(affine.coefficient) * width + value(affine.heightCoefficient ?? '0') * height + value(affine.constant);
};
// Region ends may be open: a threshold belongs to exactly one side.
const inside = (range, value) => (range.minInclusive === false ? value > range.min : value >= range.min) && (range.maxInclusive === false ? value < range.max : value <= range.max);

for (const sample of cases) {
  test(`${sample.name}: model rectangles match Chromium`, async ({page}) => {
    const css = reset + sample.css;
    const report = analyzeHTML(sample.html, {name: 'Case', css, viewport: {min: 200, max: 900, height: {min: 300, max: 600}}, ...(sample.boxes ? {boxes: sample.boxes} : {}), ...(sample.options ?? {})});
    expect(report.status, JSON.stringify(report.diagnostics)).toBe(sample.expected ?? 'verified');
    let compared = 0;
    for (const [width, height] of [[200, 300], [321, 400], [480, 450], [777, 600], ...(sample.widths ?? []).map(width => [width, 400])]) {
      await page.setViewportSize({width, height});
      await page.setContent(`<!doctype html><style>html,body{margin:0}${sample.fullHeight ? 'html,body{height:100%}' : ''}${css}</style>${sample.html}`);
      const rows = report.sizes.filter(row => row.rect && inside(row.range, width) && (!row.heightRange || inside(row.heightRange, height)));
      for (const row of rows) {
        const indices = row.path.split('/').slice(1).map(Number);
        const rect = await page.evaluate(indices => {
          let node = document.querySelector('body > *');
          for (const index of indices) node = node.children[index];
          const r = node.getBoundingClientRect();
          return {x: r.left, y: r.top, width: r.width, height: r.height};
        }, indices);
        const expected = {x: evaluate(row.rect.inlineStart, width, height), y: evaluate(row.rect.blockStart, width, height),
          width: evaluate(row.rect.inlineSize, width, height), height: evaluate(row.rect.blockSize, width, height)};
        for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(rect[key] - expected[key]), `${row.path} ${key} at ${width}×${height}: browser ${rect[key]} model ${expected[key]}`).toBeLessThanOrEqual(1 / 64 + 1e-9);
        compared++;
      }
    }
    // Scroll containers publish no rectangle; their size shows in the following items.
    expect(compared).toBeGreaterThanOrEqual(8);
  });
}
