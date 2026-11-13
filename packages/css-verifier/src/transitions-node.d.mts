import type {LayoutSummary} from './layout-contracts.d.ts';
import type {NoShiftContract,NoShiftProof} from './transitions.mjs';
export function verifyNoShift(before:LayoutSummary,after:LayoutSummary,contract:NoShiftContract,options?:{timeoutMs?:number}):Promise<NoShiftProof>;
