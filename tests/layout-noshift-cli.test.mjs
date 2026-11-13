import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('CLI enforces declared noshift with authored locations and exact deltas',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'isle-noshift-cli-'));
  try {
    const source=await readFile(new URL('../examples/layout-contracts/noshift.isle',import.meta.url),'utf8'),file=join(directory,'panel.isle');
    const run=(...args)=>spawnSync(process.execPath,['tools/isle.mjs','layout',file,...args],{encoding:'utf8',timeout:30000});
    await writeFile(file,source);
    const verified=run();assert.equal(verified.status,0,verified.stderr);
    assert.equal(JSON.parse(verified.stdout).noshift.status,'verified');
    await writeFile(file,source.replace('height:80px;display:grid','display:grid'));
    const broken=run('--summary');assert.equal(broken.status,1,broken.stderr);
    assert.match(broken.stdout,/E_NOSHIFT_BLOCK_START/);
    assert.match(broken.stdout,/changes by 56px/);
    assert.match(broken.stdout,/panel\.isle:\d+:\d+/);
    await writeFile(file,source.replace('noshift ".action"','noshift ".missing"'));
    const unknown=run();assert.equal(unknown.status,1);
    assert.equal(JSON.parse(unknown.stdout).noshift.status,'unknown');
    const dom=source.replace('noshift ".action";','').replace('<button class="action"','<button @noshift class="action"');
    await writeFile(file,dom.replace('height:80px;display:grid','display:grid'));
    const annotation=run('--summary');assert.equal(annotation.status,1);
    assert.match(annotation.stdout,/@noshift.*changes by 56px/);
    assert.match(annotation.stdout,/panel\.isle:\d+:\d+/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('CLI identifies the moving key in the authored requirement',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'isle-noshift-key-cli-'));
  try {
    const source=await readFile(new URL('../examples/layout-contracts/noshift-keys.isle',import.meta.url),'utf8'),file=join(directory,'keys.isle');
    await writeFile(file,source.replace('grid-column:1;grid-row:1;','').replace('grid-column:1;grid-row:2;',''));
    const result=spawnSync(process.execPath,['tools/isle.mjs','layout',file,'--summary'],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,1,result.stderr);
    assert.match(result.stdout,/key "[ab]".*changes by -?40px/);
    assert.match(result.stdout,/keys\.isle:\d+:\d+/);
  } finally {await rm(directory,{recursive:true,force:true});}
});
