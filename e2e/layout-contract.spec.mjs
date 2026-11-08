import {test,expect} from '@playwright/test';
import {init,killThreads} from 'z3-solver';
import {compile,requireIR} from '../lib/compiler.mjs';
import {prepareProgram} from '../lib/codegen.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {createContractIR,createLayoutIR,createObligationIR,verifyObligationIR} from '../lib/layout-contract.mjs';

let api;
test.beforeAll(async()=>{api=await init();});test.afterAll(async()=>{await killThreads(api.em);});
const input=requireIR(compile('component Four(){<main class="row"><div class="cell"/><div class="cell"/><div class="cell"/><div class="cell"/></main>}'));
const html=prepareProgram(input).render('Four',{}).html;
const base='*{box-sizing:border-box;margin:0;padding:0}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:40px}.cell{min-width:40px;height:40px}';
const contract=(min=160,blockMin=40)=>createContractIR({component:'Four',requires:{inlineSize:{min,max:640},blockSize:{min:blockMin,max:640}}});
const proof=(c,css)=>verifyObligationIR(createObligationIR(c,createLayoutIR(analyzeLayout(input,{css,viewport:{min:80,max:640,height:{min:40,max:640}}}))),api);
const overflowing=page=>page.locator('.row').evaluate(row=>{
  const box=row.getBoundingClientRect();return [...row.children].some(child=>{const rect=child.getBoundingClientRect();return rect.right>box.right+0.01 || rect.bottom>box.bottom+0.01;});
});

test('contract gap counterexample reproduces in native CSS, and the strengthened allocation fits',async({page})=>{
  const css=base+'.row{column-gap:8px}',broken=await proof(contract(),css);
  expect(broken.status).toBe('violated');
  const width=Math.floor(broken.proof.witness.viewport);
  expect(width).toBeGreaterThanOrEqual(160);expect(width).toBeLessThan(184);
  await page.setViewportSize({width,height:480});
  await page.setContent(`<style>${css}</style>${html}`);expect(await overflowing(page)).toBe(true);
  expect((await proof(contract(184),css)).status).toBe('verified');
  await page.setViewportSize({width:184,height:480});expect(await overflowing(page)).toBe(false);
});

test('responsive branch witness reproduces before the exact boundary, and the corrected CSS fits',async({page})=>{
  const responsive=threshold=>base+`@media(width < ${threshold}px){.row{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
  const broken=await proof(contract(80,80),responsive(159));
  expect(broken.status).toBe('violated');
  const width=Math.floor(broken.proof.witness.viewport);
  expect(width).toBe(159);
  await page.setViewportSize({width,height:480});
  await page.setContent(`<style>${responsive(159)}</style>${html}`);expect(await overflowing(page)).toBe(true);
  expect((await proof(contract(80,80),responsive(160))).status).toBe('verified');
  await page.setContent(`<style>${responsive(160)}</style>${html}`);expect(await overflowing(page)).toBe(false);
});
