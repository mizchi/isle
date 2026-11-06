import type { Field, Primitive, ValidationIssue } from '../lib/contracts.d.ts';
export interface FormView<T> { values: T; issues: ValidationIssue[]; touched: string[]; dirty: boolean; pending: boolean; validating: boolean; status: string }
export interface FormServices<T, Output> {
  live?(): boolean;
  validate?(values: Readonly<T>, signal: AbortSignal): Promise<ValidationIssue[]>;
  submit(values: Readonly<T>, signal: AbortSignal): Promise<{ ok: true; value: Output } | { ok: false; issues?: ValidationIssue[] }>;
  change?(view: FormView<T>): void;
  success?(value: Output): void;
}
export interface FormSession<T> {
  snapshot(): FormView<T>;
  cancelValidation(): void;
  update(values: T, field?: string | null, isCurrent?: () => boolean): Promise<void>;
  invalid(issues: ValidationIssue[], field?: string | null, dirty?: boolean): void;
  touch(field: string): void;
  submit(values: T, isCurrent?: () => boolean): Promise<void>;
  reset(): void;
  dispose(): void;
}
export function createFormSession<T extends Record<string, Primitive>, Output = Record<string, Primitive>>(
  contract: { schema: { fields: readonly Field[] }; asyncValidation?: boolean }, initial: T, services: FormServices<T, Output>): FormSession<T>;
