import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { compileFile, requireIR } from '../lib/compiler.mjs';
import { createActionHandler } from '../lib/server.mjs';
import { host } from '../examples/counter/host.mjs';
import { shell } from './shared/scenario.mjs';

export const variantIds = ['isle', 'qwik', 'qwik-next', 'preact'];
const root = fileURLToPath(new URL('.', import.meta.url));
const contentType = path => path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json' : path.endsWith('.css') ? 'text/css' : 'text/html';

export async function createBenchmarkServer({ port = 0 } = {}) {
  const renderers = Object.fromEntries(await Promise.all(variantIds.filter(id => id !== 'isle').map(async id =>
    [id, (await import(pathToFileURL(`${root}/variants/${id}/dist/server/entry.ssr.js`).href)).render])));
  const templates = Object.fromEntries(await Promise.all(['isle', 'preact'].map(async id =>
    [id, await readFile(`${root}/dist/${id}/client/index.html`, 'utf8')])));
  const action = createActionHandler(requireIR(await compileFile(`${root}/variants/isle/app.isle`)), host);
  const errors = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname.startsWith('/__isle/action/')) {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const result = await action(new Request(url, { method: request.method, headers: request.headers,
          ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }) }));
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(await result.text());
        return;
      }
      const [, id, ...parts] = url.pathname.split('/');
      if (!variantIds.includes(id) || !['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(404); response.end('Not found'); return;
      }
      let body, type;
      if (!parts.join('')) {
        const app = id === 'isle' ? null : await renderers[id]();
        body = Buffer.from(id === 'isle' ? templates.isle : id === 'preact'
          ? templates.preact.replace('<!--preact:ssr-->', app) : shell(app));
        type = 'text/html';
      } else {
        // Qwik 1 writes its configured base into the output directory too.
        const assets = resolve(root, `dist/${id}/client`, id === 'qwik' ? 'qwik' : '');
        const file = resolve(assets, parts.join('/'));
        if (!file.startsWith(`${assets}${sep}`)) { response.writeHead(403); response.end(); return; }
        body = await readFile(file);
        type = contentType(file);
      }
      const compressed = request.headers['accept-encoding']?.includes('gzip');
      const payload = compressed ? gzipSync(body, { level: 6 }) : body;
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8`,
        'cache-control': type === 'text/html' || url.pathname.endsWith('/isle.manifest.json') ? 'no-store' : 'public, max-age=31536000, immutable',
        'vary': 'accept-encoding', ...(compressed ? { 'content-encoding': 'gzip' } : {}), 'content-length': payload.length });
      response.end(request.method === 'HEAD' ? undefined : payload);
    } catch (error) {
      errors.push(error.message);
      response.writeHead(error.code === 'ENOENT' ? 404 : 500); response.end(error.message);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, errors,
    close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await createBenchmarkServer({ port: Number(process.env.PORT ?? 4180) });
  console.log(variantIds.map(id => `${id}: ${app.url}/${id}/`).join('\n'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(); });
}
