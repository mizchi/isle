import type { CodeManifest, LoadingPolicy, LoadingPlan } from './code-contracts.d.ts';
export const DEFAULT_AUTO_PRELOAD_GZIP_BYTES: number;
export function validatePreloadBudget(bytes: number): void;
export function loadingPriority(entry: { event?: string }): 0 | 1 | undefined;
export function planLoading(manifest: CodeManifest, policies: ReadonlyMap<string, LoadingPolicy>, options?: { gzipBytes?: number }): {
  eager: string[]; preload: string[]; plan?: LoadingPlan;
};
