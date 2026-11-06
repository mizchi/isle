import { createServer } from 'node:http';
import { renderHostPage } from '../examples/worker-widget/host-page.mjs';
const html = renderHostPage(process.argv[2] ?? 'http://127.0.0.1:8787/', { runtime: process.argv[3] ?? 'shared' });
const server = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(html);
});
server.listen(8788, '127.0.0.1', () => console.log('Publisher demo: http://localhost:8788/'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit()));
