import type {LayoutSummary,LayoutDiagnostic,LayoutAffine} from './layout-contracts.d.ts';
export interface LayoutObligation {
  code:string;box?:string;path?:string;axis?:'inline'|'block';variant?:number;scrollbarProfile?:string;
  domain:string;failure:string;available?:LayoutAffine;required?:LayoutAffine;
}
export interface LayoutModel {
  version:1;component:string;complete:boolean;assumptions:string[];scope:LayoutSummary['scope'];
  diagnostics:LayoutDiagnostic[];obligations:LayoutObligation[];sourceObligations:number;smt2:string;domain:string;
}
export interface LayoutProof {
  version:1;component:string;status:'verified'|'violated'|'unknown';complete:boolean;assumptions:string[];
  solver:{engine:'z3-wasm';version?:string;result:'sat'|'unsat'|'unknown'};diagnostics:LayoutDiagnostic[];
  witness?:{obligationIndex?:number;code:string;box?:string;path?:string;axis?:'inline'|'block';variant?:number;scrollbarProfile?:string;
    viewport:number;viewportExact:string;viewportHeight?:number;viewportHeightExact?:string;available?:number;required?:number;availableExact?:string;requiredExact?:string};
}
export type LayoutSolverAPI=Pick<Awaited<ReturnType<typeof import('z3-solver').init>>,'Context'> & Partial<Pick<Awaited<ReturnType<typeof import('z3-solver').init>>,'getVersionString'>>;
export function createLayoutModel(report:LayoutSummary):LayoutModel;
export function verifyLayoutModel(model:LayoutModel,api:LayoutSolverAPI,options?:{timeoutMs?:number}):Promise<LayoutProof>;
