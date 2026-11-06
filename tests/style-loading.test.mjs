import test from 'node:test';
import assert from 'node:assert/strict';
import { planCodeLoad,eagerLoad } from '../runtime/manifest.mjs';
import { loadingTags } from '../lib/code-manifest.mjs';
import { planLoading } from '../lib/loading-plan.mjs';

const fixture=()=>({version:1,references:{setup:{ref:['./setup.js','setup',[]],chunk:'setup.js',kind:'resource',schemaId:'schema',requires:[]},edit:{ref:['./edit.js','run',[]],chunk:'edit.js',kind:'handler',event:'input',requires:['setup']},future:{ref:['./future.js','run',[]],chunk:'future.js',kind:'handler',event:'click',requires:[]}},
  chunks:{'setup.js':{url:'./setup.js',imports:[],dynamicImports:[],styles:['base.css'],gzipBytes:20},'edit.js':{url:'./edit.js',imports:[],dynamicImports:['future.js'],styles:['base.css','edit.css'],gzipBytes:10},'future.js':{url:'./future.js',imports:[],dynamicImports:[],styles:['future.css'],gzipBytes:10}},
  styles:Object.fromEntries(['base','edit','future'].map(name=>[name+'.css',{url:'./'+name+'.css',gzipBytes:5}])),loading:{eager:[],preload:[]}});

test('a code closure includes deduplicated CSS assets, leaving dynamic descendants lazy',()=>{
  const plan=planCodeLoad(fixture(),['edit']);
  assert.deepEqual(plan.styles,['./base.css','./edit.css']);
  assert.ok(!plan.modules.includes('./future.js'));
  const invalid=fixture();delete invalid.styles['edit.css'];
  assert.throws(()=>planCodeLoad(invalid,['edit']),/style/);
});

test('CSS belongs to the automatic gzip budget as well as its JS dependencies',()=>{
  const selected=planLoading(fixture(),new Map([['edit','auto']]),{gzipBytes:40});
  assert.deepEqual(selected.preload,['edit']);assert.equal(selected.plan.usedGzipBytes,40);
  const rejected=planLoading(fixture(),new Map([['edit','auto']]),{gzipBytes:39});
  assert.deepEqual(rejected.preload,[]);
});

test('CSS fetch hints never apply styles and inert stylesheet metadata gates activation',()=>{
  const manifest=fixture();manifest.loading.preload=['edit'];
  const tags=loadingTags(manifest,'nonce');
  const hints=tags.filter(tag=>tag.tag==='link'&&tag.attrs.as==='style');
  assert.deepEqual(hints.map(tag=>tag.attrs.href),['./base.css','./edit.css']);
  assert.ok(hints.every(tag=>tag.attrs.rel==='preload'));
  assert.ok(!tags.some(tag=>tag.tag==='link'&&tag.attrs.rel==='stylesheet'));
  const styles=tags.find(tag=>tag.attrs?.['data-isle-styles']==='1');
  assert.ok(styles.children.every(tag=>tag.attrs.rel==='stylesheet'&&tag.attrs.nonce==='nonce'));
  assert.ok(styles.children.find(tag=>tag.attrs.href==='./base.css').attrs['data-isle-code'].includes('@schema'));
});

test('portable eager loading refuses missing CSS adapters and waits before evaluating modules',async()=>{
  const manifest=fixture(),events=[];
  await assert.rejects(eagerLoad(manifest,{baseURL:'https://example.test/',ids:['edit'],importModule:async()=>{throw Error('unexpected import');}}),/style/i);
  await eagerLoad(manifest,{baseURL:'https://example.test/',ids:['edit'],loadStyle:async url=>{events.push(url);},importModule:async url=>{assert.equal(events.length>=2,true);return{setup(){},run(){}};}});
  assert.ok(events.includes('https://example.test/base.css'));
});

test('explicit eager uses active CSS and retains an eager gate for ShadowRoot adapters',()=>{
  const manifest=fixture();manifest.loading.eager=['edit'];
  const tags=loadingTags(manifest);
  assert.equal(tags.filter(tag=>tag.tag==='link'&&tag.attrs['data-isle-eager-style']!==undefined).length,2);
  const template=tags.find(tag=>tag.attrs?.['data-isle-styles']==='1');
  assert.ok(template.children.filter(tag=>tag.attrs.href!=='./future.css').every(tag=>tag.attrs['data-isle-code'].includes('@eager')));
});
