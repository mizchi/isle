export interface LayoutOptions {
  component?: string;
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
export interface LayoutRange {
  min: number; max: number; minInclusive: boolean; maxInclusive: boolean;
  /** Rational values are authoritative; numeric endpoints are display approximations. */
  minExact: string; maxExact: string;
}
export interface LayoutDiagnostic {
  code: string; severity: 'error' | 'unknown'; message: string;
  box?: string; path?: string; range?: LayoutRange;
  axis?: 'inline' | 'block'; heightRange?: LayoutRange; region?: LayoutRegion;
  css?: { file: string; line: number };
  source?: import('./contracts.d.ts').SourceSpan;
  witness?: { viewport: number; viewportExact: string; viewportHeight?: number; viewportHeightExact?: string; available: number; required: number };
}
export interface LayoutSummary {
  version: 1; ok: boolean; status: 'verified' | 'violated' | 'unknown'; component: string;
  scope: { axis: 'inline' | 'both'; viewport: LayoutRange & { height?: LayoutRange | null }; hostInset: number; hostBlockInset?: number; closedCSS: true; browserRounding: false; blockSizing: boolean };
  assumptions: string[];
  styleSources: { kind: 'reset' | 'app'; file: string }[];
  diagnostics: LayoutDiagnostic[];
  policies: { box: string; path: string; axis: 'inline' | 'block'; overflow: 'fit' | 'scroll' | 'clip' | 'visible'; range: LayoutRange; heightRange?: LayoutRange; region?: LayoutRegion }[];
  checks: { box: string; path: string; code: string; axis: 'inline' | 'block'; range: LayoutRange; heightRange?: LayoutRange; region?: LayoutRegion; available: LayoutAffine; required: LayoutAffine; enforced: boolean }[];
  sizes: { box: string; path: string; range: LayoutRange; inlineSize: LayoutAffine; blockSize?: LayoutAffine; boxSizing: 'border-box' | 'content-box'; boxSizingSource?: { file: string; line: number; selector: string; layer?: string; specified: string } }[];
  queries: { box: string; path: string; range: LayoutRange; name?: string; target?: string; targetPath?: string; matched: boolean }[];
}
export interface LayoutAffine { coefficient: string; constant: string; heightCoefficient?: string }
export interface LayoutRegion { vertices: { width: string; height: string }[]; constraints: (LayoutAffine & { strict: boolean })[] }
