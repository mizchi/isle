import {createContractIR,createLayoutIR,createObligationIR,createInstanceObligationIR,createDeclaredObligations,createRefinementObligationIR,verifyObligationIR,type ContractIR,type LayoutIR,type ObligationIR,type ContractProof} from '@isle/prototype/layout/contracts';
import {verifyContractObligation,verifyDeclaredLayouts} from '@isle/prototype/layout/contracts/node';
import type {LayoutSummary} from '../../lib/layout.mjs';
import type {LayoutSolverAPI} from '../../lib/layout-z3.mjs';
import {createNoShiftPlan,verifyNoShiftPlan,type DeclaredNoShiftProof} from '@isle/prototype/layout/noshift';
import {verifyDeclaredNoShift} from '@isle/prototype/layout/noshift/node';
import type {ProgramIR} from '../../lib/contracts.d.ts';
declare const sourceIR:ProgramIR;
declare const stateReport:LayoutSummary;
const plan=createNoShiftPlan(sourceIR,stateReport);
const declaredProof:Promise<DeclaredNoShiftProof>=verifyDeclaredNoShift(sourceIR,stateReport);
void declaredProof;void verifyNoShiftPlan;
// @ts-expect-error Proof plans are immutable build metadata.
plan.checks.push({});
declare const report:LayoutSummary,api:LayoutSolverAPI;
const contract:ContractIR=createContractIR({component:'Four',requires:{inlineSize:{min:160,max:640},blockSize:{min:40,max:640}}});
const implementation:LayoutIR=createLayoutIR(report);
const obligation:ObligationIR=createObligationIR(contract,implementation,{children:[{path:'Four/0',contract}]});
void verifyObligationIR(obligation,api);void verifyContractObligation(obligation);
void createRefinementObligationIR(contract,contract);
void createInstanceObligationIR(contract,implementation,{path:'Four/0'});void createDeclaredObligations(implementation);void verifyDeclaredLayouts(report);
const positioned:ContractIR=createContractIR({component:'Map',profile:'positioned-grid/1',requires:{inlineSize:{min:320,max:960},blockSize:{min:240,max:720}},spaces:[{name:'map',selector:'.map'}],overlays:[{selector:'.controls',within:'map'}]});
void createObligationIR(positioned,implementation);
declare const proof:ContractProof;
for(const transfer of proof.placementTransfers ?? []) {
  const allocation:'used-border-box'=transfer.allocation;void allocation;
  // @ts-expect-error Placement evidence is immutable.
  transfer.caller='Other';
}
// @ts-expect-error PositionedGrid needs explicit named coordinate bindings.
createContractIR({component:'Map',profile:'positioned-grid/1',requires:{inlineSize:{min:320,max:960},blockSize:{min:240,max:720}}});
// @ts-expect-error SafeGrid remains in-flow and does not accept positioned bindings.
createContractIR({component:'Map',profile:'safe-grid/1',requires:{inlineSize:{min:320,max:960},blockSize:{min:240,max:720}},spaces:[{name:'map',selector:'.map'}]});
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
