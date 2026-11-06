// Node adapter example. Core RPC depends only on standard Request/Response.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import contracts from '../../dist-portable-widget/server/contracts.json' with { type: 'json' };
import { createActionHandler } from '@isle/prototype/server';

const actionBasePath = '/portable/api/actions/';
const handle = createActionHandler(contracts, {
  context: () => ({ subject: 'public-demo', tenant: 'portable' }),
  policies: { 'policy.documentEditor': (context, id) => context.tenant === 'portable' && id === 'portable-demo' },
  operations: { 'documents.rename': { policy: 'policy.documentEditor', effects: ['db.write'], commit: ({ args }) => ({ id: 'portable-demo', title: args[1] }) } },
}, { allowedOrigins: '*', actionBasePath });
const client = resolve(fileURLToPath(new URL('../../dist-portable-widget/client/', import.meta.url)));
const server = createServer(async (request, response) => {
  const origin = `http://${request.headers.host}`, url = new URL(request.url, origin);
  if (url.pathname.startsWith(actionBasePath)) {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const wire = new Request(url, { method: request.method, headers: request.headers, ...(request.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
    const result = await handle(wire);
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text()); return;
  }
  try {
    if (!['GET', 'HEAD'].includes(request.method) || !url.pathname.startsWith('/portable/')) throw new Error('Not found');
    const path = decodeURIComponent(url.pathname.slice('/portable/'.length)) || 'index.html';
    const file = resolve(client, path);
    if (!file.startsWith(client + sep)) throw new Error('Not found');
    const body = await readFile(file);
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json' : 'text/html';
    response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'access-control-allow-origin': '*', 'cache-control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(Number(process.env.PORT ?? 8793), '127.0.0.1', () => console.log(`Portable widget: http://127.0.0.1:${server.address().port}/portable/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit()));
