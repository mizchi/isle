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

test('consumer summary groups repeated layout failures with source locations and keeps JSON available', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-summary-'));
  const run = (...args) => spawnSync(process.execPath, ['tools/isle.mjs', 'layout', ...args], {encoding:'utf8',timeout:15000});
  try {
    const source = await readFile(new URL('../evals/scenarios/layout-usability/broken.isle', import.meta.url), 'utf8');
    const file = join(directory, 'app.isle'), config = join(directory, 'environment.json');
    await writeFile(file, source);
    await writeFile(config, JSON.stringify({component:'Board',viewport:{min:320,max:960,height:{min:640,max:960}}}));
    let result = run(file, config, '--summary');
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /Layout Board: violated/);
    assert.match(result.stdout, /width \[400, 408\)/);
    assert.match(result.stdout, /requires 180px but receives 178px/);
    assert.match(result.stdout, /app\.isle:\d+:\d+/);
    assert.match(result.stdout, /Board\/0, Board\/1, Board\/2, Board\/3/);
    assert.equal((result.stdout.match(/E_LAYOUT_ITEM_SIZE/g) ?? []).length, 1);
    assert.doesNotMatch(result.stdout, /Board inline allocation: requires 180px/);
    assert.match(result.stdout, /checked contracts: Board at Board, Tile at Board\/0/);
    assert.ok(result.stdout.length < 5000, `Summary grew to ${result.stdout.length} characters`);
    const json = run(file, config, '--json');
    assert.equal(JSON.parse(json.stdout).status, 'violated');
    await writeFile(file, source.replace('width < 400px', 'width < 408px'));
    result = run(file, config, '--summary');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Layout Board: verified/);
    assert.match(result.stdout, /Declared instances: 5 verified/);
    await writeFile(file, source.replace('min-inline-size: 180px', 'min-inline-size: var(--unknown)'));
    result = run(file, config, '--summary');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Layout Board: unknown/);
    assert.match(result.stdout, /U_LAYOUT_VARIABLE/);
    assert.doesNotMatch(result.stdout, /undefined/);
  } finally {await rm(directory,{recursive:true,force:true});}
});
