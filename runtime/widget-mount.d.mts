import type { LoaderOptions, ResumeController, ResumeRoot } from '../lib/client-contracts.d.ts';
import type { RuntimeIdentity } from './runtime-identity.mjs';
export interface WidgetModule { readonly runtimeIdentity: RuntimeIdentity; mount(root: ResumeRoot, options?: LoaderOptions): ResumeController }
export interface WidgetMountOptions { signal?: AbortSignal; onError?: (error: Error) => void }
/** One active mount per root. Caller owns dimensions; close leaves inert SSR DOM in place. */
export function mountWidget(root: ShadowRoot, descriptorURL: string, options?: WidgetMountOptions): Promise<ResumeController>;
