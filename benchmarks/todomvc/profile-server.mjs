import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createTodoServer, files } from './serve.mjs';

export const cases = [
  { id: 'production', target: 'todomvc' },
  { id: 'no-hints', target: 'todomvc', withoutHints: true },
  { id: 'ungrouped', target: 'todomvc-ungrouped' },
  { id: 'auto', target: 'todomvc-auto' },
  { id: 'profile', target: 'todomvc-profile', profile: true },
  { id: 'profile-no-hints', target: 'todomvc-profile', withoutHints: true, profile: true },
];

export async function createProfileServer() {
  const server = await createTodoServer(), maps = new Map(), manifests = new Map();
  function cache(path, body, type) {
    body = Buffer.from(body); server.routes.set(path, { body, type, gzip: gzipSync(body, { level: 6 }) });
  }
  for (const target of new Set(cases.map(row => row.target))) {
    const directory = fileURLToPath(new URL(`../dist/${target === 'todomvc' ? 'todomvc-inspect' : target}/isle/client/`, import.meta.url));
    const manifest = JSON.parse(await readFile(directory + 'isle.manifest.json', 'utf8')); manifests.set(target, manifest);
    for (const file of await files(directory)) {
      const path = `/${target}/isle/${relative(directory, file).replaceAll('\\', '/')}`;
      cache(path, await readFile(file), file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') || file.endsWith('.map') ? 'application/json' : 'text/html');
      if (file.endsWith('.js.map')) maps.set(path.slice(0, -4), JSON.parse(await readFile(file, 'utf8')));
    }
    cache(`/${target}/isle/`, await readFile(directory + 'todomvc.html'), 'text/html');
  }
  for (const row of cases) {
    row.path = `/analysis/${row.id}/`;
    let html = server.routes.get(`/${row.target}/isle/`).body.toString();
    if (row.withoutHints) html = html.replace(/<template data-isle-load="1">[\s\S]*?<\/template>/, '');
    cache(row.path, html, 'text/html');
  }
  return { ...server, maps, manifests };
}
