import type {LayoutAffine,LayoutRange,LayoutSummary,LayoutScenarioIdentity} from './layout-contracts.d.ts';
import type {LayoutModel,LayoutProof,LayoutSolverAPI} from './layout-z3.mjs';
type Frozen<T> = T extends object ? {readonly [K in keyof T]:Frozen<T[K]>} : T;
export const SafeGrid: {
  readonly id:'safe-grid/1';readonly containers:'grid';readonly positioning:'in-flow';
  readonly boxSizing:'border-box';readonly geometry:'piecewise-affine';readonly overflowPolicies:readonly ['fit'];
};
export interface ContractInput {
  component:string;profile?:typeof SafeGrid.id;
  /** Closed ranges for parent-allocated CSS px, not CSS declarations or viewport ranges. */
  requires:{inlineSize:{min:number;max:number};blockSize:{min:number;max:number}};
  ensures?:{inline:'fit';block:'fit'};
}
export type ContractIR=Frozen<{
  version:1;kind:'contract';component:string;profile:typeof SafeGrid;
  requires:{inlineSize:LayoutRange;blockSize:LayoutRange};ensures:{inline:'fit';block:'fit'};
}>;
export type LayoutIRBox=Frozen<LayoutScenarioIdentity & {
  box:string;path:string;range:LayoutRange;heightRange?:LayoutRange;region?:LayoutSummary['sizes'][number]['region'];
  boxSizing:'border-box'|'content-box';
  allocated:{inline:LayoutAffine;block?:LayoutAffine};
  border:{inline:LayoutAffine;block?:LayoutAffine};
  content:{inline:LayoutAffine;block?:LayoutAffine};
}>;
/** Trusted CSS extraction, constructed without a ContractIR; not a browser semantics proof. */
export type LayoutIR=Frozen<{
  version:1;kind:'layout';component:string;scope:LayoutSummary['scope'];cases:LayoutScenarioIdentity[];
  boxes:LayoutIRBox[];presence:LayoutSummary['policies'];checks:LayoutSummary['checks'];
  errors:LayoutSummary['diagnostics'];diagnostics:LayoutSummary['diagnostics'];complete:boolean;assumptions:string[];
  bindings:NonNullable<LayoutSummary['layoutBindings']>;
}>;
/** Explicit native box path binding; v1 does not replace child bodies with summaries. */
export interface ChildLayoutBinding {readonly path:string;readonly contract:ContractIR}
export type ObligationIR=Frozen<{
  version:1;kind:'obligation';contract:ContractIR;model:LayoutModel;
} & (
  {operation:'conformance';implementation:LayoutIR;children:ChildLayoutBinding[];coverage:LayoutModel;instance?:{path:string}} |
  {operation:'refinement';previous:ContractIR}
)>;
export interface ContractProof {
  version:1;status:'verified'|'violated'|'unknown';operation:ObligationIR['operation'];contract:ContractIR;
  /** Coverage must verify before conformance is attempted. */
  coverage?:LayoutProof;proof:LayoutProof;
  instance?:{readonly path:string};
}
export function createContractIR(input:ContractInput):ContractIR;
export function createLayoutIR(report:LayoutSummary):LayoutIR;
export function createObligationIR(contract:ContractIR,implementation:LayoutIR,options?:{children?:readonly ChildLayoutBinding[]}):ObligationIR;
/** Instance checking uses actual deployment inputs, and checks Requires as a guarantee of the parent allocation. */
export function createInstanceObligationIR(contract:ContractIR,implementation:LayoutIR,options:{path:string;cases?:readonly LayoutScenarioIdentity[]}):ObligationIR;
export function createDeclaredObligations(implementation:LayoutIR):readonly ObligationIR[];
/** v1 supports identical SafeGrid/Fit guarantees; checks contravariance of input ranges. */
export function createRefinementObligationIR(previous:ContractIR,next:ContractIR):ObligationIR;
export function verifyObligationIR(obligation:ObligationIR,api:LayoutSolverAPI,options?:{timeoutMs?:number}):Promise<ContractProof>;
