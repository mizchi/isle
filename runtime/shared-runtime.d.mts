export interface SharedRuntime { readonly abi: string; readonly version: string }
export interface SharedRuntimeOptions {
  version: string;
  exports?: readonly string[];
  /** Defaults to globalThis. A registry belongs to one JavaScript realm. */
  realm?: object;
}
export interface SharedRuntimeInfo { version: string; abi: string; status: 'loading' | 'ready' }
export function claimSharedRuntime(version: string, abis: readonly string[], options?: { realm?: object }): void;
export function acquireSharedRuntime<T extends SharedRuntime>(abi: string, load: () => T | Promise<T>, options: SharedRuntimeOptions): Promise<T>;
export function sharedRuntimeInfo(realm?: object): SharedRuntimeInfo[];
