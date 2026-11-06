import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {preview} from 'vite';
const target=process.argv[2] ?? 'playground';
assert.ok(['playground','control-flow'].includes(target),'Unknown UI quality target');
const directory=target==='playground' ? 'playground' : 'examples/control-flow';
const resultsDirectory=target==='playground' ? 'evals/results/playground' : 'evals/results/control-components';
const gates=[['check','integrity'],['check','copy','--manifest',`${directory}/copy.txt`],['scan','scroll'],['scan','handlers'],['check','interactions'],['check','breakpoints','--sweep'],['check','responsive','--min-width','320','--max-width','1440']];
const server=await preview({configFile:`${directory}/vite.config.mjs`,logLevel:'silent',preview:{host:'127.0.0.1',port:0,strictPort:false}});
const url=`http://127.0.0.1:${server.httpServer.address().port}/`;
const binary=fileURLToPath(new URL('../node_modules/.bin/vlmkit',import.meta.url)),results=[];
await mkdir(resultsDirectory,{recursive:true});
try {for(const command of gates) {
  const run=await promisify(execFile)(binary,[...command,url,'--json'],{encoding:'utf8',maxBuffer:8<<20}).then(result=>({...result,status:0}),error=>({...error,status:error.code}));
  const report=JSON.parse(run.stdout);results.push({gate:report.gate,verdict:report.verdict,counts:report.counts,findings:report.findings});
  await writeFile(`${resultsDirectory}/quality.json`,JSON.stringify({results},null,2)+'\n');
  assert.equal(run.status,0,`${command.join(' ')}: ${JSON.stringify(report.findings)}`);console.log(`${command.slice(0,2).join(' ')}: ${report.verdict}`);
}} finally {await new Promise(resolve=>server.httpServer.close(resolve));}
