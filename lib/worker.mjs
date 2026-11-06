import { createActionHandler } from './server.mjs';
import { actionRoute } from './action-http.mjs';

/** Cloudflare adaptation only; the shared action handler owns HTTP routing and CORS. */
export function createWorkerHandler(ir, host, options = {}) {
  const actions = createActionHandler(ir, host, options), route = actionRoute(options.actionBasePath);
  return { async fetch(request, env) {
    if (route.matches(new URL(request.url).pathname)) return actions(request);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    return env.ASSETS.fetch(request);
  } };
}
