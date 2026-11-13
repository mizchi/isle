import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rename,symlink,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const packageRoot=fileURLToPath(new URL('../packages/css-verifier/',import.meta.url));

test('CSS verifier implementation and types have no imports outside their package source', async () => {
  const root=join(packageRoot,'src');
  for(const entry of await readdir(root,{recursive:true})) {
    if(!/\.(?:mjs|mts|ts)$/.test(entry)) continue;
    const file=join(root,entry),source=await readFile(file,'utf8');
    assert.doesNotMatch(source,/ProgramIR|\.isle\b|from ['"].*(?:playwright|compiler)/,entry);
    for(const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      assert.ok(resolve(dirname(file),match[1]).startsWith(root+'/'),`${entry} imports outside the core: ${match[1]}`);
    }
  }
});

test('an isolated npm consumer verifies HTML and runs Z3 without installing Isle', async () => {
  const directory=await mkdtemp(join(tmpdir(),'css-verifier-consumer-'));
  try {
    const packed=spawnSync('pnpm',['pack','--config.ignore-scripts=true','--pack-destination',directory],{cwd:packageRoot,encoding:'utf8'});
    assert.equal(packed.status,0,packed.stderr || packed.stdout);
    const archive=(await readdir(directory)).find(file=>file.endsWith('.tgz'));
    const unpacked=spawnSync('tar',['-xzf',join(directory,archive),'-C',directory],{encoding:'utf8'});
    assert.equal(unpacked.status,0,unpacked.stderr);
    const app=join(directory,'app');
    await mkdir(join(app,'node_modules/@mizchi'),{recursive:true});
    await rename(join(directory,'package'),join(app,'node_modules/@mizchi/css-verifier'));
    const metadata=JSON.parse(await readFile(join(app,'node_modules/@mizchi/css-verifier/package.json'),'utf8'));
    for(const entry of Object.values(metadata.exports)) {
      assert.ok((await readFile(join(app,'node_modules/@mizchi/css-verifier',entry.types),'utf8')).length);
    }
    for(const name of Object.keys(metadata.dependencies)) {
      await symlink(fileURLToPath(new URL(`../node_modules/${name}`,import.meta.url)),join(app,'node_modules',name),'dir');
    }
    await writeFile(join(app,'package.json'),'{"type":"module"}');
    await writeFile(join(app,'check.mjs'),`import assert from 'node:assert/strict';
import {analyzeHTML} from '@mizchi/css-verifier/html';
import {verifyLayoutReport} from '@mizchi/css-verifier/z3/node';
import {createContractIR,createLayoutIR,createObligationIR} from '@mizchi/css-verifier/contracts';
import {verifyContractObligation} from '@mizchi/css-verifier/contracts/node';
import {createNoShiftContract} from '@mizchi/css-verifier/transitions';
import {verifyNoShift} from '@mizchi/css-verifier/transitions/node';
import {analyzeLayout} from '@mizchi/css-verifier';
const report=analyzeHTML('<main class="row"><div></div><div></div></main>',{
  name:'Document',css:'*{box-sizing:border-box}.row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));height:100px;grid-template-rows:100px}',viewport:{min:160,max:400,height:{min:100,max:100}}
});
assert.equal(report.status,'verified');
assert.equal((await verifyLayoutReport(report)).status,'verified');
const contract=createContractIR({component:'Document',requires:{inlineSize:{min:160,max:400},blockSize:{min:100,max:100}}});
assert.equal((await verifyContractObligation(createObligationIR(contract,createLayoutIR(report)))).status,'verified');
const stable=createNoShiftContract({name:'Stable',targets:[{name:'root',before:'Document',after:'Document'}]});
assert.equal((await verifyNoShift(report,report,stable)).status,'verified');
const named=analyzeLayout({tag:'main',classes:['row'],children:[{tag:'div',targets:['action']},{tag:'div'}]},{name:'Document',css:'*{box-sizing:border-box}.row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));height:100px;grid-template-rows:100px}',viewport:{min:160,max:400,height:{min:100,max:100}}});
const target=createNoShiftContract({name:'Named',targets:[{name:'action',before:{id:'action',within:'Document'},after:{id:'action',within:'Document'}}]});
assert.equal((await verifyNoShift(named,named,target)).status,'verified');
await assert.rejects(import('@isle/prototype/compiler'),{code:'ERR_MODULE_NOT_FOUND'});
`);
    const checked=spawnSync(process.execPath,['check.mjs'],{cwd:app,encoding:'utf8',env:{...process.env,PATH:'/usr/bin:/bin'},timeout:30000});
    assert.equal(checked.status,0,checked.stderr || checked.stdout);
  } finally {await rm(directory,{recursive:true,force:true});}
});
