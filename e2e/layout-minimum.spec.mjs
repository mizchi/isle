import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { analyzeLayout } from '../lib/layout.mjs';

const ir = requireIR(compile('component Four() {<main class="row"><div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div></main>}'));
const html = prepareProgram(ir).render('Four', {}, {mode:'ssr'}).html;
const columns = count => Array(count).fill('minmax(0,1fr)').join(' ');
const css = `*{box-sizing:border-box;margin:0}.row{display:grid;grid-template-columns:${columns(4)}}.cell{min-width:40px;padding-block:4px}`;
const render = css => `<html><head><style>${css}</style></head><body>${html}</body></html>`;
const rational = value => { const [n,d=1] = value.split('/').map(Number); return n/d; };
const predictedFailure = (report, width, height) => report.diagnostics.some(row => row.code === 'E_LAYOUT_ITEM_SIZE' && row.axis === 'inline' &&
  (row.region ? row.region.constraints.every(c => {
    const slack = rational(c.coefficient)*width + rational(c.heightCoefficient ?? '0')*height + rational(c.constant);
    return c.strict ? slack > 0 : slack >= 0;
  }) : width >= row.range.min && width < row.range.max));

test('CSS minimum clamps match native widths and responsive reachable-region failures', async ({page}) => {
  const samples = [], cases = [
    {id:'four',css},
    {id:'correct-breakpoint',css:css + `@media(width < 160px){.row{grid-template-columns:${columns(2)}}}`},
    {id:'incorrect-breakpoint',css:css + `@media(width < 159px){.row{grid-template-columns:${columns(2)}}}`},
    {id:'gap-edges',css:css + '.row{gap:8px;padding:12px;border:2px solid black}'},
    {id:'content-box',css:css + '.cell{box-sizing:content-box;padding:2px;border:1px solid black}'},
    {id:'combined-conditions',css:css + `.row{container:Row / inline-size;block-size:100px;grid-template-columns:${columns(2)}}@media(height >= 400px){@container Row (width >= 150px){.cell{min-width:80px}}}`,
      viewport:{min:100,max:300,height:{min:300,max:500}}},
  ];
  for (const row of cases) {
    row.report = analyzeLayout(ir, {component:'Four',css:row.css,viewport:row.viewport ?? {min:100,max:300}});
    expect(row.report.status, `${row.id}: ${JSON.stringify(row.report.diagnostics)}`).not.toBe('unknown');
    for (const width of [100,149,150,159,160,161,183,184,211,212,213,300]) for (const height of row.viewport ? [350,400,500] : [500]) {
      await page.setViewportSize({width,height}); await page.setContent(render(row.css));
      const measured = await page.locator('.row').evaluate(root => {
        const parent = root.getBoundingClientRect(), cells = [...root.children].map(node => node.getBoundingClientRect());
        const style = getComputedStyle(root), tracks = style.gridTemplateColumns.split(' ').map(parseFloat);
        return {parentWidth:parent.width,cellWidths:cells.map(cell=>cell.width),trackWidths:tracks,
          overflow:cells.some((cell,i)=>cell.width>tracks[i%tracks.length]+.02)};
      });
      expect(measured.overflow, `${row.id}/${width}/${height}`).toBe(predictedFailure(row.report,width,height));
      if (row.id === 'four') { expect(measured.parentWidth).toBe(width); expect(measured.cellWidths[0]).toBe(Math.max(40,width/4)); }
      samples.push({id:row.id,width,height,...measured});
    }
  }
  await mkdir('evals/results/layout-minimum',{recursive:true});
  const result = {cases:cases.map(({id,report})=>({id,report})),samples};
  await writeFile('evals/results/layout-minimum/full.json.gz',gzipSync(JSON.stringify(result)));
  await writeFile('evals/results/layout-minimum/latest.json',JSON.stringify({detail:'summary; full symbolic checks in full.json.gz',
    cases:cases.map(({id,report})=>({id,status:report.status,scope:report.scope,diagnostics:report.diagnostics})),samples},null,2)+'\n');
});
