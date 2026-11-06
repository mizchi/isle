/** Portable value semantics shared by compiler, forms and server adapters. */
export type PrimitiveType = 'number' | 'string' | 'boolean';
export type Primitive = number | string | boolean;
/** UTF-16 offsets, end exclusive. Debug locations are absent from portable Schema IR. */
export interface SourceSpan { start: number; end: number }
export type Constraint = ({ kind: 'minLength' | 'maxLength' | 'min' | 'max'; value: number }
  | { kind: 'equals'; value: Primitive } | { kind: 'pattern' | 'format'; value: string }
  | { kind: 'sameAs'; field: string } | { kind: 'integer' }) & { source?: SourceSpan };
export interface Field { name: string; type: PrimitiveType; optional?: false; constraints?: Constraint[] }
export interface ValidationIssue { field: string; code: string }
/** No host helpers, effects, coercion or transformations are permitted here. */
export interface Schema { name: string; kind: 'schema' | 'view'; fields: Field[] }
