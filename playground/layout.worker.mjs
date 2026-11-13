import {init} from 'z3-solver/build/browser.js';
import {analyzeLayout} from '../lib/layout.mjs';
import {createLayoutModel,verifyLayoutModel} from '../lib/layout-z3.mjs';
import {createLayoutIR,createDeclaredObligations,verifyObligationIR} from '../lib/layout-contract.mjs';
import {declaredLayoutOptions} from '../lib/layout-declarations.mjs';
import {hasDeclaredNoShift,createNoShiftPlan,verifyNoShiftPlan,noShiftVerification} from '../lib/layout-noshift.mjs';

let initialized,pending,running=false;
const api=()=>initialized ??= (async()=>{
  if(!self.crossOriginIsolated || typeof SharedArrayBuffer==='undefined') throw new Error('Z3 Wasm requires cross-origin isolation.');
  const script=new URL('z3-built.js',self.location.href).href;
  importScripts(script);
  return init({locateFile:file=>new URL(file,script).href,mainScriptUrlOrBlob:script});
})().catch(error=>{initialized=undefined;throw error;});
self.onmessage=({data})=>{pending=data;drain();};
async function drain() {
  if(running) return;running=true;
  try {while(pending) {
    const {id,ir,options}=pending;pending=undefined;
    try {
      self.postMessage({id,progress:'Loading Z3 Wasm…'});
      const solver=await api();
      const report=analyzeLayout(ir,declaredLayoutOptions(ir,options)),model=createLayoutModel(report);
      self.postMessage({id,progress:`Checking ${model.obligations.length} layout obligations…`});
      let verification=await verifyLayoutModel(model,solver);
      const declarations=[],scripts=[`; CSS implementation\n${model.smt2}\n(check-sat)\n`];
      for(const obligation of report.layoutBindings?.length ? createDeclaredObligations(createLayoutIR(report)) : []) {
        const proof=await verifyObligationIR(obligation,solver);declarations.push(proof);
        for(const [phase,m] of [['coverage',obligation.coverage],['conformance',obligation.model]]) scripts.push(`; Declared ${proof.contract.component} at ${proof.instance.path}: ${phase}\n${m.smt2}\n(check-sat)\n`);
      }
      const failed=declarations.find(p=>p.status==='unknown') ?? declarations.find(p=>p.status==='violated');
      if(failed && (verification.status==='verified' || failed.status==='unknown')) verification=failed.proof;
      let noshift;
      if(hasDeclaredNoShift(ir,report)) {
        const plan=createNoShiftPlan(ir,report);
        self.postMessage({id,progress:`Checking ${plan.checks.length} noshift comparisons…`});
        noshift=await verifyNoShiftPlan(plan,solver);verification=noShiftVerification(verification,noshift);
        for(const check of plan.checks) for(const [phase,m] of [['coverage',check.obligation.coverage],['equality',check.obligation.model]]) scripts.push(`; Noshift ${check.component} at ${check.path}: ${phase}\n${m.smt2}\n(check-sat)\n`);
      }
      self.postMessage({id,result:{report,model,verification,...(noshift ? {noshift} : {}),...(declarations.length || noshift ? {declarations,constraints:scripts.join('\n(reset)\n')} : {})}});
    } catch(error) {self.postMessage({id,error:String(error.message)});}
  }} finally {running=false;}
}
