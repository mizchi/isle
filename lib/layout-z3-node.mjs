import {createLayoutModel,verifyLayoutModel} from './layout-z3.mjs';

/** Ephemeral solver owns and tears down its Wasm threads, including failures. */
export async function verifyLayoutReport(report,options) {
  const {init,killThreads}=await import('z3-solver');
  const api=await init();
  try {return await verifyLayoutModel(createLayoutModel(report),api,options);}
  finally {await killThreads(api.em);}
}
