import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('CLI checks a declared component without a sidecar and validates explicit deployment inputs',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'isle-declared-cli-'));
  const run=(...args)=>spawnSync(process.execPath,['tools/isle.mjs','layout',...args],{encoding:'utf8',timeout:15000});
  try {
    const source=await readFile(new URL('../examples/layout-contracts/declared.isle',import.meta.url),'utf8'),file=join(directory,'app.isle');
    await writeFile(file,source);
    let result=run(file);assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).declarations[0].status,'verified');
    await writeFile(file,source.replace('repeat(4,','repeat(1,'));
    const config=join(directory,'environment.json');
    await writeFile(config,JSON.stringify({viewport:{min:120,max:640,height:{min:160,max:640}}}));
    result=run(file,config);assert.equal(result.status,1,result.stderr);
    const report=JSON.parse(result.stdout);assert.equal(report.status,'violated');
    assert.equal(report.declarations[0].proof.witness.code,'E_LAYOUT_CHILD_REQUIRES');
  } finally {await rm(directory,{recursive:true,force:true});}
});
