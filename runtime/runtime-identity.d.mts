export type WidgetRuntimeMode = 'shared' | 'standalone';
export interface RuntimeIdentity { readonly version: string; readonly mode: WidgetRuntimeMode }
export const runtimeIdentity: RuntimeIdentity;
export function validateRuntimeVersion(version: string): string;
export function assertRuntimeIdentity(actual: unknown, expected?: RuntimeIdentity): RuntimeIdentity;
