import {createContractIR,createLayoutIR,createObligationIR,createInstanceObligationIR,createDeclaredObligations,createRefinementObligationIR,verifyObligationIR,type ContractIR,type LayoutIR,type ObligationIR} from '@isle/prototype/layout/contracts';
import {verifyContractObligation,verifyDeclaredLayouts} from '@isle/prototype/layout/contracts/node';
import type {LayoutSummary} from '../../lib/layout.mjs';
import type {LayoutSolverAPI} from '../../lib/layout-z3.mjs';
declare const report:LayoutSummary,api:LayoutSolverAPI;
const contract:ContractIR=createContractIR({component:'Four',requires:{inlineSize:{min:160,max:640},blockSize:{min:40,max:640}}});
const implementation:LayoutIR=createLayoutIR(report);
const obligation:ObligationIR=createObligationIR(contract,implementation,{children:[{path:'Four/0',contract}]});
void verifyObligationIR(obligation,api);void verifyContractObligation(obligation);
void createRefinementObligationIR(contract,contract);
void createInstanceObligationIR(contract,implementation,{path:'Four/0'});void createDeclaredObligations(implementation);void verifyDeclaredLayouts(report);
// @ts-expect-error A guarantee cannot be weakened to hide overflow.
createContractIR({component:'Four',requires:{inlineSize:{min:160,max:640},blockSize:{min:40,max:640}},ensures:{inline:'clip',block:'fit'}});
// @ts-expect-error Input bounds are required on both axes.
createContractIR({component:'Four',requires:{inlineSize:{min:160,max:640}}});
// @ts-expect-error Guarantees are not implementation facts.
createObligationIR(contract,contract);
// @ts-expect-error IR is immutable.
contract.requires.inlineSize.minExact='0';
// @ts-expect-error Arbitrary profiles do not have a checked semantics.
createContractIR({component:'Four',profile:'any-css',requires:{inlineSize:{min:160,max:640},blockSize:{min:40,max:640}}});
