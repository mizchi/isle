import type {ProgramIR} from './contracts.d.ts';
import type {LayoutSummary} from '@mizchi/veriss/src/layout-contracts.d.ts';
import type {DeclaredNoShiftProof} from './layout-noshift.mjs';
export function verifyDeclaredNoShift(ir:ProgramIR,report:LayoutSummary,options?:{timeoutMs?:number}):Promise<DeclaredNoShiftProof>;
