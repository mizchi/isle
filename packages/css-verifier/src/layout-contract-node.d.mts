import type {ObligationIR,ContractProof} from './layout-contract.mjs';
export function verifyContractObligation(obligation:ObligationIR,options?:{timeoutMs?:number}):Promise<ContractProof>;
export function verifyDeclaredLayouts(report:import('./layout-contracts.d.ts').LayoutSummary,options?:{timeoutMs?:number}):Promise<ContractProof[]>;
