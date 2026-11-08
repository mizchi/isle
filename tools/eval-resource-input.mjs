import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import {validValue} from '../runtime/value.mjs';
import {createResourceInput} from '../runtime/resource-input.mjs';

const type={record:{places:{array:{record:{id:'string',name:'string',category:'string',x:'number',y:'number',rating:'number',address:'string',description:'string'}}},selection:'string'}};
const iterations=100,repeats=5,warmup=10;
const median=values=>values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
const baseline=(type,input)=>{if(!validValue(type,input))throw Error('Invalid input');return structuredClone(input);};
function data(count,mode){
 const rows=Array.from({length:count},(_,i)=>({id:`place-${i}`,name:`Place ${i}`,category:'cafe',x:i,y:i,rating:4.5,address:'Harbor',description:'A local place.'}));
 if(mode==='deep-frozen')rows.forEach(Object.freeze);
 return mode==='mutable'?rows:Object.freeze(rows);
}
const results=[];
for(const rows of [36,1000])for(const mode of ['mutable','shallow-frozen','deep-frozen']){
 const places=data(rows,mode),samples={baseline:[],sharing:[]},cold={baseline:[],sharing:[]};
 for(let repeat=0;repeat<repeats;repeat++){
  const copies={baseline,sharing:createResourceInput()},last={},before={},elapsed={baseline:0,sharing:0};
  const order=i=>i%2?['sharing','baseline']:['baseline','sharing'];
  for(const name of order(repeat)){const start=performance.now();copies[name](type,{places,selection:'first'});cold[name].push(performance.now()-start);}
  for(let i=0;i<warmup;i++)for(const name of order(i))copies[name](type,{places,selection:String(i)});
  for(const name of order(repeat))before[name]=copies[name](type,{places,selection:'before'});
  for(let i=0;i<iterations;i++)for(const name of order(i)){
   const start=performance.now();last[name]=copies[name](type,{places,selection:String(i)});elapsed[name]+=performance.now()-start;
  }
  for(const name of order(repeat)){
   samples[name].push(elapsed[name]/iterations);
   assert.equal(last[name].selection,String(iterations-1));assert.deepEqual(last[name].places,places);
   assert.equal(last[name].places===before[name].places,name==='sharing'&&mode==='deep-frozen');
  }
 }
 results.push({rows,mode,baselineMedianMs:median(samples.baseline),sharingMedianMs:median(samples.sharing),baselineColdMedianMs:median(cold.baseline),sharingColdMedianMs:median(cold.sharing),samples,coldSamples:cold});
}
// Count only JS cache-table constructors, not total heap bytes or GC activity.
const cacheTables=[];
for(const rows of [36,1000]){
 const places=data(rows,'deep-frozen'),NativeMap=globalThis.Map,NativeWeakMap=globalThis.WeakMap,counts={map:0,weakMap:0};
 try{
  globalThis.Map=class extends NativeMap{constructor(...args){super(...args);counts.map++;}};
  globalThis.WeakMap=class extends NativeWeakMap{constructor(...args){super(...args);counts.weakMap++;}};
  const copy=createResourceInput();copy(type,{places,selection:'first'});const first={...counts};
  copy(type,{places,selection:'second'});cacheTables.push({rows,first,repeated:{map:counts.map-first.map,weakMap:counts.weakMap-first.weakMap}});
 }finally{globalThis.Map=NativeMap;globalThis.WeakMap=NativeWeakMap;}
}
const report={version:1,generatedAt:new Date().toISOString(),conditions:{node:process.version,platform:process.platform,arch:process.arch,iterations,repeats,warmup,
 interpretation:'Local validation/copy microbenchmark; cold means a fresh sharing cache, not a cold JS engine. Warm timings follow warmup; strategies alternate within every measured pair; source creation/freezing excluded. Both strategies receive complete messages. Not browser frame or framework speed.'},results,cacheTables};
await mkdir('evals/results/async-map',{recursive:true});await writeFile('evals/results/async-map/input-sharing.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(results.map(({samples,coldSamples,...result})=>result),null,2));
