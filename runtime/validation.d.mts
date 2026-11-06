import type { Field, ValidationIssue } from '../lib/contracts.d.ts';
export function createValidator(schema: { fields: readonly Field[] }): (value: unknown) => ValidationIssue[];
export function checkIssues(issues: unknown, fields: readonly Field[]): ValidationIssue[];
export function compilePattern(pattern: string): RegExp;
