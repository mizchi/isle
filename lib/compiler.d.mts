import type { Action, Component, CompileResult, DependencyCheckResult, DependencyGraph, ProgramIR } from './contracts.d.ts';
import type { GeneratedComponent, StaticAnalysis } from './codegen.mjs';
import type { ComponentCost } from './cost-contracts.d.ts';
export type * from './contracts.d.ts';

export interface ComponentExplanation {
  name: string;
  side: Component['side'];
  components: string[];
  states: string[];
  derives: string[];
  chunks: (Omit<GeneratedComponent['handlers'][number], 'code'> & { loading: 'lazy' })[];
  analysis: StaticAnalysis;
  cost: ComponentCost;
  browserSetupReexecution: false;
}
export interface BoundaryExplanation {
  name: string;
  input: string;
  output: string;
  policy: string;
  target: string;
  operation: string;
  effects: string[];
  validation: Action['validation'];
  authorizationRequired: true;
  principalSource: 'server host.context(request)';
  policyImplementation: 'trusted host adapter';
  compilerProvesBusinessPolicy: false;
}
export interface ProgramExplanation {
  version: 1;
  components: ComponentExplanation[];
  boundaries: BoundaryExplanation[];
}
export function compile(source: string): CompileResult;
export function compileFile(path: string): Promise<CompileResult>;
export function checkDependencies(graph: DependencyGraph): DependencyCheckResult;
export function requireIR(result: CompileResult): ProgramIR;
export function explain(ir: ProgramIR): ProgramExplanation;
