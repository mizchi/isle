import '../packages/css-verifier/test/transitions.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '@isle/prototype/layout';
import {createNoShiftContract} from '@isle/prototype/layout/transitions';
import {verifyNoShift} from '@isle/prototype/layout/transitions/node';

test('Isle supplies concrete prop-dependent endpoints to the independent transition verifier',async()=>{
  const ir=requireIR(compile(`component Page(expanded:boolean){
    <main class="page"><div class={expanded ? "large" : "small"}></div><div class="action"></div></main>
  }`));
  const options={component:'Page',viewport:{min:320,max:960,height:{min:240,max:720}},
    css:'*{box-sizing:border-box}.page{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.small{height:24px}.large{height:80px}.action{height:32px}'};
  const before=analyzeLayout(ir,{...options,props:{expanded:false}}),after=analyzeLayout(ir,{...options,props:{expanded:true}});
  const contract=createNoShiftContract({name:'Expand',targets:[{name:'action',before:'Page/1',after:'Page/1'}]});
  const result=await verifyNoShift(before,after,contract);
  assert.equal(result.status,'violated');
  assert.equal(result.change.delta.exact,'56');
});
