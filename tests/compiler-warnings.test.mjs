import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compilePreview} from '../lib/compiler-browser.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {build,createLogger} from 'vite';

test('unobserved declarations, updates and entries produce located warnings without rejecting compilation',()=>{
  const source=`/* 日本語🌊 */ client component C(unused: string) {
    state dead = 0;
    state live = 0;
    derive ignored = unused;
    event increment(e: EventSnapshot<MouseEvent>) { dead += 1; }
    event update(e: EventSnapshot<MouseEvent>) { live += 1; dead = 0; }
    <main><button on:click={increment}>Idle</button><button on:click={update}>{live}</button></main>
  }`;
  const result=compile(source);
  assert.equal(result.ok,true);assert.doesNotThrow(()=>requireIR(result));
  assert.ok(result.diagnostics.length>0);
  assert.ok(result.diagnostics.every(d=>d.severity==='warning'&&d.end>d.start));
  for(const name of ['unused','dead','ignored']) {
    const d=result.diagnostics.find(d=>d.code==='W_UNOBSERVED_VALUE'&&source.slice(d.start,d.end)===name);
    assert.ok(d,name);assert.match(d.message,/C/);
  }
  const update=result.diagnostics.find(d=>d.code==='W_UNOBSERVED_UPDATE');
  assert.equal(source.slice(update.start,update.end),'dead = 0;');
  const entry=result.diagnostics.find(d=>d.code==='W_UNOBSERVED_EVENT');
  assert.match(source.slice(entry.start,entry.end),/^event increment/);
  assert.equal(result.diagnostics.filter(d=>d.code==='W_UNOBSERVED_EVENT').length,1);
});

test('SSR reads, initializers, effects and opaque observers do not receive false dead-value warnings',()=>{
  for(const source of [
    'component C(title:string){derive heading=title;<h1>{heading}</h1>}',
    'component C(){derive cls="card";<div class={cls}/>} ',
    'client component C(seed:number){state n=seed;<button>on click add{n+=1;}{n}</button>}',
    'client component C(values:number[]){state n=values[0];<button>on click run{n=0;}Run</button>}',
    'client component C(){event cancel(e:EventSnapshot<MouseEvent>){}<button on:click.preventDefault={cancel}>Cancel</button>}',
  ]) assert.deepEqual(compile(source).diagnostics,[],source);
  const source='client component C(){state n=0;<button>on click activate{n+=1;}Activate</button>}';
  for(const externalObservers of [true,['C']]) assert.deepEqual(compile(source,{externalObservers}).diagnostics,[]);
  assert.ok(compile(source,{externalObservers:['Other']}).diagnostics.some(d=>d.code==='W_UNOBSERVED_EVENT'));
});

test('named events warn once across bindings and unused declarations remain type checked',()=>{
  const source='client component C(){state n=0;event idle(e:EventSnapshot<MouseEvent>){n+=1;}<main><button on:click={idle}>A</button><button on:click={idle}>B</button></main>}';
  assert.equal(compile(source).diagnostics.filter(d=>d.code==='W_UNOBSERVED_EVENT').length,1);
  const unbound='client component C(){event idle(e:EventSnapshot<MouseEvent>){}<p>Static</p>}';
  const result=compile(unbound);assert.equal(result.ok,true);
  assert.equal(result.diagnostics.filter(d=>d.code==='W_UNOBSERVED_EVENT').length,1);
  assert.match(result.diagnostics[0].message,/bound/);
  assert.equal(compile(unbound.replace('{}<p>','{missing=0;}<p>')).ok,false);
  const invalid=compile('client component C(){state n=0;<button>on click idle{n="invalid";}Idle</button>}');
  assert.equal(invalid.ok,false);assert.ok(invalid.diagnostics[0].code.startsWith('E_'));
});

test('preview preserves warnings on successful static output and render failures',()=>{
  const source='client component C(unused:string){state n=0;<button>on click idle{n+=1;}Idle</button>}';
  const preview=compilePreview(source,{props:{unused:'checked'}});
  assert.equal(preview.ok,true);assert.ok(preview.diagnostics.some(d=>d.severity==='warning'));
  assert.deepEqual(preview.preview.modules,[]);
  const failed=compilePreview(source);
  assert.equal(failed.ok,false);assert.equal(failed.stage,'render');
  assert.equal(failed.diagnostics[0].code,'E_PREVIEW_RENDER');
  assert.ok(failed.diagnostics.some(d=>d.severity==='warning'));
});

test('CLI emits human warnings on stderr and structured diagnostics on stdout with exit zero',async()=>{
  const root=await mkdtemp(join(tmpdir(),'isle-warnings-cli-'));
  try {
    const file=join(root,'app.isle');
    await writeFile(file,'client component C(){\n state n=0;\n <button>on click idle{n+=1;}Idle</button>\n}');
    for(const command of ['check','explain','emit','ssr','cost']) {
      const result=spawnSync(process.execPath,['tools/isle.mjs',command,file],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      assert.match(result.stderr,/app\.isle:2:8: warning W_UNOBSERVED_VALUE/);
      assert.match(result.stderr,/W_UNOBSERVED_EVENT/);
      const output=JSON.parse(result.stdout);
      if(command==='check') {assert.equal(output.ok,true);assert.ok(output.diagnostics.every(d=>d.severity==='warning'));}
    }
  } finally {await rm(root,{recursive:true,force:true});}
});

test('Vite reports compile warnings with locations and respects opaque client entries',async()=>{
  const root=await mkdtemp(join(tmpdir(),'isle-warnings-vite-'));
  try {
    const entry=join(root,'app.isle');
    await writeFile(entry,'client component C(){\n state n=0;\n <button>on click idle{n+=1;}Idle</button>\n}');
    await writeFile(join(root,'index.html'),'<html><body><!--isle:ssr--></body></html>');
    await writeFile(join(root,'client.mjs'),"import {boot} from 'virtual:isle-loader';boot();");
    const {isle}=await import('../lib/vite.mjs');
    for(const clientEntry of [undefined,'./client.mjs']) {
      const warnings=[],logger=createLogger('warn');logger.warn=message=>warnings.push(message);
      const result=await build({configFile:false,root,customLogger:logger,logLevel:'warn',plugins:[isle({entry,clientEntry,diagnostics:false,cost:false,mounts:[{component:'C',props:{}}]})],build:{write:false}});
      assert.ok(result.output.some(item=>item.fileName==='index.html'));
      if(clientEntry) assert.deepEqual(warnings,[]);
      else {assert.ok(warnings.some(w=>w.includes('W_UNOBSERVED_EVENT')));assert.ok(warnings.some(w=>w.includes('app.isle:2:8')),warnings.join('\n'));}
    }
  } finally {await rm(root,{recursive:true,force:true});}
});
