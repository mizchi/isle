import type {LayoutSummary} from './layout-contracts.d.ts';
import type {LayoutProof} from './layout-z3.mjs';
export function verifyLayoutReport(report:LayoutSummary,options?:{timeoutMs?:number}):Promise<LayoutProof>;
