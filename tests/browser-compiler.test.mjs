import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {readFile} from 'node:fs/promises';
import {compile as nodeCompile,explain as nodeExplain} from '../lib/compiler.mjs';

test('portable SHA-256 preserves existing schema fingerprints for UTF-8 and padding boundaries',async()=>{
  const {sha256}=await import('../lib/sha256.mjs');
  for(const source of ['', 'abc', '日本語🌊', '\ud800', ...[55,56,63,64,65,127,128,1024,65536].map(n=>'x'.repeat(n))]) {
    assert.equal(sha256(source),createHash('sha256').update(source).digest('hex'));
  }
});

test('browser compiler shares every frontend pass and explanation with the Node API',async()=>{
  const browser=await import('../lib/compiler-browser.mjs');
  for(const source of [
    'client component Counter(){state n=0;<button>on click {n+=1;}{n}</button>}',
    'client component List(){state xs=[0];<main>on click {xs=xs.concat([xs.length]);}<For each={xs}>{(x) => <Fragment key={x}><p>{x}</p></Fragment>}</For></main>}',
    'component Bad(){<main>{missing}</main>}',
    'component List(xs:number[]){<main><Show when={xs.length>0} fallback={<p>Empty</p>}><For each={xs}>{(x)=><Fragment key={x}><p>{x}</p><p>Detail</p></Fragment>}</For></Show></main>}',
  ]) {
    assert.deepEqual(browser.compile(source),nodeCompile(source));
    const compiled=nodeCompile(source);
    if(compiled.ok) assert.deepEqual(browser.explain(compiled.ir),nodeExplain(compiled.ir));
  }
  assert.equal(browser.compileFile,undefined,'file I/O is absent from the browser API');
});

test('preview compilation generates real resume modules and SSR emits no dynamic payload',async()=>{
  const {compilePreview}=await import('../lib/compiler-browser.mjs');
  const source='client component Counter(){state n=0;<button>on click {n+=1;}{n}</button>}';
  const result=compilePreview(source);
  assert.equal(result.ok,true);
  assert.match(result.preview.html,/data-isle-root/);
  assert.match(result.preview.snapshotHtml,/data-isle-snapshot/);
  assert.equal(result.preview.modules.length,1);
  assert.match(result.preview.modules[0].code,/export function run/);
  const ssr=compilePreview(source,{mode:'ssr'});
  assert.equal(ssr.ok,true);
  assert.equal(ssr.preview.snapshotHtml,'');
  assert.deepEqual(ssr.preview.modules,[]);
  assert.doesNotMatch(ssr.preview.html,/data-isle-/);
});

test('preview compilation reports parse errors and invalid mount props without evaluating handler code',async()=>{
  const {compilePreview}=await import('../lib/compiler-browser.mjs');
  assert.equal(compilePreview('component {').stage,'compile');
  const invalid=compilePreview('component Greeting(name:string){<h1>{name}</h1>}');
  assert.equal(invalid.ok,false);assert.equal(invalid.stage,'render');
  assert.equal(compilePreview('component Greeting(name:string){<h1>{name}</h1>}',{props:{name:'Hello'}}).ok,true);
});

test('browser compiler bundles without Node builtins, Buffer or a server compiler endpoint',async()=>{
  const result=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:new URL('../lib/compiler-browser.mjs',import.meta.url).pathname,formats:['es']}}});
  for(const output of (Array.isArray(result) ? result : [result]).flatMap(result=>result.output).filter(item=>item.type==='chunk')) {
    assert.ok(!Object.keys(output.modules).some(id=>id.startsWith('node:') || id.includes('__vite-browser-external')));
    assert.doesNotMatch(output.code,/\bBuffer\b|node:fs|node:crypto/);
  }
});

test('preview limits and server-host requirements fail with explicit diagnostics',async()=>{
  const {compilePreview}=await import('../lib/compiler-browser.mjs');
  assert.equal(compilePreview('x'.repeat(131073)).diagnostics[0].code,'E_PREVIEW_LIMIT');
  assert.throws(()=>compilePreview('',{mode:'hydrate'}),TypeError);
  const source=await readFile(new URL('../examples/counter/app.isle',import.meta.url),'utf8');
  const result=compilePreview(source,{component:'Counter',props:{initial:0}});
  assert.equal(result.stage,'render');assert.equal(result.diagnostics[0].code,'E_PREVIEW_HOST');
});
