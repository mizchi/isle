/** Version 1 wire contract between the MoonBit frontend and JS adapters. */
import type { Primitive, Field, Schema, SourceSpan, ValidationIssue } from './schema-contracts.d.ts';
export type { PrimitiveType, Primitive, Constraint, Field, Schema, SourceSpan, ValidationIssue } from './schema-contracts.d.ts';
export type Expression =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'name'; name: string }
  | { kind: 'event'; field: 'value' | 'checked' | 'invalid' | 'validationMessage' | 'key' }
  | { kind: 'conditional'; test: Expression; yes: Expression; no: Expression }
  | { kind: 'method'; object: Expression; method: 'trim' | 'concat'; args: Expression[] }
  | { kind: 'collection'; object: Expression; method: 'map' | 'filter' | 'some' | 'every'; parameter: string; body: Expression }
  | { kind: 'json-parse'; type: string; value: Expression }
  | { kind: 'json-stringify'; value: Expression }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '===' | '!==' | '<' | '>' | '<=' | '>=' | '&&' | '||'; left: Expression; right: Expression }
  | { kind: 'array'; values: Expression[] }
  | { kind: 'record'; fields: { name: string; value: Expression }[] }
  | { kind: 'index'; object: Expression; index: Expression }
  | { kind: 'not'; value: Expression }
  | { kind: 'property'; object: Expression; key: string }
  | { kind: 'remote'; name: string; fields: { name: string; value: Expression }[] };
export interface Statement { target: string; op: '=' | '+=' | '-='; value: Expression }
export interface FormContract { schema: { name: string; fields: Field[] }; output: { name: string; fields: Field[] }; action: string; asyncValidation: boolean; events: string[] }
export interface Handler { id: string; event: 'click' | 'input' | 'change' | 'submit' | 'invalid' | 'keydown' | 'dblclick' | 'focusout'; async: boolean; source: SourceSpan; statements: Statement[]; form?: FormContract }
export type WireValue = Primitive | readonly WireValue[] | { readonly [key: string]: WireValue };
export type ValueType = 'number' | 'string' | 'boolean' | { array: ValueType } | { record: Record<string, ValueType> };
export type ComponentField = Omit<Field, 'type'> & { type: string };
export type ValueField = Omit<Field, 'type'> & { type: ValueType };
export type TemplateNode =
  | { kind: 'select'; cases: { test: Expression; children: TemplateNode[] }[]; fallback: TemplateNode[]; source: SourceSpan }
  | { kind: 'each'; item: string; index: string; value: Expression; key: Expression; children: TemplateNode[]; empty: TemplateNode[]; source: SourceSpan }
  | { kind: 'boundary'; children: TemplateNode[]; error: string; fallback: TemplateNode[]; source: SourceSpan }
  | { kind: 'text'; value: string }
  | { kind: 'expression'; value: Expression }
  /** An opaque, lexical render fragment. Never a wire value or state slot. */
  | { kind: 'slot' }
  /** Lowered client call; its props are invariant in the parent owner. */
  | { kind: 'island'; component: string; site: string; props: { name: string; value: Expression }[]; children: TemplateNode[]; source?: SourceSpan }
  | { kind: 'element'; tag: string; source?: SourceSpan; attributes: { name: string; value: Expression }[]; children: TemplateNode[]; handlers: Handler[];
    form?: FormContract; formField?: string; formError?: string; formSummary?: boolean; formStatus?: boolean };
export interface Component {
  /** universal is the pure subset usable in either phase; it never infers client behavior. */
  name: string; side: 'server' | 'client' | 'universal'; props: ComponentField[];
  /** Source children: RenderFragment was erased into a lexical slot. */
  children?: true;
  states: (ComponentField & { initial: Expression })[];
  derives: { name: string; value: Expression }[]; root: TemplateNode;
}
export interface Action {
  name: string; inputSchema: string; outputSchema: string;
  inputName: string; requestName: string; grantName: string;
  policy: { name: string; targetField: string }; effects: string[];
  validation: { name: string; effects: ['db.read'] } | null;
  call: { name: string; args: ({ kind: 'grant' } | { kind: 'input'; field: string })[] };
}
export interface ProgramIR {
  version: 1; components: Component[];
  schemas: Schema[];
  actions: Action[];
}
export interface DiagnosticLocation extends SourceSpan { file?: string }
export interface RelatedDiagnostic extends DiagnosticLocation { message: string }
export interface Diagnostic extends DiagnosticLocation {
  code: string; message: string; hint: string;
  /** Closed witness path, including the repeated first ID. Empty for non-cycle diagnostics. */
  cycle?: string[];
  related?: RelatedDiagnostic[];
}
/** Edges point from a computation to its prerequisites. This is not the event write graph. */
export interface DependencyGraph {
  version: 1;
  nodes: { id: string; source: DiagnosticLocation; dependencies: { id: string; source: DiagnosticLocation }[] }[];
}
export type DependencyCheckResult = { ok: true; order: string[]; diagnostics: [] } | { ok: false; diagnostics: Diagnostic[] };
export type CompileResult = { ok: true; ir: ProgramIR; diagnostics: [] } | { ok: false; diagnostics: Diagnostic[] };
export interface Principal { readonly subject: string; readonly tenant: string }
export interface Permit extends Principal { readonly target: Primitive; readonly operation: string }
export interface OperationContext { context: Principal; permit: Permit; args: (Primitive | Permit)[]; prepared?: unknown }
/** Effects and purity of host code are trusted declarations in v0. */
export interface ServerHost {
  context(request: Request): Principal | null | Promise<Principal | null>;
  policies: Record<string, (context: Principal, target: Primitive) => boolean>;
  validators?: Record<string, { effects: string[];
    validate(context: { input: Readonly<Record<string, Primitive>>; context: Principal; permit: Permit; signal: AbortSignal }): ValidationIssue[] | Promise<ValidationIssue[]> } >;
  operations: Record<string, {
    policy: string; effects: string[];
    prepare?(context: OperationContext): unknown | Promise<unknown>;
    commit(context: OperationContext): Record<string, Primitive>;
  }>;
}
