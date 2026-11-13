import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {compile, requireIR} from '../../../lib/compiler.mjs';
import {compilePreview} from '../../../lib/compiler-browser.mjs';
import {analyzeLayout} from '../../../lib/layout.mjs';
import {declaredLayoutOptions} from '../../../lib/layout-declarations.mjs';
import {verifyDeclaredLayouts} from '../../../lib/layout-contract-node.mjs';
import {styleTags} from '../../../lib/styles.mjs';

const source = await readFile(new URL('../../../examples/layout-contracts/positioned.isle', import.meta.url), 'utf8');
const peer = source.replace('320px..960px','115.5px..960px')
  .replace('overlay ".controls" within map;', 'overlay ".controls" within map; overlay ".peer" within map;')
  .replace('</style>', '.peer{position:absolute;left:16px;bottom:16px;width:40px;height:40px}</style>')
  .replace('<div class="surface" />', '<div class="surface" /><div class="peer"/>');
const scenarios = [
  {name:'padding-box-end', source, status:'verified', measure:true},
  {name:'percentage-axes', source:source.replace('inset-inline-end: 16px', 'inset-inline-start: 25%').replace('inset-block-end: 16px', 'inset-block-start: 25%'), status:'verified', measure:true},
  {name:'end-overflow', source:source.replace('inset-inline-end: 16px', 'inset-inline-end: -8px'), status:'violated', code:'E_LAYOUT_ABSOLUTE_END'},
  {name:'space-mismatch', source:source.replace('space map = ".map"', 'space map = ".surface"'), status:'violated'},
  {name:'transform-unmodeled', source:source.replace('position: relative;', 'position: relative; transform: translateX(1px);'), status:'unknown'},
  {name:'peer-fractional-collision', source:peer, status:'violated', code:'E_LAYOUT_OVERLAY_OVERLAP'},
  {name:'peer-corrected', source:peer.replace('115.5px','116px'), status:'verified'},
  {name:'peer-responsive', source:peer.replace('</style>', '@media(width < 116px){.peer{bottom:72px}}</style>'), status:'verified'},
];
const directory = new URL('../../results/positioned-layout/', import.meta.url);
await mkdir(directory, {recursive:true});
const results = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const scenario of scenarios) {
    const ir = requireIR(compile(scenario.source));
    const report = analyzeLayout(ir, declaredLayoutOptions(ir, {css:''}));
    const [proof] = await verifyDeclaredLayouts(report);
    assert.equal(proof.status, scenario.status, scenario.name);
    if (scenario.code) assert.equal(proof.proof.witness.code, scenario.code, scenario.name);
    const result = {name:scenario.name, status:proof.status, solver:proof.proof.solver, ...(proof.proof.witness ? {witness:proof.proof.witness} : {})};
    if (scenario.measure) {
      const compiled = compilePreview(scenario.source);
      assert.equal(compiled.ok, true);
      const html = document(compiled.preview);
      const samples = [];
      for (const width of [320,375,641,960]) {
        await page.setViewportSize({width,height:800});
        await page.setContent(html);
        const actual = await page.locator('.controls').evaluate(control => {
          const map = document.querySelector('.map'), p = map.getBoundingClientRect(), c = control.getBoundingClientRect();
          return {x:c.left-p.left-map.clientLeft,y:c.top-p.top-map.clientTop,width:p.width,height:p.height};
        });
        assert.equal(actual.width, width);
        const position = report.sizes.find(box => box.position === 'absolute').origin;
        const exact = text => {const [n,d=1]=text.split('/').map(Number);return n/d;};
        const evaluate = expression => exact(expression.coefficient)*width+exact(expression.heightCoefficient ?? '0')*800+exact(expression.constant);
        assert.ok(Math.abs(actual.x-evaluate(position.inline))<0.03);
        assert.ok(Math.abs(actual.y-evaluate(position.block))<0.03);
        samples.push({viewport:width,...actual});
      }
      result.samples = samples;
      if (scenario.name === 'padding-box-end') {
        await writeFile(new URL('preview.html',directory),html);
        for(const width of [375,1280]) {
          await page.setViewportSize({width,height:800});await page.setContent(html);
          await page.screenshot({path:new URL(`preview-${width}.png`,directory).pathname,fullPage:true});
        }
      }
    }
    results.push(result);
  }
  await writeFile(new URL('report.json',directory), JSON.stringify({version:1,passed:true,
    scope:'Actual compiler + independent CSS extraction + declared PositionedGrid Z3 obligations; compiled preview measured in Chromium at four widths',
    limits:['closed CSS','horizontal-tb/ltr','no transform/scrolling/subgrid containing blocks','pixel rounding not proved; sample tolerance 0.03px','opaque SDK/Canvas and arbitrary dynamic coordinates not modeled'],
    browser:browser.version(),cases:results},null,2)+'\n');
  console.log(`PositionedGrid: ${results.length} evaluation scenarios passed.`);
} finally {await browser.close();}

function document(preview) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PositionedGrid compiler evaluation</title>
  <style>html,body{margin:0;padding:0}body{font:16px/1.5 system-ui,sans-serif;color:#234}.host{inline-size:min(100%,960px)}h1{font-size:20px;margin:16px}p{margin:16px;max-width:40ch}</style>
  ${styleTags(preview.styles)}<h1>PositionedGrid compiler evaluation</h1><div class="host">${preview.html}</div><p>The dark 40 × 40 overlay uses 16px end insets from the map's padding box. Geometry is checked before rendering.</p></html>`;
}
