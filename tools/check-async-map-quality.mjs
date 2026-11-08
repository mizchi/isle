import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {preview} from 'vite';
const commands=[['check','integrity'],['check','copy','--manifest','examples/async-map/copy.txt'],['scan','scroll'],['scan','handlers'],['check','interactions'],['check','a11y','contrast'],['check','breakpoints','--sweep'],['check','responsive','--min-width','320','--max-width','1440']];
const server=await preview({configFile:'examples/async-map/vite.config.mjs',logLevel:'silent',preview:{host:'127.0.0.1',port:0,strictPort:false}}),url=`http://127.0.0.1:${server.httpServer.address().port}/`;
const binary=fileURLToPath(new URL('../node_modules/.bin/vlmkit',import.meta.url)),results=[];
await mkdir('evals/results/async-map',{recursive:true});
try{for(const command of commands){
  const run=await promisify(execFile)(binary,[...command,url,'--json'],{encoding:'utf8',maxBuffer:8<<20}).then(result=>({...result,status:0}),error=>({...error,status:error.code}));
  if(!run.stdout?.trim())throw new Error(run.stderr||`vlmkit could not run: ${command.join(' ')}`);
  const report=JSON.parse(run.stdout);results.push({gate:report.gate,verdict:report.verdict,counts:report.counts,findings:report.findings});
  await writeFile('evals/results/async-map/quality.json',JSON.stringify({version:1,tool:'vlmkit/0.24.0',results},null,2)+'\n');
  assert.equal(run.status,0,`${command.join(' ')}: ${JSON.stringify(report.findings)}`);console.log(`${command.join(' ')}: ${report.verdict}`);
}}finally{await new Promise(resolve=>server.httpServer.close(resolve));}
