/** A local live-resource read capability. Never serializable in a resume snapshot. */
export interface OwnedResource<T> {
  readonly state: 'pending' | 'ready' | 'failed' | 'disposed';
  readonly error: unknown;
  /** Throws while pending/failed or after this owner has been disposed. */
  read(): T;
}
export type ReleaseResource<T> = (value: T) => void | PromiseLike<void>;
export interface ResourceOwnerOptions {
  /** The mounting adapter owns this lifetime signal. */
  signal?: AbortSignal;
  /** Cleanup failures are reported once and retained in errors. Initialization errors belong to the handle. */
  onError?: (error: unknown) => void;
}
export interface ResourceOwner {
  readonly disposed: boolean;
  readonly signal: AbortSignal;
  readonly errors: readonly unknown[];
  /** Transfers an already-acquired value, including late arrivals, into this owner. */
  own<T>(value: T, release: ReleaseResource<T>): OwnedResource<T>;
  /** An initializer must clean up partially acquired values if it rejects before returning them. */
  acquire<T>(initialize: (signal: AbortSignal) => T | PromiseLike<T>, release: ReleaseResource<T>): OwnedResource<T>;
  fork(): ResourceOwner;
  /** Synchronously revokes the entire subtree, signals abort, then initiates cleanup. */
  dispose(): boolean;
  /** Joins outstanding acquisition and cleanup. Can remain pending if a host adapter never settles. */
  settled(): Promise<void>;
}
export function createResourceOwner(options?: ResourceOwnerOptions): ResourceOwner;

export type {ClientResourceContext,ClientChannelContext,ClientResourceSetup,ResourceTask,ResourceChannel} from '../lib/client-contracts.d.ts';
