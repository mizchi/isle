import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { variants } from './scenario.mjs';
const root = fileURLToPath(new URL('../variants/', import.meta.url));
for (const id of process.argv.length > 2 ? process.argv.slice(2) : variants) {
  if (!variants.includes(id)) throw new Error(`Unknown TodoMVC variant: ${id}`);
  for (const ssr of id === 'isle' ? [false] : [false, true]) {
    const args = ['exec', 'vite', 'build', '--config', 'vite.todomvc.config.mjs', ...(ssr ? ['--ssr', './src/todomvc/entry.ssr.tsx'] : [])];
    const result = spawnSync('pnpm', args, { cwd: `${root}/${id}`, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
