import type { Plugin } from 'vite';
import type { ServerHost } from './contracts.d.ts';
import type { IsleMount, RenderMode } from './client-contracts.d.ts';
import type { LoadingPolicy } from './code-contracts.d.ts';
import type { SpeculationRules } from './speculation.mjs';
import type { CostBudget } from './cost-contracts.d.ts';
import type { CheckedLayoutBoxContract, LayoutScrollbarProfile } from './layout-contracts.d.ts';
/** Closed document profile: all author CSS is owned by this build. Unknown is an error. */
export interface CheckedLayoutOptions {
  /** Local CSS path relative to the .isle entry. Delivered automatically. */
  css?: string;
  /** Ordered reset paths relative to the entry, before app CSS. */
  reset?: readonly string[];
  viewport: { min: number; max: number; height: { min: number; max: number } };
  /** Trusted content bounds and explicit overflow policies. */
  boxes?: Record<string, CheckedLayoutBoxContract>;
  /** Exact native scrollbar sizes for every supported target environment. */
  scrollbars?: readonly LayoutScrollbarProfile[];
}
export interface WidgetBuildOptions {
  /** shared pins an exact page version; standalone embeds a private runtime. Default: shared. */
  runtime?: 'shared' | 'standalone';
  /** Exact runtime distribution version; defaults to package.json. For versioned distributions. */
  runtimeVersion?: string;
  tagName?: string;
  descriptorFile?: string;
  loaderFile?: string;
  /** Descriptor-relative or absolute HTTP(S) directory. Default: ./__isle/. */
  actionBaseURL?: string;
  /** Trusted HTML fragment containing exactly one <!--isle:ssr--> marker. */
  template?: string;
  /** Native Shadow DOM CSS, authored explicitly; no document selector rewrites. */
  css?: string;
}
export interface IsleOptions {
  entry: string;
  mounts: IsleMount[];
  /** Default true renders labeled demo cards. False lets the app own its document shell. */
  wrapMounts?: boolean;
  /** Fail production builds on layout violations or unknowns; emit isle.layout.json.
   * Requires one mount, wrapMounts:false, generated loader, no widget/resource setup. */
  layout?: CheckedLayoutOptions;
  mode?: RenderMode;
  /** auto (default) plans fetch-only preloads from events and final chunk sizes. */
  loading?: LoadingPolicy;
  /** Additional automatic JS/CSS preloads, summed once per physical asset, gzip level 6.
   * Default 8192. Explicit preload/eager entries do not consume this budget. */
  autoPreloadGzipBytes?: number;
  /** Pack small sibling entries into lazy chunks using a UTF-8 source byte budget.
   * Default 1024; zero preserves one chunk per entry. Schema forms remain independent. */
  handlerChunkBytes?: number;
  /** Native navigation prefetch/prerender hints. Independent of CodeRef chunk loading. */
  speculation?: SpeculationRules | false;
  /** Optional framework entry; only injected when at least one mount can resume. */
  clientEntry?: string;
  /** Local setup modules, relative to entry, keyed by interactive client component name.
   * Export setup: ClientResourceSetup. Invoked once before the first resumed handler. */
  resources?: Readonly<Record<string, string>>;
  diagnostics?: boolean;
  /** Emit standard User Timing entries. Disabled by default, including development. */
  profile?: boolean;
  /** Compile-time cost sidecar only; no production JS overhead. Debug HTML also embeds inert JSON.
   * Default enabled. Explicit budgets fail the build on excess, unknown or unmatched targets. */
  cost?: false | { budgets?: readonly CostBudget[] };
  host?: ServerHost;
  /** Emit a portable descriptor, Custom Element loader and generated mount ESM. */
  widget?: WidgetBuildOptions;
}
export function isle(options: IsleOptions): Plugin[];
