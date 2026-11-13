// Pure SMT adapter. Callers supply a Z3 API initialized in Node or a browser
// Worker; neither Wasm nor Z3 is imported by compiled application modules.
import {add,mul,number,exact} from './layout/linear.mjs';
import {rational,affine,and,or,interval,region} from './layout/smt.mjs';

/** ∃ viewport, reachable structure, platform, obligation: required > available. */
export function createLayoutModel(report) {
  if(report?.version!==1 || !['verified','violated','unknown'].includes(report.status) || !Array.isArray(report.checks)) throw new TypeError('Invalid layout report');
  const terms=interval(report.scope.viewport,'width');
  terms.push(...(report.scope.viewport.height ? interval(report.scope.viewport.height,'height') : ['(= height 0)']));
  const obligations=[],unique=new Set();let sourceObligations=0;
  const append=obligation=>{
    sourceObligations++;
    const key=obligation.domain+'\0'+obligation.failure;
    if(!unique.has(key)) {unique.add(key);obligations.push(obligation);}
  };
  for(const check of report.checks) if(check.enforced) {
    const failure=`(> ${affine(check.required)} ${affine(check.available)})`;
    append({...check,domain:region(check),failure});
  }
  // Discrete policies (float, grid-only, wrapping, overflow) are obligations too.
  // Integrity findings (`rule`) are not checks: Z3 confirms their failing region is non-empty.
  for(const diagnostic of report.diagnostics) if(diagnostic.severity==='error' && (!diagnostic.witness || diagnostic.rule)) append({...diagnostic,domain:diagnostic.range ? region(diagnostic) : and(terms),failure:'true'});
  if(obligations.length>8192) throw new RangeError('Z3 layout obligation limit exceeded');
  const prelude=`(set-logic QF_LRA)\n(declare-const width Real)\n(declare-const height Real)\n(declare-const layout_case Real)\n(assert ${and(terms)})\n`;
  const cases=obligations.map((o,i)=>`(and (= layout_case ${i}) ${o.domain} ${o.failure})`);
  const smt2=prelude+`(assert ${or(cases)})\n`;
  if(smt2.length>2_000_000) throw new RangeError('Z3 layout model size limit exceeded');
  return {version:1,component:report.component,sourceObligations,complete:report.status!=='unknown',assumptions:[...report.assumptions],scope:report.scope,
    diagnostics:report.diagnostics.filter(d=>d.severity==='unknown'),obligations,smt2,domain:prelude};
}

/** SAT supplies a witness; UNSAT only verifies a complete, nonempty model. */
const queues=new WeakMap();
export async function verifyLayoutModel(model,api,options) {
  const key=api?.Context;
  if(typeof key!=='function') return verifyOneModel(model,api,options);
  const job=(queues.get(key) ?? Promise.resolve()).catch(()=>{}).then(()=>verifyOneModel(model,api,options));
  queues.set(key,job);
  try {return await job;} finally {if(queues.get(key)===job) queues.delete(key);}
}
async function verifyOneModel(model,api,{timeoutMs=5000}={}) {
  if(model?.version!==1 || !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>30000) throw new TypeError('Invalid Z3 layout verification options');
  let solver,domain,version;
  const identity=result=>({engine:'z3-wasm',...(version ? {version} : {}),result});
  const unknown=(message,result='unknown')=>({version:1,component:model.component,status:'unknown',complete:model.complete,assumptions:model.assumptions,
    solver:identity(result),diagnostics:[...model.diagnostics,{code:'U_LAYOUT_SOLVER',severity:'unknown',message}]});
  try {
    version=api.getVersionString?.();
    const context=new api.Context('css_layout');
    domain=new context.Solver();domain.set('timeout',timeoutMs);domain.fromString(model.domain);
    const feasible=await domain.check();
    if(feasible!=='sat') return unknown(`Viewport domain is ${feasible}; no non-vacuous verification is possible`,feasible);
    solver=new context.Solver();solver.set('timeout',timeoutMs);solver.fromString(model.smt2);
    const result=await solver.check();
    if(result==='unknown') return unknown(solver.reasonUnknown());
    const base={version:1,component:model.component,complete:model.complete,assumptions:model.assumptions,solver:identity(result),diagnostics:[...model.diagnostics]};
    if(result==='unsat') return {...base,status:model.complete ? 'verified' : 'unknown'};
    const values=solver.model();
    try {
      const read=name=>values.eval(context.Real.const(name),true).value();
      const convert=value=>({n:value.numerator,d:value.denominator});
      const w=convert(read('width')),h=convert(read('height')),index=read('layout_case');
      if(index.denominator!==1n || !model.obligations[Number(index.numerator)]) return unknown('Invalid counterexample selector','sat');
      const obligation=model.obligations[Number(index.numerator)];
      const evaluate=expr=>add(add(mul(rational(expr.coefficient),w),mul(rational(expr.heightCoefficient ?? '0'),h)),rational(expr.constant));
      return {...base,status:model.complete ? 'violated' : 'unknown',witness:{obligationIndex:Number(index.numerator),code:obligation.code,box:obligation.box,path:obligation.path,axis:obligation.axis,
        ...(obligation.variant!==undefined ? {variant:obligation.variant} : {}),...(obligation.scrollbarProfile ? {scrollbarProfile:obligation.scrollbarProfile} : {}),
        viewport:number(w),viewportExact:exact(w),...(model.scope.axis==='both' ? {viewportHeight:number(h),viewportHeightExact:exact(h)} : {}),
        ...(obligation.available ? {available:number(evaluate(obligation.available)),availableExact:exact(evaluate(obligation.available)),required:number(evaluate(obligation.required)),requiredExact:exact(evaluate(obligation.required))} : {}),
      }};
    } finally {values.release();}
  } catch(error) {return unknown(error.message);}
  finally {solver?.release();domain?.release();}
}
