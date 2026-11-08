import type {Expression,ValueField,ValueType} from './contracts.d.ts';
export interface RecordProjection {name:string;source:string;path:string[];type:'number'|'string'|'boolean'}
export function recordPath(expression:Expression,derives:ReadonlyMap<string,Expression>,locals?:ReadonlyMap<string,unknown>):string[]|undefined;
export function planRecordCaptures(props:readonly {name:string;type?:string|ValueType}[],derives:ReadonlyMap<string,Expression>,uses:readonly {expression:Expression;locals?:ReadonlyMap<string,unknown>}[],fields:readonly ValueField[]):{fields:ValueField[];projections:RecordProjection[]};
