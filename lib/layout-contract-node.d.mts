import type {ObligationIR,ContractProof} from './layout-contract.mjs';
export function verifyContractObligation(obligation:ObligationIR,options?:{timeoutMs?:number}):Promise<ContractProof>;
