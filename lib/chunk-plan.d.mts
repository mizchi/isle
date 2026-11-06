import type { GeneratedComponent } from './codegen.mjs';
import type { LoadingPolicy } from './code-contracts.d.ts';
export interface HandlerChunk {
  name: string;
  handlers: readonly GeneratedComponent['handlers'][number][];
}
/** Budget counts UTF-8 generated handler source before bundling/minification; zero disables packing. */
export function planHandlerChunks(components: readonly GeneratedComponent[], maxBytes?: number, policies?: ReadonlyMap<string, LoadingPolicy>): HandlerChunk[];
