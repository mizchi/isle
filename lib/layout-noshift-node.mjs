import {createNoShiftPlan,verifyNoShiftPlan} from './layout-noshift.mjs';

export async function verifyDeclaredNoShift(ir,report,options) {
  const plan=createNoShiftPlan(ir,report);
  if(!plan.complete || !plan.checks.length) return verifyNoShiftPlan(plan,undefined,options);
  const {init,killThreads}=await import('z3-solver');
  const api=await init();
  try {return await verifyNoShiftPlan(plan,api,options);}
  finally {await killThreads(api.em);}
}
