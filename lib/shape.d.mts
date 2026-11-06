import type { Field, Primitive } from './contracts.d.ts';
export function checkedIdentifier(value: unknown): string;
export function validateShape(value: unknown, fields: readonly Field[], label?: string): Record<string, Primitive>;
