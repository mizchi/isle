export interface LayoutOptions {
  component?: string;
  /** Exact immutable initial props for this rendered document. */
  props?: Readonly<Record<string, import('./contracts.d.ts').WireValue>>;
  /** Trusted exact native gutter geometries of the target environments. */
  scrollbars?: readonly LayoutScrollbarProfile[];
  css: string;
  cssFile?: string;
  /** Ordered reset sources, before css in the same author cascade. */
  reset?: readonly { css: string; file?: string }[];
  /** Real ancestors, outermost first; used for inherited styles, not host sizing. */
  ancestors?: readonly { tag: string; id?: string; classes?: readonly string[] }[];
  /** Closed finite interval in CSS pixels. */
  viewport: { min: number; max: number; height?: { min: number; max: number } };
  /** Defaults to true when viewport.height is supplied. */
  block?: boolean;
  /** Host's total inline inset, outside the selected root. */
  hostInset?: number;
  hostBlockInset?: number;
  boxes?: Record<string, LayoutBoxContract>;
}
export interface LayoutBoxContract {
  /** Trusted sufficient content-width bound for every allowed input/font. */
  minInlineSize?: number;
  minBlockSize?: number;
  /** Trusted exact auto content height, or an ascending inline-width profile. */
  intrinsicBlockSize?: number | readonly { atLeastInlineSize: number; blockSize: number }[];
  wrap?: 'normal' | 'anywhere' | 'nowrap';
  overflow?: 'fit' | 'scroll' | 'clip' | 'visible';
  overflowBlock?: 'fit' | 'scroll' | 'clip' | 'visible';
}
export interface CheckedLayoutBoxContract extends Omit<LayoutBoxContract, 'overflow' | 'overflowBlock'> {
  overflow?: 'fit' | 'clip' | 'scroll';
  overflowBlock?: 'fit' | 'clip' | 'scroll';
}
export interface LayoutScrollbarProfile { name: string; inlineSize: number; blockSize: number; thinInlineSize?: number; thinBlockSize?: number }
export interface LayoutStructure {
  complete: boolean;
  variants: { id: number; choices: {kind:'state'|'branch'|'boundary'|'repeat'|'attribute';owner?:string;source?:number;arm?:number|string;count?:number;name?:string;value?:string|number|boolean|null}[] }[];
  bounds: {component:string;owner:string;state:string;length:{min:number;max:number|null}}[];
}
/** Build artifact only. This attests to the model and trusted bounds, not analyzer soundness. */
export interface LayoutBuildCertificate {
  proof:import('./layout-z3.mjs').LayoutProof;
  version: 1;
  status: 'verified';
  profile: 'closed-document';
  component: string;
  document: { file: string; sha256: string };
  stylesheet: { sha256: string };
  sources: { file: string; sha256: string }[];
  contracts: { viewport: LayoutOptions['viewport'] & { height: { min: number; max: number } }; boxes: Record<string, CheckedLayoutBoxContract>; scrollbars?:readonly LayoutScrollbarProfile[] };
  report: LayoutSummary & { ok: true; status: 'verified'; scope: LayoutSummary['scope'] & { axis: 'both'; blockSizing: true } };
  declarations?:import('./layout-contract.mjs').ContractProof[];
}
export interface LayoutRange {
  min: number; max: number; minInclusive: boolean; maxInclusive: boolean;
  /** Rational values are authoritative; numeric endpoints are display approximations. */
  minExact: string; maxExact: string;
}
export interface LayoutDiagnostic {
  variant?: number; scrollbarProfile?: string;
  code: string; severity: 'error' | 'unknown'; message: string;
  box?: string; path?: string; range?: LayoutRange;
  axis?: 'inline' | 'block'; heightRange?: LayoutRange; region?: LayoutRegion;
  css?: { file: string; line: number };
  source?: import('./contracts.d.ts').SourceSpan;
  witness?: { viewport: number; viewportExact: string; viewportHeight?: number; viewportHeightExact?: string; available: number; required: number };
}
export interface LayoutScenarioIdentity { variant?:number; scrollbarProfile?:string }
export interface LayoutSummary {
  layoutBindings?:(LayoutScenarioIdentity & {path:string;declaration:import('./contracts.d.ts').ComponentLayout})[];
  structure?: LayoutStructure;
  scrollbars?: {box:string;path:string;inlineSize:number;blockSize:number;viewport:boolean;variant?:number;scrollbarProfile?:string;range:LayoutRange;heightRange?:LayoutRange;region?:LayoutRegion}[];
  version: 1; ok: boolean; status: 'verified' | 'violated' | 'unknown'; component: string;
  scope: { axis: 'inline' | 'both'; viewport: LayoutRange & { height?: LayoutRange | null }; hostInset: number; hostBlockInset?: number; closedCSS: true; browserRounding: false; blockSizing: boolean; scrollbarProfiles?:readonly LayoutScrollbarProfile[] };
  assumptions: string[];
  styleSources: { kind: 'reset' | 'app'; file: string }[];
  diagnostics: LayoutDiagnostic[];
  policies: (LayoutScenarioIdentity & { box: string; path: string; axis: 'inline' | 'block'; overflow: 'fit' | 'scroll' | 'clip' | 'visible'; range: LayoutRange; heightRange?: LayoutRange; region?: LayoutRegion })[];
  checks: (LayoutScenarioIdentity & { box: string; path: string; code: string; axis: 'inline' | 'block'; range: LayoutRange; heightRange?: LayoutRange; region?: LayoutRegion; available: LayoutAffine; required: LayoutAffine; enforced: boolean })[];
  sizes: (LayoutScenarioIdentity & { box: string; path: string; range: LayoutRange; heightRange?: LayoutRange; region?: LayoutRegion; allocatedInlineSize:LayoutAffine;allocatedBlockSize?:LayoutAffine;inlineSize: LayoutAffine; blockSize?: LayoutAffine;contentInlineSize:LayoutAffine;contentBlockSize?:LayoutAffine; boxSizing: 'border-box' | 'content-box'; boxSizingSource?: { file: string; line: number; selector: string; layer?: string; specified: string } })[];
  queries: (LayoutScenarioIdentity & { box: string; path: string; range: LayoutRange; heightRange?:LayoutRange;region?:LayoutRegion;name?: string; target?: string; targetPath?: string; matched: boolean })[];
  /** Resolved shared tracks, local line numbering, effective gap and edge insets. Build-only. */
  subgrids: LayoutSubgrid[];
}
export interface LayoutSubgrid extends LayoutScenarioIdentity {
  box: string; path: string; axis: 'inline' | 'block';
  parent: string; parentPath: string; startLine: number; span: number;
  gap: string; insets: [string, string]; tracks: LayoutAffine[];
  range: LayoutRange; heightRange?: LayoutRange; region?: LayoutRegion;
}
export interface LayoutAffine { coefficient: string; constant: string; heightCoefficient?: string }
export interface LayoutRegion { vertices: { width: string; height: string }[]; constraints: (LayoutAffine & { strict: boolean })[] }
