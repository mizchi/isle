import test from 'node:test';
import assert from 'node:assert/strict';
import {validValue} from '../runtime/value.mjs';
import {createResourceInput} from '../runtime/resource-input.mjs';

test('frozen copies are memoized by both original identity and the compiled type',()=>{
 const snapshot=createResourceInput(),a={record:{label:'string'}},b={record:{label:'boolean'}},value=Object.freeze({label:'text'});
 const copy=snapshot(a,value);assert.notEqual(copy,value);assert.equal(snapshot(a,value),copy);
 assert.throws(()=>snapshot(b,value),/input/);assert.equal(snapshot(a,value),copy);
 const compatible={record:{label:'string'}};assert.deepEqual(snapshot(compatible,value),copy);assert.equal(snapshot(a,value),copy);
});
test('mutable arrays retain native copies; deeply frozen rows share without changing JSON property order',()=>{
 const snapshot=createResourceInput(),child=Object.freeze({name:'A',id:'a'}),type={array:{record:{id:'string',name:'string'}}},input=[child];
 const first=snapshot(type,input),second=snapshot(type,input);
 assert.notEqual(first,second);assert.notEqual(first[0],second[0]);assert.notEqual(first[0],child);
 assert.equal(JSON.stringify(first),'[{"name":"A","id":"a"}]');assert.equal(Object.isFrozen(second),false);
 input.push(Object.freeze({id:'b',name:'B'}));const next=snapshot(type,input);assert.equal(next.length,2);assert.equal(first.length,1);assert.deepEqual(next[0],first[0]);
 const frozen=snapshot(type,Object.freeze([...input])),other=snapshot(type,Object.freeze([...input]));assert.equal(frozen[0],other[0]);assert.equal(Object.isFrozen(frozen),true);
});
test('closed snapshots reject accessors, hidden/symbol extras, sparse arrays and invalid numbers',()=>{
 const snapshot=createResourceInput(),type={record:{n:'number'}},badArray=Object.assign(['a'],{extra:true});
 let reads=0;const getter=Object.freeze({get n(){reads++;return 1;}});
 for(const value of [getter,{n:NaN},{n:-0},Object.assign({n:1},{[Symbol()]:2}),Object.defineProperty({n:1},'extra',{value:2}),new Date(),Object.create({n:1})])assert.throws(()=>snapshot(type,value),/input/);
 assert.equal(reads,0);
 for(const value of [Array(1),badArray,Object.defineProperty(['a'],'0',{get(){reads++;return 'a';}})])assert.throws(()=>snapshot({array:'string'},value),/input/);
 assert.equal(reads,0);
});

test('nested closed values agree with the previous validator/copy boundary under mixed freezing',()=>{
 let seed=71;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const shape=depth=>depth&&next()%2?next()%2?{array:shape(depth-1)}:{record:{right:shape(depth-1),left:shape(depth-1)}}:['number','string','boolean'][next()%3];
 const value=type=>{
  if(typeof type==='string')return type==='number'?next()/100:type==='boolean'?!!(next()%2):`value ${next()}`;
  const result=type.array?Array.from({length:next()%4},()=>value(type.array)):Object.fromEntries(Object.entries(type.record).toReversed().map(([key,type])=>[key,value(type)]));
  return next()%2?Object.freeze(result):result;
 };
 const snapshot=createResourceInput();
 for(let i=0;i<100;i++){
  const type=shape(4),input=value(type),expected=structuredClone(input);
  assert.equal(validValue(type,input),true);assert.deepEqual(snapshot(type,input),expected);assert.deepEqual(snapshot(type,input),expected);assert.equal(JSON.stringify(snapshot(type,input)),JSON.stringify(expected));
 }
});
