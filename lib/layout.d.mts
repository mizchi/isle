import type { ProgramIR } from './contracts.d.ts';
import type { LayoutOptions, LayoutSummary } from './layout-contracts.d.ts';
export type { LayoutOptions, LayoutSummary, LayoutBoxContract, CheckedLayoutBoxContract, LayoutRange, LayoutDiagnostic, LayoutSubgrid, LayoutBuildCertificate } from './layout-contracts.d.ts';
export function analyzeLayout(ir: ProgramIR, options: LayoutOptions): LayoutSummary;
