import {verifyObligationIR} from './layout-contract.mjs';

/** Build-only convenience; browser Workers supply their own Z3 API instead. */
export async function verifyContractObligation(obligation,options) {
  const {init,killThreads}=await import('z3-solver');
  const api=await init();
  try {return await verifyObligationIR(obligation,api,options);}
  finally {await killThreads(api.em);}
}
