import type { ProgramIR } from './contracts.d.ts';
import type { CodeManifest } from './code-contracts.d.ts';
import type { CostBudget, CostMount, CostSummary, CostBudgetResult } from './cost-contracts.d.ts';
export type { CostSummary, ComponentCost, CostEntry, CostBound, CostMetric, CostBudget, CostBudgetResult } from './cost-contracts.d.ts';
export interface CostOptions { mounts?: readonly CostMount[]; mode?: 'resume' | 'ssr'; manifest?: CodeManifest; budgets?: readonly CostBudget[] }
export function analyzeCosts(ir: ProgramIR, options?: CostOptions): CostSummary;
export function checkCostBudgets(report: CostSummary, budgets: readonly CostBudget[]): CostBudgetResult;
