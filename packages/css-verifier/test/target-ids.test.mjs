import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLayout} from '../src/index.mjs';
import {createNoShiftContract,createTransitionIR} from '../src/transitions.mjs';
import {verifyNoShift} from '../src/transitions-node.mjs';

const options={name:'Page',css:'*{box-sizing:border-box}.page{display:grid;grid-template-columns:minmax(0,1fr)}.box{height:24px}',viewport:{min:320,max:960,height:{min:240,max:720}}};
const scene=(children)=>analyzeLayout({tag:'main',classes:['page'],children},options);
const node=(changes={})=>({tag:'div',classes:['box'],targets:['action'],...changes});
const contract=createNoShiftContract({name:'Stable',targets:[{name:'action',before:{id:'action',within:'Page'},after:{id:'action',within:'Page'}}]});

test('neutral target IDs bind geometry independently of class names and tree paths',async()=>{
  const before=scene([node()]),after=scene([{tag:'div',classes:['box'],targets:['action'],path:'Page/changed'}]);
  const result=await verifyNoShift(before,after,contract);
  assert.equal(result.status,'verified');
  assert.deepEqual(before.elements.find(row=>row.path==='Page/0').targets,['action']);
});

test('an absent ID is a presence violation and cannot borrow a lookalike box',async()=>{
  const result=await verifyNoShift(scene([node()]),scene([node({targets:[]})]),contract);
  assert.equal(result.status,'violated');
  assert.equal(result.proof.witness.code,'E_NOSHIFT_PRESENCE');
});

test('ambiguous or incomplete target identity stays Unknown',async()=>{
  for(const after of [scene([node(),node()]),scene([node({targetIdentity:'unknown'})])]) {
    const result=await verifyNoShift(scene([node()]),after,contract);
    assert.equal(result.status,'unknown');
  }
});

test('neutral ID metadata cannot change extracted layout geometry',()=>{
  assert.deepEqual(scene([node()]).sizes,scene([node({targets:[]})]).sizes);
  assert.throws(()=>scene([node({targets:[1]})]),TypeError);
  assert.throws(()=>createNoShiftContract({name:'Bad',targets:[{name:'x',before:{id:'x',selector:'.x'},after:'Page'}]}),TypeError);
  const invalid=scene([node()]);invalid.elements[0].targets='action';
  assert.throws(()=>createTransitionIR({before:invalid,after:invalid}),TypeError);
});
