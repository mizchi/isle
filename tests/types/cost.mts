import { analyzeCosts, checkCostBudgets } from '../../lib/cost.mjs';
import { isle, type IsleOptions } from '../../lib/vite.mjs';
import type { ProgramIR } from '../../lib/contracts.d.ts';
import type { CostBudget } from '../../lib/cost-contracts.d.ts';

declare const ir: ProgramIR;
const budgets: CostBudget[] = [{ entry: '*', metric: 'textPatchCalls', max: 100 }];
const report = analyzeCosts(ir, { budgets, mounts: [{ component: 'Page', mode: 'ssr' }] });
checkCostBudgets(report, budgets);
const options: IsleOptions = { entry: 'app.isle', mounts: [], cost: { budgets } };
isle(options);
// @ts-expect-error unknown cost metric must not silently disable a budget
checkCostBudgets(report, [{ entry: '*', metric: 'textPatches', max: 100 }]);
// @ts-expect-error a measured-time estimate is not a static operation bound
const bound: import('../../lib/cost-contracts.d.ts').CostBound = { kind: 'upper-bound', milliseconds: 10 };
void bound;
