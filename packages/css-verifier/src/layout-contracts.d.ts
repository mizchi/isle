export interface SourceSpan {start:number;end:number}
export interface LayoutDeclaration {contract:import('./layout-contract.mjs').ContractIR;source:SourceSpan}
export interface LayoutOptions {
  /** Opaque subject identifier; also used as the root path. */
  name?: string;
  /** Trusted exact native gutter geometries of the target environments. */
  scrollbars?: readonly LayoutScrollbarProfile[];
  /** Static counterparts of vlmkit's box-model integrity rules (ADR-0012). */
  integrity?: boolean | LayoutIntegrityOptions;
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
  /** Font the size bounds were measured with (`/text`); the computed CSS font must match or the box is Unknown. */
  font?: { family: string; size: number; lineHeight: number; weight?: number; style?: 'normal' };
  /** Provenance of font-derived bounds. A domain bound table indexed by character count. */
  textMetrics?: { kind: 'content'; text: string; width: number; font?: object; allowance?: string }
    | { kind: 'domain'; characters: string; maxLength: number; perCharacter: number; pairAdjustment: number; widest: string; bounds: number[]; font?: object; allowance?: string };
}
export interface CheckedLayoutBoxContract extends Omit<LayoutBoxContract, 'overflow' | 'overflowBlock'> {
  overflow?: 'fit' | 'clip' | 'scroll';
  overflowBlock?: 'fit' | 'clip' | 'scroll';
}
export interface LayoutScrollbarProfile { name: string; inlineSize: number; blockSize: number; thinInlineSize?: number; thinBlockSize?: number }
export interface LayoutStructure {
  complete: boolean;
  variants: { id: number; choices: {kind:'state'|'branch'|'boundary'|'repeat'|'attribute';owner?:string;source?:number;arm?:number|string;count?:number;name?:string;value?:string|number|boolean|null;alternative?:number}[] }[];
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
  css?: { file: string; line: number; column?: number };
  hint?: string;
  related?: { message:string; css:{file:string;line:number;column?:number} }[];
  conflict?: {properties:[string,string];longhands:string[]};
  source?: SourceSpan;
  witness?: { viewport: number; viewportExact: string; viewportHeight?: number; viewportHeightExact?: string; available: number; required: number };
  /** For a text domain: how many characters fit at the witness (font-derived contracts only). */
  text?: { maxLength: number; fitsUpTo: number; widest: string };
  /** Build/debug provenance of both sides (ADR-0002). Never consulted by the proof. */
  explanation?: LayoutExplanation;
}
/** A declaration whose var() reference is guaranteed-invalid; it computes as unset (CSS Variables 1 section 3). */
export interface LayoutInvalidSubstitution {
  box:string; path:string; range:LayoutRange; heightRange?:LayoutRange;
  /** Authored property, possibly a shorthand, and the longhands it decided. */
  property:string; longhands:string[];
  css:{file:string;line:number}; reason:'guaranteed-invalid'|'cycle'; message:string; resolution:'unset';
}
export interface LayoutIntegrityOptions {
  /** WCAG 2.2 SC 2.5.8 target size for button/a (default 24). */
  targetSize?: number;
  /** 'all' parents (default) or only those with a border or background, as vlmkit judges. */
  protrusion?: 'all' | 'painted';
}
export interface LayoutIntegrityRow { code: string; severity: 'error' | 'warning'; rule: string; message: string; box: string; path: string; range: LayoutRange; heightRange?: LayoutRange; other?: string; parent?: string; axis?: 'inline' | 'block'; reason?: string }
export interface LayoutCSSCondition { kind:'media'|'container'; name?:string; params:string; css:{file:string;line:number} }
export interface LayoutCSSOrigin { file:string; line:number; selector:string; layer?:string; specified:string; conditions?:LayoutCSSCondition[] }
export type LayoutExplanationFact =
  | { path:string; box:string; owner:string; property:string; value:string; origin:'author'; css:LayoutCSSOrigin; overridden?:{css:LayoutCSSOrigin}[]; dormant?:{css:LayoutCSSOrigin}[] }
  | { path:string; box:string; owner:string; property:string; value:string; origin:'default'; overridden?:{css:LayoutCSSOrigin}[]; dormant?:{css:LayoutCSSOrigin}[] }
  | { kind:'viewport'; axis:'inline'|'block'; hostInset?:number }
  | { kind:'contract'; path:string; box:string; owner:string; property:'minInlineSize'|'minBlockSize'; value:number; selector:string; trusted:true };
