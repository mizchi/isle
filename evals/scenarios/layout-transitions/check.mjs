import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {analyzeHTML} from '../../../packages/css-verifier/src/html.mjs';
import {createNoShiftContract} from '../../../packages/css-verifier/src/transitions.mjs';
import {verifyNoShift} from '../../../packages/css-verifier/src/transitions-node.mjs';
import {scenarios} from './fixtures.mjs';

const viewport={min:320,max:960,height:{min:240,max:720}};
const oracle=process.argv.includes('--browser-oracle');
const directory=new URL('../../results/layout-transitions/',import.meta.url);
const results=[];
let browser;
try {
  // Optional implementation oracle only. Never consulted by the static proof.
  if(oracle) {const {chromium}=await import('playwright');browser=await chromium.launch();}
  for(const scenario of scenarios) {
    const before=analyzeHTML(scenario.html,{name:'Page',viewport,css:scenario.before});
    const after=analyzeHTML(scenario.html,{name:'Page',viewport,css:scenario.after});
    const path=scenario.path ?? 'Page/1';
    const contract=createNoShiftContract({name:scenario.name,targets:[{name:'target',before:path,after:path}]});
    const result=await verifyNoShift(before,after,contract);
    assert.equal(result.status,scenario.status,scenario.name);
    const record={name:scenario.name,status:result.status,coverage:result.coverage.status,
      ...(result.change ? {change:result.change} : {}),...(result.proof.witness ? {witness:result.proof.witness} : {}),
      ...(result.status==='unknown' ? {diagnostics:result.proof.diagnostics} : {})};
    if(browser && result.status!=='unknown') {
      record.samples=[];
      const page=await browser.newPage();
      try {
        for(const width of [320,600,960]) {
          await page.setViewportSize({width,height:480});
          await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style id="fixture">${scenario.before}</style></head><body>${scenario.html}</body></html>`);
          const first=await measure(page,scenario.selector ?? '.action');
          compare(before,path,first,width);
          await page.locator('#fixture').evaluate((style,css)=>{style.textContent=css;},scenario.after);
          const last=await measure(page,scenario.selector ?? '.action');
          compare(after,path,last,width);
          record.samples.push({width,before:first,after:last});
        }
      } finally {await page.close();}
    }
    results.push(record);
  }
  await mkdir(directory,{recursive:true});
  await writeFile(new URL(oracle ? 'oracle.json' : 'report.json',directory),JSON.stringify({version:1,passed:true,
    scope:'noshift/1 endpoint presence and root-relative border-rectangle equality over a continuous viewport domain',
    oracle:oracle ? {engine:'Chromium',version:browser.version(),role:'Supplementary geometry oracle; does not decide static proof',tolerance:0.03} : null,
    limits:['trusted CSS/box extraction and content bounds','same viewport and root origin at both endpoints','one concrete case per endpoint','no scroll/subgrid coordinate frames','intermediate frames, paint, text and CLS not proved'],
    cases:results},null,2)+'\n');
  console.log(`Noshift: ${results.length} static scenarios passed${oracle ? '; supplemental Chromium geometry matched at 3 widths' : ' without a browser'}.`);
} finally {await browser?.close();}

async function measure(page,selector) {
  return page.evaluate(selector=>{
    const root=document.querySelector('.page'),target=document.querySelector(selector);
    if(!target || getComputedStyle(target).display==='none') return null;
    const r=root.getBoundingClientRect(),t=target.getBoundingClientRect();
    return {inlineStart:t.left-r.left,blockStart:t.top-r.top,inlineSize:t.width,blockSize:t.height};
  },selector);
}
function rational(value) {const [n,d=1]=value.split('/').map(Number);return n/d;}
function evaluate(value,width) {return rational(value.coefficient)*width+rational(value.heightCoefficient ?? '0')*480+rational(value.constant);}
function compare(report,path,actual,width) {
  const contains=(range,value)=>value>=range.min && value<=range.max && (value!==range.min || range.minInclusive) && (value!==range.max || range.maxInclusive);
  const rows=report.sizes.filter(row=>row.path===path && contains(row.range,width) && contains(row.heightRange,480) &&
    row.region.constraints.every(c=>c.strict ? evaluate(c,width)>0 : evaluate(c,width)>=0));
  if(!actual) {assert.equal(rows.length,0);return;}
  assert.ok(rows.length>0,'A rendered target needs a model rectangle');
  for(const row of rows) for(const field of ['inlineStart','blockStart','inlineSize','blockSize']) {
    assert.ok(Math.abs(actual[field]-evaluate(row.rect[field],width))<0.03,`${path} ${field}: ${actual[field]} vs ${evaluate(row.rect[field],width)}`);
  }
}
