import test from 'node:test';
import assert from 'node:assert/strict';
import { planLoading } from '../lib/loading-plan.mjs';

function fixture() {
  const chunks=Object.fromEntries([['runtime',40],['setup',20],['input',10],['other',15],['click',5],['future',99]].map(([id,gzipBytes])=>[id+'.js',{url:'./'+id+'.js',imports:[],dynamicImports:[],gzipBytes}]));
  chunks['input.js'].dynamicImports=['future.js'];
  const ref=(name,event,requires=['runtime'])=>({ref:['./'+name+'.js','run',[]],chunk:name+'.js',kind:'handler',event,requires});
  return {version:1,chunks,references:{runtime:{...ref('runtime'),kind:'runtime',requires:[]},setup:{...ref('setup'),kind:'resource',requires:[]},input:ref('input','input',['runtime','setup']),other:ref('other','change',['runtime','setup']),click:ref('click','click')},loading:{eager:[],preload:[]}};
}

test('auto preloads input closures within a deduplicated gzip budget, leaving clicks and future chunks lazy',()=>{
  const result=planLoading(fixture(),new Map(['input','other','click','setup'].map(id=>[id,'auto'])),{gzipBytes:85});
  assert.deepEqual(result.preload,['input','other']);assert.deepEqual(result.eager,[]);
  assert.equal(result.plan.usedGzipBytes,85);
  assert.equal(result.plan.decisions.find(row=>row.id==='other').additionalGzipBytes,15);
  assert.deepEqual(result.plan.decisions.find(row=>row.id==='setup').initialBy,['input','other']);
  assert.equal(result.plan.decisions.find(row=>row.id==='runtime').reason,'default');
  assert.equal(result.plan.decisions.find(row=>row.id==='click').reason,'interaction');
  assert.ok(result.plan.decisions.every(row=>!row.modules.includes('./future.js')));
});

test('budget and missing size never turn an auto entry into eager evaluation',()=>{
  for(const [budget,reason]of [[69,'budget'],[0,'budget']]){
    const result=planLoading(fixture(),new Map([['input','auto']]),{gzipBytes:budget});
    assert.deepEqual(result.preload,[]);assert.equal(result.plan.decisions.find(row=>row.id==='input').reason,reason);
  }
  const manifest=fixture();delete manifest.chunks['setup.js'].gzipBytes;
  const result=planLoading(manifest,new Map([['input','auto']]),{gzipBytes:1000});
  assert.equal(result.plan.decisions.find(row=>row.id==='input').reason,'unknown-size');
  assert.deepEqual(result.eager,[]);
  const external=fixture();external.chunks['setup.js'].externalImports=['https://cdn.example.test/opaque.mjs'];
  const unknown=planLoading(external,new Map([['input','auto']]),{gzipBytes:1000});
  assert.equal(unknown.plan.decisions.find(row=>row.id==='input').reason,'unknown-size');
});

test('explicit loading is preserved and shared baseline modules cost no automatic bytes',()=>{
  const result=planLoading(fixture(),new Map([['click','eager'],['input','auto']]),{gzipBytes:30});
  assert.deepEqual(result.eager,['click']);assert.deepEqual(result.preload,['input']);
  assert.equal(result.plan.usedGzipBytes,30);
});

test('selection is deterministic and favors lower marginal cost within the same event priority',()=>{
  const manifest=fixture();
  const first=planLoading(manifest,new Map([['other','auto'],['input','auto']]),{gzipBytes:70});
  const second=planLoading(manifest,new Map([['input','auto'],['other','auto']]),{gzipBytes:70});
  assert.deepEqual(first,second);assert.deepEqual(first.preload,['input']);
});

test('missing dependencies and invalid budgets fail before emitting a plan',()=>{
  for(const gzipBytes of [-1,NaN,Infinity,1.5,'100'])assert.throws(()=>planLoading(fixture(),new Map(),{gzipBytes}),/budget/);
  const manifest=fixture();manifest.references.input.requires.push('missing');
  assert.throws(()=>planLoading(manifest,new Map([['input','auto']])),/Unknown code reference/);
});
