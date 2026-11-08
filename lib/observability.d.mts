import type {Component} from './contracts.d.ts';
export interface ObservabilityReport {removedHandlers:string[];removedStatements:number;barrier:string|null}
/** Conservative, compile-only optimization of an already checked closed component. */
export function optimizeObservability(input:Component):{component:Component;report:ObservabilityReport};
