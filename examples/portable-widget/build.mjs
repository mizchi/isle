import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'vite';
import { config, alternateVersion } from './vite.config.mjs';
import { compileFile, requireIR } from '@isle/prototype/compiler';

await build({ ...config(), configFile: false });
await build({ ...config(true), configFile: false });
await build({ ...config(false, { distribution: 'other', runtimeVersion: alternateVersion }), configFile: false });
await build({ ...config(false, { distribution: 'standalone', runtime: 'standalone' }), configFile: false });
await build({ ...config(false, { distribution: 'standalone-other', runtime: 'standalone', runtimeVersion: alternateVersion }), configFile: false });
await build({ ...config(true, { distribution: 'standalone-static', runtime: 'standalone' }), configFile: false });
await build({ ...config(false, { distribution: 'standalone-collision', runtime: 'standalone', runtimeVersion: alternateVersion, tagName: 'demo-counter-standalone' }), configFile: false });
const ir = requireIR(await compileFile(new URL('../counter/app.isle', import.meta.url)));
const server = new URL('../../dist-portable-widget/server/', import.meta.url);
await mkdir(server, { recursive: true });
await writeFile(new URL('contracts.json', server), JSON.stringify({ schemas: ir.schemas, actions: ir.actions }) + '\n');
