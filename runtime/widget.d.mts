/** Define the autonomous custom element once per Window registry. */
export function defineWidget(tag?: string): void;
export type { WidgetDescriptor } from './widget-contract.mjs';
export { mountWidget } from './widget-mount.mjs';
export { sharedRuntimeInfo } from './shared-runtime.mjs';
export { runtimeIdentity } from './runtime-identity.mjs';
export type { WidgetModule, WidgetMountOptions } from './widget-mount.mjs';
