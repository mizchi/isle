export type * from '../packages/css-verifier/src/layout-contracts.d.ts';
import type {LayoutOptions as CSSOptions,LayoutSummary as CSSSummary,LayoutBuildCertificate as CSSCertificate,LayoutStructure as CSSStructure} from '../packages/css-verifier/src/layout-contracts.d.ts';
import type {DeclaredNoShiftProof} from './layout-noshift.mjs';
import type {SourceSpan} from './contracts.d.ts';
export interface LayoutTargetIdentity {owner:string;nodeId:string;id:string;keys:{site:string;value:string|number}[]}
export interface LayoutStructure extends Omit<CSSStructure,'variants'> {
  variants:(CSSStructure['variants'][number] & {
    requirements?:LayoutTargetIdentity[];
    instances?:{identity:string;path:string;component:string;source:SourceSpan}[];
  })[];
}
export interface LayoutSummary extends CSSSummary {structure?:LayoutStructure;noshift?:DeclaredNoShiftProof}
export interface LayoutBuildCertificate extends CSSCertificate {noshift?:DeclaredNoShiftProof}
export interface LayoutOptions extends Omit<CSSOptions,'name'> {
  component?:string;
  /** Exact immutable initial props for the Isle structure adapter. */
  props?:Readonly<Record<string,import('./contracts.d.ts').WireValue>>;
}
