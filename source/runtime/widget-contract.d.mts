import type { RuntimeIdentity } from './runtime-identity.mjs';
export interface WidgetContent {
  version: 2;
  runtime: RuntimeIdentity;
  /** Compiler-owned inert HTML, scoped CSS and JSON snapshots. */
  html: string;
  /** Absolute or descriptor-relative HTTP(S) action directory. Default: ./__isle/. */
  actions?: string;
}
/** null means HTML only, with no module preloads. Dynamic code stays at the provider. */
export type WidgetDescriptor = WidgetContent & ({ module: null; preload: []; preloadStyles?: [] } | { module: string; preload: string[]; preloadStyles?: string[] });
export type ResolvedWidgetDescriptor = WidgetDescriptor & { actions: string };
export type WidgetSource = { descriptorURL: string; src?: never } | { src: string; descriptorURL?: never };
export function widgetURL(value: string, base?: string | URL): URL;
export function widgetSize(width: number, height: number): void;
export function widgetTagName(name: string): string;
export function resolveWidgetSource(source: WidgetSource, base?: string): string;
export function resolveWidgetDescriptor(value: unknown, source: string, expectedRuntime?: RuntimeIdentity): ResolvedWidgetDescriptor;
