export interface RequestOptions {
  actionBaseURL?: string;
  requestCredentials?: RequestCredentials;
}
export type ActionRequest = (mode: 'action' | 'validate', name: string, input: unknown, signal?: AbortSignal) => Promise<Response>;
export function createRequester(document: Document, options?: RequestOptions): ActionRequest;
