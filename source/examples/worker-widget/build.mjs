import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'vite';
import { config } from './vite.config.mjs';
import { compileFile, requireIR } from '@isle/prototype/compiler';
import { tasks } from '../../benchmarks/dashboard/model.mjs';

await build({ ...config(), configFile: false });
await build({ ...config('standalone'), configFile: false });
const ir = requireIR(await compileFile(new URL('../../benchmarks/variants/isle/dashboard.isle', import.meta.url)));
const server = new URL('../../dist/worker-widget/server/', import.meta.url);
await mkdir(server, { recursive: true });
await writeFile(new URL('contracts.json', server), JSON.stringify({ schemas: ir.schemas, actions: ir.actions, taskIds: tasks.map(task => task.id) }) + '\n');
await writeFile(new URL('../../dist/worker-widget/client/_headers', import.meta.url), `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors *
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Access-Control-Allow-Origin: *

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/
  Cache-Control: no-cache

/isle.manifest.json
  Cache-Control: no-cache

/widget.js
  Cache-Control: no-cache

/widget.json
  Cache-Control: no-cache

/standalone/assets/*
  Cache-Control: public, max-age=31536000, immutable

/standalone/
  Cache-Control: no-cache

/standalone/widget.js
  Cache-Control: no-cache

/standalone/widget.json
  Cache-Control: no-cache

/standalone/isle.manifest.json
  Cache-Control: no-cache
`);
console.log('Built widget client assets and server-only action contracts.');
