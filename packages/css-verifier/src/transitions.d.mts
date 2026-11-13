import type {LayoutSummary} from './layout-contracts.d.ts';
import type {LayoutIR} from './layout-contract.mjs';
import type {LayoutModel,LayoutProof,LayoutSolverAPI,LayoutObligation} from './layout-z3.mjs';
type Frozen<T>=T extends object ? {readonly [K in keyof T]:Frozen<T[K]>} : T;

export type NoShiftReference=string|{id:string;within?:string};
export interface NoShiftTarget {name:string;before:NoShiftReference;after:NoShiftReference}
export interface NoShiftInput {name:string;targets:readonly NoShiftTarget[]}
/** Exact presence and border-rectangle equality at two modeled endpoints. */
export type NoShiftContract=Frozen<{version:1;kind:'noshift-contract';profile:'noshift/1';name:string;targets:NoShiftTarget[]}>;
export type TransitionIR=Frozen<{
  version:1;kind:'transition';before:LayoutIR;after:LayoutIR;
  complete:boolean;diagnostics:LayoutSummary['diagnostics'];assumptions:string[];
}>;
export type RectangleField='inlineStart'|'blockStart'|'inlineSize'|'blockSize';
export interface TransitionObligationFact extends LayoutObligation {
  target?:string;beforePath?:string;afterPath?:string;field?:RectangleField;
}
export type TransitionObligation=Frozen<{
  version:1;kind:'transition-obligation';contract:NoShiftContract;transition:TransitionIR;
  coverage:LayoutModel;model:Omit<LayoutModel,'obligations'> & {obligations:TransitionObligationFact[]};
}>;
export interface ExactPixels {value:number;exact:string}
export interface NoShiftChange {
  target:string;field:RectangleField;beforePath:string;afterPath:string;
  before:ExactPixels;after:ExactPixels;delta:ExactPixels;
}
export interface NoShiftProof {
  version:1;status:'verified'|'violated'|'unknown';contract:NoShiftContract;
  coverage:LayoutProof;proof:LayoutProof;change?:NoShiftChange;
}
export function createNoShiftContract(input:NoShiftInput):NoShiftContract;
export function createTransitionIR(input:{before:LayoutSummary;after:LayoutSummary}):TransitionIR;
export function createTransitionObligation(contract:NoShiftContract,transition:TransitionIR):TransitionObligation;
export function verifyTransitionObligation(obligation:TransitionObligation,api:LayoutSolverAPI,options?:{timeoutMs?:number}):Promise<NoShiftProof>;
