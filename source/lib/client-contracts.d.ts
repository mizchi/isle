/** Independent of the MoonBit ProgramIR v1. DOM, snapshot and handlers deploy together. */
import type { Primitive, WireValue, ValueType } from './contracts.d.ts';
import type { CodeRef, LoadingPolicy } from './code-contracts.d.ts';
import type { ResourceOwner } from '../runtime/resource-owner.mjs';
import type { RequestOptions } from '../runtime/request.mjs';
export type ResumeSnapshot = [version: 2, schemaId: string, scopeId: string, values: WireValue[]];
export type SetSlot = (index: number, value: WireValue) => void;
/** Optional UTF-16 prefix/suffix lengths preserve static text within the same Text node. */
export type TextPatch = (index: number, value: string, prefix?: number, suffix?: number) => void;
export type AttributePatch = (index: number, name: string, value: Primitive) => void;
export type Remote = (name: string, input: Record<string, Primitive>) => Promise<Record<string, Primitive>>;
export type ProfilePhase = 'interaction' | 'loader-queue' | 'runtime' | 'queue' | 'code' | 'restore' | 'resource-code' | 'resource-setup' | 'styles' | 'run';
export type ProfileStatus = 'ok' | 'cancelled' | 'error';
export interface InteractionTiming {
  begin(phase: ProfilePhase, extra?: { url?: string; cached?: boolean }): (status?: ProfileStatus) => void;
  sync<T>(phase: ProfilePhase, operation: () => T): T;
  measure<T>(phase: ProfilePhase, operation: () => T | Promise<T>, extra?: { url?: string; cached?: boolean }, status?: (value: T) => ProfileStatus): Promise<T>;
  finish(status: ProfileStatus): void;
}
export interface ProfileDetail {
  handlerId: string; scopeId: string; event: string; invocation: number;
  phase: ProfilePhase; status: ProfileStatus; url?: string; cached?: boolean;
}
export type EventPayload = { type: string; value?: string; checked?: boolean; invalid?: boolean; validationMessage?: string;
  /** Internal schema-form dispatch, never part of the wire snapshot. */ form?: import('../runtime/form-events.mjs').CapturedFormEvent;
  /** Internal asynchronous framework error hook. */ reportError?: (error: Error) => void;
  /** Internal source-control identity; never serialized or exposed to source expressions. */ element?: Element;
  /** Internal region bridge; the last function stages a prepared DOM commit. */ region?: [Element, string, (commit: () => void) => void];
  /** Local capability supplied after this component's resource setup. Never serialized. */ resources?: ResourceOwner;
  /** Internal; profile builds only. */ timing?: InteractionTiming };
/** Positional ABI: lexical parameter names can be independently mangled in every chunk. */
export type RunHandler = (values: WireValue[], set: SetSlot, text: TextPatch | undefined,
  attribute: AttributePatch | undefined, remote: Remote | undefined, event: EventPayload) => void | Promise<void>;
export interface ClientResourceContext { readonly root: HTMLElement; readonly owner: ResourceOwner; readonly id: string }
/** Synchronous registration only; async work belongs to owner.acquire. */
export type ClientResourceSetup = (context: ClientResourceContext) => undefined;
export interface ClientResourceModule { setup: ClientResourceSetup }
export type ClientRegistry = [schemas: Record<string, ValueType[]>, events: string[],
  handlers: Record<string, CodeRef<RunHandler>>, actions: string[], baseURL: string,
  /** Production eager entries only. Compiled callable references, never serialized state. */
  prepared?: Record<string, RunHandler> | null,
  /** Lazy setup entries indexed by validated component snapshot schema. */
  resources?: Record<string, CodeRef<ClientResourceSetup>>];
export interface ResumeMetrics { restores: number; loads: number; completed: number; cancelled: number; errors: number }
export type ResumeRoot = Document | ShadowRoot;
export interface LoaderOptions extends RequestOptions { onError?: (error: Error) => void }
export interface ResumeController {
  metrics?: ResumeMetrics;
  /** Available in resource-capable builds; imports code and validates this owner lazily. */
  resources?(scopeId: string): Promise<ResourceOwner>;
  dispose(scopeId: string): void;
  settled(): Promise<void>;
  close(): void;
}
/** Engine interface consumed by the loader; no DOM event listeners are installed here. */
export interface ResumedController extends ResumeController {
  dispatch(root: Element, element: Element, scopeId: string, handlerId: string, payload: EventPayload): void;
}
export interface LazyResumeModule {
  registry: ClientRegistry;
  resume(root: ResumeRoot, registry: ClientRegistry, options: LoaderOptions & { metrics?: ResumeMetrics }): ResumedController;
}
/** Optional template[data-isle-load="1"] contains inert modulepreload links with space-separated
 * data-isle-code handler IDs. Only a live dispatched entry activates its links; no state is read.
 * Without this HTML metadata, ordinary dynamic import remains the loading fallback. */
export type LoadIslands = (root: ResumeRoot, load: () => Promise<LazyResumeModule>, events: string[], options?: LoaderOptions) => ResumeController;
export type RenderMode = 'resume' | 'ssr';
export interface IsleMount {
  component: string; props: Record<string, WireValue>; label: string; scopeId?: string; mode?: RenderMode; loading?: LoadingPolicy;
}
