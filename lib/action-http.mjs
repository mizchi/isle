import { acceptsOrigin } from './origin.mjs';

export const actionResponse = (status, body) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export function actionRoute(basePath = '/__isle/') {
  if (typeof basePath !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)+$/.test(basePath)) throw new TypeError('Invalid action base path');
  return {
    matches: pathname => pathname.startsWith(basePath),
    parse(pathname) {
      if (!pathname.startsWith(basePath)) return null;
      const match = /^(action|validate)\/([^/]+)$/.exec(pathname.slice(basePath.length));
      return match ? { mode: match[1], name: match[2] } : null;
    },
  };
}

/** Platform-independent HTTP envelope. The executor only handles a checked POST route. */
export function createActionHttp(execute, { allowedOrigins, actionBasePath } = {}) {
  const route = actionRoute(actionBasePath);
  return async request => {
    const target = route.parse(new URL(request.url).pathname), allowed = acceptsOrigin(request, allowedOrigins);
    const headers = new Headers({ 'cache-control': 'no-store' });
    if (allowed && allowedOrigins) {
      headers.set('access-control-allow-origin', allowedOrigins === '*' ? '*' : request.headers.get('origin'));
      if (allowedOrigins !== '*') headers.set('vary', 'Origin');
    }
    const finish = response => {
      const result = new Response(response.body, response);
      for (const [key, value] of headers) result.headers.set(key, value);
      return result;
    };
    if (request.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403, headers });
      if (!target) return new Response(null, { status: 404, headers });
      if (request.headers.get('access-control-request-method') !== 'POST') return new Response(null, { status: 405, headers });
      const requested = (request.headers.get('access-control-request-headers') ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
      if (requested.some(value => value !== 'content-type')) return new Response(null, { status: 403, headers });
      headers.set('access-control-allow-methods', 'POST'); headers.set('access-control-allow-headers', 'content-type');
      headers.set('access-control-max-age', '600');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return finish(actionResponse(405, { ok: false, error: 'method_not_allowed' }));
    if (!target) return finish(actionResponse(404, { ok: false, error: 'unknown_action' }));
    if (!allowed) return finish(actionResponse(403, { ok: false, error: 'origin_denied' }));
    return finish(await execute(request, target));
  };
}
