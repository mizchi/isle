import type { CodeManifest, ModuleImporter } from '../lib/code-contracts.d.ts';
export interface CodeLoadPlan { references: string[]; modules: string[]; styles?: string[] }
export function planCodeLoad(manifest: CodeManifest, ids: readonly string[]): CodeLoadPlan;
export function eagerLoad(manifest: CodeManifest, options: { baseURL: string | URL; ids?: readonly string[]; importModule?: ModuleImporter; loadStyle?: (url: string) => void | Promise<void> }): Promise<void>;
