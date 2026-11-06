import type { ProgramIR, ServerHost } from './contracts.d.ts';
export interface OriginOptions {
  /** Explicit public cookie-free access or a list of exact publisher origins. Default: same-origin. */
  allowedOrigins?: '*' | readonly string[];
}
export interface ActionHandlerOptions extends OriginOptions {
  /** Absolute pathname directory; defaults to /__isle/. Must end with a slash. */
  actionBasePath?: string;
}
export function createActionHandler(ir: Pick<ProgramIR, 'schemas' | 'actions'>, host: ServerHost, options?: ActionHandlerOptions): (request: Request) => Promise<Response>;
