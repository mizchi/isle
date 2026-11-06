import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { shell, variants } from './scenario.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function files(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
    const path = resolve(directory, entry.name); return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}
export async function createTodoServer({ port = 0, quality = false } = {}) {
  const routes = new Map(), errors = [];
  const cache = (path, body, type) => {
    body = Buffer.from(body); routes.set(path, { body, type, gzip: gzipSync(body, { level: 6 }) });
  };
  for (const id of variants) {
    const base = `${root}/dist/todomvc/${id}/client`, assets = id === 'qwik' ? `${base}/todomvc/qwik` : base;
    for (const file of await files(assets)) cache(`/todomvc/${id}/${relative(assets, file).replaceAll('\\', '/')}`, await readFile(file), file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html');
    let html;
    if (id === 'isle') html = await readFile(`${base}/todomvc.html`, 'utf8');
    else {
      const { render } = await import(pathToFileURL(`${root}/variants/${id}/dist/todomvc/server/entry.ssr.js`).href);
      const app = await render();
      if (id === 'preact') html = (await readFile(`${base}/todomvc.html`, 'utf8')).replace('<!--preact:ssr-->', app);
      else {
        const manifest = JSON.parse(await readFile(`${assets}/q-manifest.json`, 'utf8'));
        const host = Object.entries(manifest.bundles).find(([, bundle]) => bundle.origins?.includes('src/todomvc/host.mjs'))?.[0];
        if (!host) throw new Error(`Missing ${id} host entry`);
        html = shell(app, `<script type="module" src="/todomvc/${id}/build/${host}"></script>`);
      }
    }
    cache(`/todomvc/${id}/`, html, 'text/html');
    if (quality && id === 'isle') {
      const seed = [{ id: 1, title: 'Write tests', completed: false }, { id: 2, title: 'Ship demo', completed: false }];
      cache('/todomvc/isle/quality/', html.replace('</head>', `<script>localStorage.setItem('todos-isle',${JSON.stringify(JSON.stringify(seed))})</script></head>`), 'text/html');
    }
  }
  const server = createServer((request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname, entry = routes.get(path);
      if (!entry || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end('Not found'); return; }
      const gzip = request.headers['accept-encoding']?.includes('gzip'), body = gzip ? entry.gzip : entry.body;
      response.writeHead(200, { 'content-type': `${entry.type}; charset=utf-8`, 'content-length': body.length, vary: 'accept-encoding', 'cache-control': entry.type === 'text/html' ? 'no-store' : 'public,max-age=31536000,immutable', ...(gzip ? { 'content-encoding': 'gzip' } : {}) });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) { errors.push(error.message); response.writeHead(500); response.end('TodoMVC server error'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, routes, errors, close: () => new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await createTodoServer({ port: Number(process.env.PORT ?? 4332) });
  console.log(variants.map(id => `${id}: ${server.url}/todomvc/${id}/`).join('\n'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(); });
}
