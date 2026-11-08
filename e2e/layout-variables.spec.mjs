import {test,expect} from '@playwright/test';
import {compile,requireIR} from '../lib/compiler.mjs';
import {prepareProgram} from '../lib/codegen.mjs';
import {analyzeLayout} from '../lib/layout.mjs';

const ir=requireIR(compile('component Four(){<main class="row"><div class="cell"/><div class="cell"/><div class="cell"/><div class="cell"/></main>}'));
const html=prepareProgram(ir).render('Four',{}, {mode:'ssr'}).html;
const base='*{box-sizing:border-box;margin:0;padding:0}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:40px}.cell{min-width:var(--cell);height:40px}';
const analyze=(css,width=160)=>analyzeLayout(ir,{css:base+css,ancestors:[{tag:'html'},{tag:'body'}],viewport:{min:width,max:width,height:{min:300,max:300}}});

test('custom-property cascade and substitution match native computed geometry',async({page})=>{
  const cases=[
    ['literal','.row{--cell:40px}','verified',40],
    ['case-sensitive','.row{--CELL:80px;--cell:40px}','verified',40],
    ['computed alias','.row{--unit:40px;--cell:var(--unit)}.cell{--unit:80px}','verified',40],
    ['child alias','.row{--cell:40px}.cell{--alias:var(--cell);--cell:80px;min-width:var(--alias)}','violated',80],
    ['missing fallback','.cell{min-width:var(--missing,var(--backup,40px))}','verified',40],
    ['empty value','.row{--empty:;--cell:var(--empty)40px}','verified',40],
    ['cycle fallback','.row{--cell:var(--cell)}.cell{min-width:var(--cell,80px)}','violated',80],
    ['dormant fallback cycle','.row{--safe:40px;--cell:var(--safe,var(--other));--other:var(--cell)}.cell{min-width:var(--cell,80px)}','unknown',40],
    ['reverse dormant fallback cycle','.row{--safe:80px;--cell:var(--safe,var(--other));--other:var(--cell)}.cell{min-width:var(--cell,40px)}','unknown',80],
    ['token concatenation','.row{--n:40}.cell{min-width:var(--n)px}','unknown',40],
    ['invalid dimension','.row{--cell:10deg}','unknown',40],
    ['initial','.row{--cell:40px}.cell{--cell:initial;min-width:var(--cell,80px)}','violated',80],
    ['substituted inherit','.row{--cell:40px}.cell{--cell:var(--missing,inherit)}','verified',40],
    ['substituted initial','.row{--cell:80px}.cell{--cell:var(--missing,initial);min-width:var(--cell,40px)}','verified',40],
    ['important layers','@layer a,b;@layer a{.row{--cell:40px!important}}@layer b{.row{--cell:80px!important}}.row{--cell:80px!important}','verified',40],
    ['all leaves custom properties','.row{--cell:40px}.cell{all:initial}.cell{min-width:var(--cell)}','verified',40],
  ];
  await page.setViewportSize({width:160,height:300});
  for(const [name,css,status,width] of cases) {
    const report=analyze(css);expect(report.status,name+': '+JSON.stringify(report.diagnostics)).toBe(status);
    await page.setContent('<!doctype html><style>'+base+css+'</style>'+html);
    expect(await page.locator('.cell').first().evaluate(node=>node.getBoundingClientRect().width),name).toBe(width);
    if(status!=='unknown') {
      const size=report.sizes.find(size=>size.box==='.cell').inlineSize;
      const exact=value=>{const [n,d=1]=value.split('/').map(Number);return n/d;};
      expect(exact(size.coefficient)*160+exact(size.constant),name).toBe(width);
    }
  }
});

test('media and container variable branches reproduce the exact overflow boundary',async({page})=>{
  for(const kind of ['media','container cards ']) {
    const css='.row{--cell:40px;container:cards/inline-size}@'+kind+'(width < 320px){.cell{--cell:80px}}';
    for(const width of [160,200,319,320,321,640]) {
      const report=analyze(css,width);expect(report.status).toBe(width<320 ? 'violated' : 'verified');
      await page.setViewportSize({width,height:300});await page.setContent('<!doctype html><style>'+base+css+'</style>'+html);
      expect(await page.locator('.cell').evaluateAll(nodes=>nodes[0].getBoundingClientRect().right>nodes[1].getBoundingClientRect().left+.01)).toBe(width<320);
    }
  }
});
