export type CodeFunction = (...args: never[]) => unknown;
declare const target: unique symbol;
/** The brand is type-only. Consumers treat the tuple and captured indices as read-only. */
export type CodeRef<F extends CodeFunction = CodeFunction> = readonly [url: string, symbol: string, captures: readonly number[]] & { readonly [target]: F };
export type LoadingMode = 'lazy' | 'preload' | 'eager';
export type LoadingPolicy = LoadingMode | 'auto';
export interface LoadingPlan {
  version: 1;
  strategy: 'event-and-size';
  budgetGzipBytes: number;
  usedGzipBytes: number;
  decisions: {
    id: string; requested: LoadingPolicy; loading: LoadingMode;
    reason: 'explicit' | 'default' | 'input' | 'form' | 'interaction' | 'budget' | 'unknown-size';
    additionalGzipBytes: number | null; modules: string[];
    /** Initial entry IDs whose closures fetch this reference's physical module. */
    initialBy: string[];
    styles?: string[];
  }[];
}
export interface SourcePosition { offset: number; line: number; column: number }
export interface SourceLocation { file: string; start: SourcePosition; end: SourcePosition }
export interface CodeManifest {
  version: 1;
  buildId?: string;
  references: Record<string, {
    ref: CodeRef;
    chunk: string;
    requires: string[];
    kind?: 'runtime' | 'handler' | 'resource';
    schemaId?: string;
    source?: SourceLocation;
    event?: string;
    async?: boolean;
    captureNames?: string[];
    writes?: string[];
    actions?: string[];
    computations?: { phase: string; derives: string[] }[];
    loading?: LoadingMode;
  }>;
  chunks: Record<string, { url: string; imports: string[]; dynamicImports: string[]; styles?: string[]; externalImports?: string[]; bytes?: number; gzipBytes?: number }>;
  styles?: Record<string, { url: string; bytes?: number; gzipBytes?: number }>;
  loading: { eager: string[]; preload: string[] };
  /** Compile-time decisions only; never imported by the browser loader. */
  resolution?: LoadingPlan;
}
export type ModuleImporter = (url: string) => Promise<Record<string, unknown>>;
export interface CodeResolver { resolve<F extends CodeFunction>(ref: CodeRef<F>): Promise<F> }
