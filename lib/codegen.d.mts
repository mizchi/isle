import type { Component, Field, ValueField, FormContract, WireValue, SourceSpan, ProgramIR } from './contracts.d.ts';
import type { RenderMode, ResumeSnapshot, IsleMount } from './client-contracts.d.ts';
import type { ComponentCost } from './cost-contracts.d.ts';

export interface StaticAnalysis {
  folded: string[];
  aliases: { name: string; source: string }[];
  serverStates: string[];
  htmlStates: string[];
  skippedInitializers: string[];
  snapshotSlots: string[];
  staticFragments: number;
  dynamicBindings: number;
  textRanges: { id: number; prefix: number; suffix: number }[];
  resumeRoot: { tag: string; depth: number };
}
export interface GeneratedComponent {
  name: string;
  schemaId: string;
  fields: ValueField[];
  analysis: StaticAnalysis;
  regions?: { id: string; code: string; features: { select: boolean; each: boolean; boundary: boolean } };
  events: string[];
  bindings: { id: number; kind: 'text' | 'attribute'; name?: string; dependencies: string[];
    range?: { prefix: number; suffix: number } }[];
  handlers: { id: string; event: string; async: boolean; source?: SourceSpan; remote: boolean;
    form?: FormContract;
    computations: { phase: string; derives: string[] }[];
    actions: string[]; captures: number[]; captureNames: string[]; writes: string[]; symbol: 'run'; code: string }[];
}
export interface RenderOptions { scopeId?: string; mode?: RenderMode }
export interface RenderedComponent { html: string; snapshot: ResumeSnapshot | null; snapshotHtml: string }
export interface PreparedComponent {
  generate(): GeneratedComponent;
  cost(): ComponentCost;
  render(props: Record<string, WireValue>, options?: RenderOptions): RenderedComponent;
}
export interface PreparedProgram {
  get(name: string): PreparedComponent;
  reachable(name: string): string[];
  render(name: string, props: Record<string, WireValue>, options?: RenderOptions): RenderedComponent;
  renderAll(mounts: readonly IsleMount[], options?: { mode?: RenderMode }): RenderedComponent[];
}
/** Resolve the complete component graph for SSR. Client owners remain independent. */
export function prepareProgram(ir: ProgramIR): PreparedProgram;
/** Owns a copy of the definition and reuses its static HTML and resume plan across renders. */
export function prepareComponent(component: Component): PreparedComponent;
export function generateComponent(component: Component): GeneratedComponent;
export function renderComponent(component: Component, props: Record<string, WireValue>, options?: RenderOptions): RenderedComponent;
export function isResumable(component: Component): boolean;
export function escapeHtml(value: unknown): string;
export function encodeSnapshot(value: unknown): string;
export function validateShape(value: unknown, fields: readonly Field[], label?: string): Record<string, WireValue>;
