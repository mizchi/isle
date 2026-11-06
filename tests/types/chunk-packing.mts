import type { IsleOptions } from '../../lib/vite.mjs';
import { planHandlerChunks } from '../../lib/chunk-plan.mjs';
const options: IsleOptions = { entry: 'app.isle', mounts: [], handlerChunkBytes: 1024 };
planHandlerChunks([], options.handlerChunkBytes);
// @ts-expect-error Chunk byte budgets are numeric.
planHandlerChunks([], '1024');
// @ts-expect-error This is a byte budget, not a loading policy.
const invalid: IsleOptions = { entry: 'app.isle', mounts: [], handlerChunkBytes: 'preload' };
