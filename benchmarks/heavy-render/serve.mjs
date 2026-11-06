import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { projectRoot, readBuilds } from './build.mjs';

async function files(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => {
    const path = resolve(directory, entry.name); return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}

/** Pre-read/compress assets before measurement; SSR and server compression CPU are excluded. */
export async function createHeavyServer(cases, { port = 0 } = {}) {
  const routes = new Map(), errors = [];
  for (const entry of cases) {
    const directory = resolve(projectRoot, entry.outDir);
    for (const file of await files(directory)) {
      const name = relative(directory, file).replaceAll('\\', '/'), body = await readFile(file);
      const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : 'text/html';
      const item = { body, gzip: gzipSync(body, { level: 6 }), type };
      routes.set(`/heavy-render/${entry.id}/${name}`, item);
      if (name === 'index.html') routes.set(`/heavy-render/${entry.id}/`, item);
    }
  }
  const server = createServer((request, response) => {
    try {
      const path = new URL(request.url, `http://${request.headers.host}`).pathname;
      const item = routes.get(path);
      if (!item || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end('Not found'); return; }
      const compressed = request.headers['accept-encoding']?.includes('gzip'), body = compressed ? item.gzip : item.body;
      response.writeHead(200, { 'content-type': `${item.type}; charset=utf-8`, 'content-length': body.length,
        'cache-control': item.type === 'text/html' ? 'no-store' : 'public,max-age=31536000,immutable', vary: 'accept-encoding',
        ...(compressed ? { 'content-encoding': 'gzip' } : {}) });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) { errors.push(error.message); response.writeHead(500); response.end('Heavy render server error'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, routes, errors,
    close: () => new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await createHeavyServer(await readBuilds(), { port: 4195 });
  console.log(`${server.url}/heavy-render/4096/`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(); });
}
