import {analyzeLayout,type BoxTree,type LayoutOptions} from '../../packages/css-verifier/src/index.mjs';
import {analyzeHTML} from '../../packages/css-verifier/src/html.mjs';
import {verifyLayoutReport} from '../../packages/css-verifier/src/layout-z3-node.mjs';
import {createNoShiftContract,createTransitionIR,createTransitionObligation,verifyTransitionObligation,type NoShiftProof} from '../../packages/css-verifier/src/transitions.mjs';
import {verifyNoShift} from '../../packages/css-verifier/src/transitions-node.mjs';

const tree={tag:'main',classes:['grid'],children:[{tag:'div'}]} as const satisfies BoxTree;
const options={name:'Document',css:'*{box-sizing:border-box}',viewport:{min:320,max:1280}} satisfies LayoutOptions;
const report=analyzeLayout(tree,options);
void verifyLayoutReport(report);
analyzeHTML('<main></main>',options);
// @ts-expect-error Framework props belong to adapters, never the verification core.
analyzeLayout(tree,{...options,props:{}});
// @ts-expect-error DOM rendering attributes need an adapter, not silent omission.
analyzeLayout({tag:'div',style:'width:1px'},options);

const contract=createNoShiftContract({name:'Load',targets:[{name:'message',before:'Document/0',after:'Document/0'}]});
createNoShiftContract({name:'Named',targets:[{name:'message',before:{id:'message',within:'Document'},after:{id:'message',within:'Document'}}]});
analyzeLayout({tag:'div',targets:['message'],targetIdentity:'stable'},options);
// @ts-expect-error Target identity metadata has a closed grammar.
analyzeLayout({tag:'div',targets:[123]},options);
const transition=createTransitionIR({before:report,after:report});
const obligation=createTransitionObligation(contract,transition);
const proof:Promise<NoShiftProof>=verifyNoShift(report,report,contract);
void proof;
void verifyTransitionObligation;
void obligation;
// @ts-expect-error The first profile is exact equality; no undocumented tolerance.
createNoShiftContract({name:'Loose',targets:[],tolerance:1});
// @ts-expect-error Geometry facts must not become contract predicates.
transition.before.boxes.push({});
