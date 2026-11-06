import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSiteServer } from '../site/serve.mjs';
const directory = resolve('dist/site');
const { base } = JSON.parse(await readFile(resolve(directory, 'site.json'), 'utf8'));
const port = Number(process.env.SITE_PORT ?? 4330);
const server = createSiteServer({ directory, base });
server.listen(port, '127.0.0.1', () => console.log(`Isle site: http://127.0.0.1:${port}${base}`));
