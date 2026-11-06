import type { LayoutOptions, LayoutDiagnostic, LayoutSummary } from '../lib/layout.mjs';
import type { Diagnostic } from '../lib/contracts.d.ts';
export interface LayoutExample {
  source: string;
  options: LayoutOptions;
}
export interface LayoutExampleCase {
  id: string; title: string; note: string;
  reject: LayoutExample; accept: LayoutExample;
  expected: {
    status: 'violated' | 'unknown'; code: string; axis?: 'inline' | 'block'; box?: string;
    range?: Partial<NonNullable<LayoutDiagnostic['range']>>;
  };
}
export interface LayoutExampleOutcome {
  exitCode: number | null;
  status: LayoutSummary['status'] | 'compile-error' | 'execution-error';
  diagnostics: (LayoutDiagnostic | Diagnostic)[];
  matched?: LayoutDiagnostic;
  stderr?: string;
}
export interface LayoutExamplesReport {
  version: 1; pass: boolean;
  cases: {
    id: string; title: string; note: string; pass: boolean;
    expected: LayoutExampleCase['expected'];
    reject: LayoutExampleOutcome; accept: LayoutExampleOutcome;
  }[];
}
export function evaluateLayoutRejections(cases: readonly LayoutExampleCase[], directory: string): Promise<LayoutExamplesReport>;
