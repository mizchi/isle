import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile,requireIR} from '@isle/prototype/compiler';
import {analyzeLayout} from '@isle/prototype/layout';
import {createContractIR,createLayoutIR,createObligationIR} from '@isle/prototype/layout/contracts';
import {verifyContractObligation} from '@isle/prototype/layout/contracts/node';

const source=await readFile(new URL('./contract.isle',import.meta.url),'utf8');
const contract=(min,blockMin=40,component='Four')=>createContractIR({component,requires:{inlineSize:{min,max:640},blockSize:{min:blockMin,max:640}}});
const cases=[
  {name:'four',source,contract:contract(160),expected:'verified'},
  {name:'gap',source:source.replace('display: grid;','display: grid; column-gap: 8px;'),contract:contract(160),expected:'violated'},
  {name:'responsive',source:source.replace('</style>','@media (width < 160px) { .row { grid-template-columns: repeat(2, minmax(0, 1fr)); } }</style>'),contract:contract(80,80),expected:'verified'},
  {name:'child-requires',source,contract:contract(160),children:Array.from({length:4},(_,i)=>({path:`Four/${i}`,contract:contract(48,40,'Cell')})),expected:'violated'},
];
const results=[];
for(const scenario of cases) {
  const report=analyzeLayout(requireIR(compile(scenario.source)),{css:'',viewport:{min:80,max:640,height:{min:40,max:640}}});
  const implementation=createLayoutIR(report),obligation=createObligationIR(scenario.contract,implementation,{children:scenario.children});
  const result=await verifyContractObligation(obligation);
  assert.equal(result.status,scenario.expected,JSON.stringify(result));
  results.push({name:scenario.name,status:result.status,coverage:result.coverage.status,solver:result.proof.solver,...(result.proof.witness ? {witness:result.proof.witness} : {})});
}
console.log(JSON.stringify({passed:true,cases:results},null,2));
