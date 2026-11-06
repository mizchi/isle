import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../variants/', import.meta.url));
const variants = process.argv.slice(2);
for (const id of variants.length ? variants : ['isle', 'qwik', 'qwik-next', 'preact']) {
  if (!['isle', 'qwik', 'qwik-next', 'preact'].includes(id)) throw new Error(`Unknown dashboard variant: ${id}`);
  for (const ssr of id === 'isle' ? [false] : [false, true]) {
    const args = ['exec', 'vite', 'build', '--config', 'vite.dashboard.config.mjs', ...(ssr ? ['--ssr', './src/dashboard/entry.ssr.tsx'] : [])];
    const result = spawnSync('pnpm', args, { cwd: `${root}/${id}`, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
