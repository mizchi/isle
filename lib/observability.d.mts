import type {Component,SourceSpan} from './contracts.d.ts';
export interface ObservabilityReport {removedHandlers:string[];removedStatements:number;removedUpdates:{handler:string;target:string;source?:SourceSpan}[];barrier:string|null}
/** Conservative, compile-only optimization of an already checked closed component. */
export function optimizeObservability(input:Component):{component:Component;report:ObservabilityReport};
