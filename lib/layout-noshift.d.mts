import type {ProgramIR,ComponentNoShiftTarget,SourceSpan} from './contracts.d.ts';
import type {LayoutSummary,LayoutDiagnostic,LayoutScenarioIdentity} from './layout-contracts.d.ts';
import type {TransitionObligation,NoShiftProof} from './layout-transition.mjs';
import type {LayoutProof,LayoutSolverAPI} from './layout-z3.mjs';
type Frozen<T>=T extends object ? {readonly [K in keyof T]:Frozen<T[K]>} : T;
export interface NoShiftContext {
  component:string;path:string;source:SourceSpan;targets:readonly ComponentNoShiftTarget[];
  from:LayoutScenarioIdentity;to:LayoutScenarioIdentity;
  identities:readonly {target:string;id:string;nodeId:string;keys:readonly {site:string;value:string|number}[]}[];
}
export type NoShiftPlan=Frozen<{
  version:1;kind:'isle-noshift-plan';complete:boolean;coverage:'all-finite-cases';diagnostics:LayoutDiagnostic[];
  checks:(NoShiftContext & {obligation:TransitionObligation})[];
}>;
export interface DeclaredNoShiftProof {
  version:1;status:'verified'|'violated'|'unknown';coverage:'all-finite-cases'|'incomplete';
  comparisons:{planned:number;checked:number};diagnostics:readonly LayoutDiagnostic[];
  checks:readonly (NoShiftContext & NoShiftProof)[];
}
export function hasDeclaredNoShift(ir:ProgramIR,report:LayoutSummary):boolean;
export function createNoShiftPlan(ir:ProgramIR,report:LayoutSummary):NoShiftPlan;
export function verifyNoShiftPlan(plan:NoShiftPlan,api:LayoutSolverAPI,options?:{timeoutMs?:number}):Promise<DeclaredNoShiftProof>;
export function noShiftVerification(verification:LayoutProof,result:DeclaredNoShiftProof):LayoutProof;
