import {verifyObligationIR,createLayoutIR,createDeclaredObligations} from './layout-contract.mjs';

/** Build-only convenience; browser Workers supply their own Z3 API instead. */
export async function verifyContractObligation(obligation,options) {
  const {init,killThreads}=await import('z3-solver');
  const api=await init();
  try {return await verifyObligationIR(obligation,api,options);}
  finally {await killThreads(api.em);}
}

export async function verifyDeclaredLayouts(report,options) {
  const obligations=createDeclaredObligations(createLayoutIR(report));
  if(!obligations.length) return [];
  const {init,killThreads}=await import('z3-solver');
  const api=await init();
  try {
    const results=[];
    for(const obligation of obligations) results.push(await verifyObligationIR(obligation,api,options));
    return results;
  } finally {await killThreads(api.em);}
}
