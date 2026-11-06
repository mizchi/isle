import type { ProgramIR, ServerHost } from './contracts.d.ts';
import type { ActionHandlerOptions } from './server.mjs';
export interface WorkerBindings {
  ASSETS: { fetch(request: Request): Promise<Response> };
}
export interface WorkerHandler {
  fetch(request: Request, env: WorkerBindings): Promise<Response>;
}
/** Standard Request/Response adapter; no filesystem, compiler or Node compatibility at runtime. */
export function createWorkerHandler(ir: Pick<ProgramIR, 'schemas' | 'actions'>, host: ServerHost, options?: ActionHandlerOptions): WorkerHandler;
