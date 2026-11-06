import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { normalizeBase } from './config.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.tgz': 'application/gzip', '.xml': 'application/xml', '.wasm':'application/wasm' };
export function createSiteServer({ directory, base = '/isle/' }) {
  const root = resolve(directory); base = normalizeBase(base);
  return createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const url = new URL(request.url, 'http://localhost');
      if (base !== '/' && url.pathname === base.slice(0, -1)) { response.writeHead(308, { location: base }); response.end(); return; }
      if (!url.pathname.startsWith(base)) { response.writeHead(404); response.end('Not found'); return; }
      const path = decodeURIComponent(url.pathname.slice(base.length));
      let file = resolve(root, path || 'index.html');
      if (!file.startsWith(root + sep)) { response.writeHead(404); response.end('Not found'); return; }
      try { if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html'); } catch {}
      let body;
      try { body = await readFile(file); } catch { response.writeHead(404); response.end('Not found'); return; }
      response.writeHead(200, { 'content-type': path.startsWith('source/') && !['.png', '.svg'].includes(extname(file)) ? 'text/plain; charset=utf-8' : types[extname(file)] ?? 'application/octet-stream', 'content-length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(400); response.end('Bad request'); }
  });
}
