import type { SourceSpan } from './contracts.d.ts';

/** Counts concern the emitted handler, excluding browser/runtime internals and elapsed time. */
export type CostBound = { kind: 'upper-bound'; value: number } | { kind: 'unknown'; reason: string };
export type CostMetric = 'stateWrites' | 'binaryOperations' | 'propertyReads' | 'slotReads' | 'eventReads'
  | 'textPatchCalls' | 'attributePatchCalls' | 'textConversions' | 'remoteCalls' | 'createdElements';
export type CostWork = Record<CostMetric, CostBound>;
export interface UnknownCost { code: 'string-size' | 'remote-duration' | 'form-runtime' | 'control-flow'; reason: string }
/** Cold-owner locator candidates; attribute targets may resolve lazily during the first commit. */
export interface RestoreCost { owners: number; snapshotSlots: number; bindingLocators: number; childOwners: 0 }
export interface CostCode {
  scope: 'static-code-closure'; modules: string[]; styles?: string[];
  /** Absent if the supplied manifest does not contain byte metadata. */
  bytes?: number; gzipBytes?: number;
  /** Dynamic dependencies are outside the static closure; these may require more fetches. */
  dynamicImports: string[];
  unresolvedReferences?: string[];
}
export interface CostEntry {
  id: string; component: string; event: string; async: boolean; source: SourceSpan;
  scope: 'one-owner/generated-handler'; captures: string[]; writes: string[]; actions: string[];
  /** Present only for an explicit mount scenario; zero-instance entries are omitted. */
  instances?: number;
  work: CostWork; restore: RestoreCost;
  phases: { phase: string; sharedDerives: string[]; work: CostWork }[];
  updates: { id: number; kind: 'text' | 'attribute'; name?: string; dependencies: string[]; triggeredBy: string[] }[];
  /** A DAG of causes, rather than enumerated paths through a diamond. */
  reasons: { from: string; to: string }[];
  unknownCosts: UnknownCost[];
  code?: CostCode;
  location?: { file: string; start: { offset: number; line: number; column: number }; end: { offset: number; line: number; column: number } };
}
export interface ComponentCost {
  component: string; schemaId: string; side: 'server' | 'client' | 'universal';
  /** Lexical elements outside opaque child calls. Use scenario.domElements for rendered totals. */
  localElements: number | null; childSites: { site: string; component: string }[];
  restore: RestoreCost; entries: CostEntry[];
}
export interface CostMount { component: string; mode?: 'ssr' | 'resume' }
export interface CostScenario {
  /** domElements counts component template elements, excluding host wrappers and metadata scripts. */
  mode: 'ssr' | 'resume'; mounts: CostMount[]; domElements: number | null;
  resumableOwners: number; snapshotSlots: number;
  components: Record<string, { instances: number; resumableInstances: number }>;
}
export type BudgetMetric = CostMetric | 'snapshotSlots' | 'coldBytes' | 'coldGzipBytes' | 'durationMs'
  | 'domElements' | 'resumableOwners';
/** $page selects the explicit mount scenario; * selects every active entry. */
export interface CostBudget { entry: string; metric: BudgetMetric; max: number }
export interface CostBudgetResult {
  ok: boolean;
  checks: { entry: string; metric: BudgetMetric; max: number; actual: number | null;
    status: 'pass' | 'exceeded' | 'unknown' | 'unmatched' }[];
}
export interface CostSummary {
  version: 1; planId: string; buildId?: string;
  coverage: 'generated-handler-operations'; exclusions: string[];
  components: ComponentCost[]; entries: CostEntry[]; scenario: CostScenario | null;
  /** Union for all active entries, not initial page transfer or a sum of entry rows. */
  code?: CostCode;
  budget: CostBudgetResult; ok: boolean;
}
