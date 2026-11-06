import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { setTimeout as pause } from 'node:timers/promises';
import { compileFile, requireIR } from '../../lib/compiler.mjs';
import { createActionHandler } from '../../lib/server.mjs';
import { tasks } from './model.mjs';
import { shell } from './shell.mjs';

export const variants = ['isle', 'qwik', 'qwik-next', 'preact'];
const root = fileURLToPath(new URL('..', import.meta.url));
const contentType = path => path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json' : path.endsWith('.css') ? 'text/css' : 'text/html';
async function files(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
    const path = resolve(directory, entry.name); return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}

/** Cache/pre-render every implementation equally. This benchmark measures the browser, not SSR CPU. */
export async function createDashboardServer({ port = 0, delay = 20 } = {}) {
  const routes = new Map(), errors = [], commits = { savePlan: 0, createProject: 0 }, plans = new Map();
  function cache(path, body, type) {
    body = Buffer.from(body);
    routes.set(path, { body, gzip: gzipSync(body, { level: 6 }), type });
  }
  for (const id of variants) {
    const base = `${root}/dist/dashboard/${id}/client`, assets = id === 'qwik' ? `${base}/dashboard/qwik` : base;
    for (const file of await files(assets)) cache(`/dashboard/${id}/${relative(assets, file).split(sep).join('/')}`, await readFile(file), contentType(file));
    let html;
    if (id === 'isle') html = await readFile(`${base}/dashboard.html`, 'utf8');
    else {
      const { render } = await import(pathToFileURL(`${root}/variants/${id}/dist/dashboard/server/entry.ssr.js`).href);
      const app = await render();
      html = id === 'preact' ? (await readFile(`${base}/dashboard.html`, 'utf8')).replace('<!--preact:ssr-->', app) : shell(app);
    }
    cache(`/dashboard/${id}/`, html, 'text/html');
  }
  const action = createActionHandler(requireIR(await compileFile(`${root}/variants/isle/dashboard.isle`)), {
    context: () => ({ subject: 'planner', tenant: 'benchmark' }),
    policies: { 'policy.planEditor': (_, id) => tasks.some(task => task.id === id), 'policy.projectCreator': () => true },
    validators: { 'projects.available': { effects: ['db.read'], validate: async ({ input }) => { await pause(delay); return input.project === 'Taken project' ? [{ field: 'project', code: 'taken' }] : []; } } },
    operations: {
      'plans.save': { policy: 'policy.planEditor', effects: ['db.write'], prepare: () => pause(delay), commit: ({ permit, args }) => {
        commits.savePlan++; plans.set(permit.target, args[1]); return { hours: args[1] };
      } },
      'projects.create': { policy: 'policy.projectCreator', effects: ['db.write'], prepare: () => pause(delay), commit: ({ args }) => {
        commits.createProject++; return { project: args[1] };
      } },
    },
  });
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (/^\/__isle\/(action|validate)\//.test(url.pathname)) {
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        const result = await action(new Request(url, { method: request.method, headers: request.headers,
          ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: Buffer.concat(chunks) }) }));
        response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text()); return;
      }
      const cached = routes.get(url.pathname);
      if (!cached || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end('Not found'); return; }
      const compressed = request.headers['accept-encoding']?.includes('gzip'), body = compressed ? cached.gzip : cached.body;
      response.writeHead(200, { 'content-type': `${cached.type}; charset=utf-8`, 'content-length': body.length, vary: 'accept-encoding',
        'cache-control': cached.type === 'text/html' ? 'no-store' : 'public, max-age=31536000, immutable',
        ...(compressed ? { 'content-encoding': 'gzip' } : {}) });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) { errors.push(error.message); response.writeHead(500); response.end('Dashboard server error'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, routes, errors, commits, delay,
    reset() { commits.savePlan = 0; commits.createProject = 0; plans.clear(); },
    close: () => new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await createDashboardServer({ port: Number(process.env.PORT ?? 4193) });
  console.log(variants.map(id => `${id}: ${server.url}/dashboard/${id}/`).join('\n'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(); });
}
