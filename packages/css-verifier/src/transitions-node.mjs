import {createTransitionIR,createTransitionObligation,verifyTransitionObligation} from './transitions.mjs';

/** Build-only helper; Workers call the pure verifier with their own Z3 API. */
export async function verifyNoShift(before,after,contract,options) {
  const obligation=createTransitionObligation(contract,createTransitionIR({before,after}));
  const {init,killThreads}=await import('z3-solver');
  const api=await init();
  try {return await verifyTransitionObligation(obligation,api,options);}
  finally {await killThreads(api.em);}
}
