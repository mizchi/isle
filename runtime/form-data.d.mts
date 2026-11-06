import type { Field, Primitive, ValidationIssue } from '../lib/contracts.d.ts';
export type DecodedForm = { ok: true; value: Record<string, Primitive> } | { ok: false; issues: ValidationIssue[] };
export function decodeFormData(schema: { fields: readonly Field[] }, entries: Iterable<readonly [string, unknown]>): DecodedForm;