export interface LayoutExplanation {
  version:1;
  /** Facts that determine the offered size (parent tracks/gaps up to a definite size or the viewport). */
  available:{facts:LayoutExplanationFact[]};
  /** Facts that determine the box's own requirement. */
  required:{facts:LayoutExplanationFact[]};
}
export interface LayoutScenarioIdentity { variant?:number; scrollbarProfile?:string }
export interface LayoutElement extends LayoutScenarioIdentity {
  path:string;tag:string;id?:string;classes:string[];owner:string;
  targets?:string[];targetIdentity?:'stable'|'unknown';
}
export interface LayoutPosition {
  /** Unscrolled border rectangle relative to the analyzed root border origin. */
  rect?:LayoutRectangle;
  position?:'static'|'relative'|'absolute';
  /** Local border-box origin in the actual containing block's padding box. */
  origin?:{inline:LayoutAffine;block:LayoutAffine};
  containingBlock?:{path:string;inline:LayoutAffine;block:LayoutAffine};
}
export interface LayoutRectangle {inlineStart:LayoutAffine;blockStart:LayoutAffine;inlineSize:LayoutAffine;blockSize:LayoutAffine}
export interface LayoutSummary {
  /** Structural identities, including CSS-hidden boxes; never contract assumptions. */
  elements?:LayoutElement[];
  layoutBindings?:(LayoutScenarioIdentity & {path:string;declaration:LayoutDeclaration})[];
  structure?: LayoutStructure;
  scrollbars?: {box:string;path:string;inlineSize:number;blockSize:number;viewport:boolean;variant?:number;scrollbarProfile?:string;range:LayoutRange;heightRange?:LayoutRange;region?:LayoutRegion}[];
  invalidSubstitutions?: LayoutInvalidSubstitution[];
  integrity?: { rules: string[]; targetSize: number; protrusion: 'all' | 'painted'; warnings: LayoutIntegrityRow[]; exempted: LayoutIntegrityRow[] };
  version: 1; ok: boolean; status: 'verified' | 'violated' | 'unknown'; component: string;
  scope: { axis: 'inline' | 'both'; viewport: LayoutRange & { height?: LayoutRange | null }; hostInset: number; hostBlockInset?: number; closedCSS: true; browserRounding: false; blockSizing: boolean; scrollbarProfiles?:readonly LayoutScrollbarProfile[] };
  assumptions: string[];
  styleSources: { kind: 'reset' | 'app'; file: string }[];
  diagnostics: LayoutDiagnostic[];
  policies: (LayoutScenarioIdentity & { box: string; path: string; axis: 'inline' | 'block'; overflow: 'fit' | 'scroll' | 'clip' | 'visible'; range: LayoutRange; heightRange?: LayoutRange; region?: LayoutRegion })[];
  checks: (LayoutScenarioIdentity & { box: string; path: string; code: string; axis: 'inline' | 'block'; range: LayoutRange; heightRange?: LayoutRange; region?: LayoutRegion; available: LayoutAffine; required: LayoutAffine; enforced: boolean })[];
  sizes: (LayoutScenarioIdentity & LayoutPosition & { box: string; path: string; range: LayoutRange; heightRange?: LayoutRange; region?: LayoutRegion; allocatedInlineSize:LayoutAffine;allocatedBlockSize?:LayoutAffine;inlineSize: LayoutAffine; blockSize?: LayoutAffine;contentInlineSize:LayoutAffine;contentBlockSize?:LayoutAffine;paddingInlineSize?:LayoutAffine;paddingBlockSize?:LayoutAffine; boxSizing: 'border-box' | 'content-box'; boxSizingSource?: { file: string; line: number; selector: string; layer?: string; specified: string } })[];
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
