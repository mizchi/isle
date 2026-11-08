import type {Expression,ValueType} from './contracts.d.ts';

export interface ValuePhase {name:string;owner:string;phase:'server'|'resume'|'unused'}
export type Dependencies=(expression:Expression,locals?:ReadonlyMap<string,unknown>)=>Set<string>;
export interface PlanState {name:string;type?:string|ValueType;initial:Expression}
export interface ValuePhasePlan {
  fields:{name:string;type:string|ValueType}[];
  states:PlanState[];
  htmlStates:PlanState[];
  values:ValuePhase[];
}
export function createDependencies(derives:ReadonlyMap<string,Expression>):Dependencies;
/** Inputs are semantic reads; initializer edges affect server initialization, not resume storage. */
export function planValuePhases(component:{name:string;props:readonly {name:string;type?:string|ValueType}[];states:readonly PlanState[]},options:{
  dependencies:Dependencies;renderReads:ReadonlySet<string>;resumeReads:ReadonlySet<string>;states?:readonly PlanState[];
}):ValuePhasePlan;
