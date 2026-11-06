import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build, createServer, preview } from 'vite';
import { examples } from '../examples/catalog.mjs';

const [command = 'list', name] = process.argv.slice(2);
if (!['list', 'dev', 'build', 'preview'].includes(command)) throw new Error('Usage: examples.mjs list|dev|build|preview [example]');
const selected = name ? examples.filter(example => example.id === name) : examples;
if (!selected.length) throw new Error(`Unknown example: ${name}. Run just examples-list.`);
if (command === 'list') {
  for (const example of selected) console.log(`${example.id.padEnd(20)} ${example.title} — ${example.run}`);
} else if (command === 'dev' && !name) {
  throw new Error('Choose an example: just example hello');
} else {
  for (const example of selected) {
    if (example.kind === 'layout') {
      if (command === 'dev') process.exitCode = spawnSync(process.execPath, ['tools/isle.mjs', 'layout', 'examples/layout-contracts/app.isle', 'examples/layout-contracts/layout.json'], { stdio: 'inherit' }).status ?? 1;
      continue;
    }
    if (example.kind === 'widget') {
      if (name) throw new Error(`Use ${example.run} and ${example.check}; widget distributions have their own host adapter.`);
      continue;
    }
    const configFile = fileURLToPath(new URL(`../examples/${example.id}/vite.config.mjs`, import.meta.url));
    const outDir = fileURLToPath(new URL(`../dist/examples/${example.id}/`, import.meta.url));
    if (command === 'build' || command === 'preview') {
      await build({ configFile, build: { outDir, emptyOutDir: true } });
      if (command === 'preview') {
        const server = await preview({ configFile, build: { outDir }, preview: { port: example.port + 200, strictPort: true } });
        server.printUrls();
      }
    }
    else { const server = await createServer({ configFile }); await server.listen(); server.printUrls(); }
  }
}
