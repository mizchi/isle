import type {LayoutOptions,LayoutSummary,LayoutDeclaration,SourceSpan} from './layout-contracts.d.ts';
export type * from './layout-contracts.d.ts';

/** Concrete finite structure; text geometry comes from explicit content bounds. */
export interface BoxTree {
  readonly tag:string;
  readonly id?:string;
  readonly classes?:readonly string[];
  readonly children?:readonly BoxTree[];
  readonly text?:boolean;
  /** Otherwise empty text nodes; Unknown if CSS preserves their geometry. */
  readonly whitespace?:boolean;
  readonly path?:string;
  readonly owner?:string;
  readonly source?:SourceSpan;
  readonly documentRoot?:boolean;
  readonly layoutContracts?:readonly LayoutDeclaration[];
  /** Build-only semantic target IDs supplied by the input adapter. */
  readonly targets?:readonly string[];
  readonly targetIdentity?:'stable'|'unknown';
}
export function analyzeLayout(tree:BoxTree,options:LayoutOptions):LayoutSummary;
