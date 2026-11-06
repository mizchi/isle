import {compile,requireIR} from '../../lib/compiler.mjs';
import {prepareProgram} from '../../lib/codegen.mjs';
import {analyzeLayout} from '@isle/prototype/layout';
import {createLayoutModel,verifyLayoutModel,type LayoutProof} from '@isle/prototype/layout/z3';
import {verifyLayoutReport} from '@isle/prototype/layout/z3/node';
import {init,killThreads} from 'z3-solver';
const ir=requireIR(compile('component C(){<main><style>main{display:grid}</style></main>}'));
const rendered=prepareProgram(ir).render('C',{});
const css:string|undefined=rendered.styles?.[0].css;
const scope:string|undefined=ir.components[0].style?.scope;
const report=analyzeLayout(ir,{css:'',viewport:{min:160,max:640}});
const api=await init();
const proof:LayoutProof=await verifyLayoutModel(createLayoutModel(report),api,{timeoutMs:1000});
await killThreads(api.em);await verifyLayoutReport(report);
const status:'verified'|'violated'|'unknown'=proof.status;
// @ts-expect-error A proof status is not a boolean success flag.
const success:boolean=proof.status;
void css;void scope;void status;void success;
