import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const variants = process.argv.slice(2);
for (const variant of variants.length ? variants : ['isle', 'qwik', 'qwik-next', 'preact']) {
  if (!['isle', 'qwik', 'qwik-next', 'preact'].includes(variant)) throw new Error(`Unknown variant ${variant}`);
  for (const ssr of variant === 'isle' ? [false] : [false, true]) {
    console.log(`\nBuilding ${variant} (${ssr ? 'server' : 'client'})`);
    const args = ['exec', 'vite', 'build', ...(ssr ? ['--ssr', './src/entry.ssr.tsx'] : [])];
    const result = spawnSync('pnpm', args, { cwd: `${root}/benchmarks/variants/${variant}`, stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' } });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
