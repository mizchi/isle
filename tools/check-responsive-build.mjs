import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {preview} from 'vite';

const id=process.argv[2] ?? 'responsive-checked';
assert.ok(['responsive-checked','responsive-dynamic'].includes(id),'Unknown checked example');
const directory = `examples/${id}`;
const resultsDirectory=`evals/results/${id==='responsive-dynamic' ? 'layout-dynamic' : 'layout-build'}`;
const html = await readFile(`${directory}/dist/index.html`,'utf8');
const certificate = JSON.parse(await readFile(`${directory}/dist/isle.layout.json`,'utf8'));
assert.equal(certificate.status,'verified');
assert.equal(certificate.document.sha256,createHash('sha256').update(html).digest('hex'));
const gates = [
  ['check','integrity'],
  ['check','copy','--manifest',`${directory}/copy.txt`],
  ['scan','scroll'],
  ['scan','handlers'],
  ['check','interactions'],
  ['check','breakpoints','--sweep'],
  ['check','responsive','--min-width','320','--max-width','1280','--min-height',String(certificate.contracts.viewport.height.min),'--max-height','900'],
];
const binary = fileURLToPath(new URL('../node_modules/.bin/vlmkit',import.meta.url));
const results = [];
await mkdir(resultsDirectory,{recursive:true});
if(id==='responsive-dynamic') {
  const result=await promisify(execFile)('moon',['run','cmd/layout-dynamic-model','--target','js'],{encoding:'utf8'});
  const model=JSON.parse(result.stdout);assert.ok(model.complete && model.bounded_safe && model.gutter_safe);
  await writeFile(`${resultsDirectory}/model.json`,JSON.stringify(model,null,2)+'\n');
}
const server=await preview({configFile:`${directory}/vite.config.mjs`,logLevel:'silent',preview:{host:'127.0.0.1',port:0,strictPort:false}});
const url=`http://127.0.0.1:${server.httpServer.address().port}/`;
try { for (const [group,name,...options] of gates) {
  const run = await promisify(execFile)(binary,[group,name,url,...options,'--json'],{encoding:'utf8',maxBuffer:8<<20}).then(result=>({...result,status:0}),error=>({...error,status:error.code}));
  let report;
  try { report=JSON.parse(run.stdout); } catch { throw new Error(`vlmkit failed: ${run.stdout}\n${run.stderr}`); }
  results.push({gate:report.gate,verdict:report.verdict,counts:report.counts,findings:report.findings});
  await writeFile(`${resultsDirectory}/quality.json`,JSON.stringify({document:certificate.document,results},null,2)+'\n');
  assert.equal(run.status,0,`${group} ${name}: ${JSON.stringify(report.findings)}`);
  console.log(`${group} ${name}: ${report.verdict}`);
} } finally {await new Promise(resolve=>server.httpServer.close(resolve));}
