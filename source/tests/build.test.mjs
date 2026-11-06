import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { eagerLoad, planCodeLoad } from '../runtime/manifest.mjs';

test('production build emits native lazy chunks, valid manifest and only used capabilities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-build-'));
  try {
    const entry = join(directory, 'app.isle');
    await writeFile(entry, 'export client component Counter({ initial }: { initial: number }) { state count = initial; <button>on click { count += 1; }{count}</button> }');
    await writeFile(join(directory, 'index.html'), '<!doctype html><html><head></head><body><!--isle:ssr--></body></html>');
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    const compile = () => build({ configFile: false, root: directory, base: './', logLevel: 'silent',
      plugins: [isle({ entry, mounts: [{ component: 'Counter', props: { initial: 37 }, label: 'Counter' }] })],
      build: { manifest: true } });
    const output = await compile();
    const chunks = output.output.filter(item => item.type === 'chunk');
    const main = chunks.find(chunk => chunk.facadeModuleId?.endsWith('index.html'));
    const runtime = chunks.find(chunk => chunk.facadeModuleId?.includes('isle:resume'));
    const handler = chunks.find(chunk => chunk.facadeModuleId?.includes('isle-handler'));
    assert.ok(runtime, 'runtime is emitted as a separate lazy chunk');
    assert.match(handler.code, /\bas run\b/);
    assert.match(main.code, /import\(/);
    assert.ok(main.code.includes(runtime.fileName.split('/').at(-1)), 'runtime URL matches emitted hash');
    assert.ok(runtime.code.includes(handler.fileName.split('/').at(-1)), 'handler URL matches emitted hash');
    assert.ok(!main.code.includes('JSON.parse'), 'loader never expands snapshots');
    for (const text of ['MutationObserver', 'modulepreload', 'vite:preloadError', 'Unregistered remote', 'fetch(', 'disabled', 'restores', '_values', '_queue', 'replaceData']) {
      assert.ok(!runtime.code.includes(text), `unneeded code remains: ${text}`);
    }
    const manifest = JSON.parse(await readFile(join(directory, 'dist/.vite/manifest.json'), 'utf8'));
    const generated = new Set(output.output.map(item => item.fileName));
    for (const item of Object.values(manifest)) {
      for (const asset of item.assets ?? []) assert.ok(generated.has(asset), `manifest references absent file: ${asset}`);
    }
    const lazy = manifest['index.html'].dynamicImports;
    assert.equal(lazy.length, 1);
    assert.equal(manifest[lazy[0]].file, runtime.fileName);
    assert.equal(manifest[manifest[lazy[0]].dynamicImports[0]].file, handler.fileName);
    const codeManifest = JSON.parse(await readFile(join(directory, 'dist/isle.manifest.json'), 'utf8'));
    const counterRef = codeManifest.references['Counter.h0'];
    assert.equal(counterRef.chunk, handler.fileName);
    assert.deepEqual(counterRef.ref.slice(1), ['run', [0]]);
    assert.deepEqual(counterRef.requires, ['isle:resume']);
    assert.deepEqual(codeManifest.loading, { eager: [], preload: [] });
    await eagerLoad(codeManifest, { baseURL: pathToFileURL(join(directory, 'dist/isle.manifest.json')), ids: ['Counter.h0'] });
    await writeFile(entry, (await readFile(entry, 'utf8')).replace('count += 1', 'count += 2'));
    const next = await compile();
    const nextMain = next.output.find(chunk => chunk.type === 'chunk' && chunk.facadeModuleId?.endsWith('index.html'));
    const nextHandler = next.output.find(chunk => chunk.type === 'chunk' && chunk.facadeModuleId?.includes('isle-handler'));
    assert.notEqual(nextHandler.fileName, handler.fileName, 'handler code changes its content hash');
    assert.notEqual(nextMain.fileName, main.fileName, 'parent hash follows changed handler URL');
    const nextRuntime = next.output.find(chunk => chunk.type === 'chunk' && chunk.facadeModuleId?.includes('isle:resume'));
    assert.ok(nextMain.code.includes(nextRuntime.fileName.split('/').at(-1)));
    assert.ok(nextRuntime.code.includes(nextHandler.fileName.split('/').at(-1)));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const kind of ['forced-ssr', 'server-component', 'universal-component', 'no-handlers']) {
  test(`${kind} build emits HTML only, including when a client entry is configured`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'isle-ssr-'));
    try {
      const entry = join(directory, 'app.isle');
      const side = kind === 'server-component' ? 'server' : kind === 'universal-component' ? '' : 'client';
      const state = side === 'client' ? 'state count = initial;' : '';
      const handler = kind === 'forced-ssr' ? 'on click { count += 1; }' : '';
      await writeFile(entry, `export ${side} component Static({ initial }: { initial: number }) { ${state} <button>${handler}{initial}</button> }`);
      await writeFile(join(directory, 'index.html'), '<!doctype html><html><head></head><body><!--isle:ssr--></body></html>');
      await writeFile(join(directory, 'main.mjs'), 'throw Error("SSR must not run the client entry");');
      const result = await build({ configFile: false, root: directory, logLevel: 'silent',
        plugins: [isle({ entry, mode: kind === 'forced-ssr' ? 'ssr' : 'resume', loading: 'eager', clientEntry: join(directory, 'main.mjs'),
          mounts: [{ component: 'Static', props: { initial: 37 }, label: 'Static' }] })],
        build: { write: false } });
      assert.equal(result.output.filter(item => item.type === 'chunk').length, 0);
      assert.ok(!result.output.some(item => item.fileName === 'isle.manifest.json'));
      const html = result.output.find(item => item.fileName === 'index.html').source;
      assert.match(html, /<button>37<\/button>/);
      assert.ok(!/data-isle-|<!--i:|<script|modulepreload/.test(html));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test('an SSR-only editor contributes no handlers or action names to the client graph', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-mixed-'));
  try {
    await writeFile(join(directory, 'index.html'), '<!doctype html><html><head></head><body><!--isle:ssr--></body></html>');
    const entry = fileURLToPath(new URL('../benchmarks/variants/isle/app.isle', import.meta.url));
    const result = await build({ configFile: false, root: directory, logLevel: 'silent', plugins: [isle({ entry, mounts: [
      { component: 'Counter', props: { initial: 37 }, scopeId: 'active', label: 'Active' },
      { component: 'Editor', props: { id: 'demo', initial: 'Draft' }, scopeId: 'static', label: 'Static', mode: 'ssr', loading: 'eager' },
    ] })], build: { write: false } });
    const chunks = result.output.filter(item => item.type === 'chunk');
    assert.equal(chunks.filter(chunk => chunk.facadeModuleId?.includes('isle-handler')).length, 1);
    assert.ok(chunks.every(chunk => !chunk.code.includes('renameDocument') && !chunk.code.includes('fetch(')));
    const html = result.output.find(item => item.fileName === 'index.html').source;
    assert.match(html, />Draft<\/button>/);
    assert.ok(!html.includes('data-isle-root="static"'));
    assert.equal([...html.matchAll(/data-isle-snapshot=/g)].length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const loading of ['preload', 'eager']) {
  test(`${loading} policy is resolved through the manifest and includes only the selected code`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `isle-${loading}-`));
    try {
      await writeFile(join(directory, 'index.html'), '<!doctype html><html><head></head><body><!--isle:ssr--></body></html>');
      const entry = fileURLToPath(new URL('../benchmarks/variants/isle/app.isle', import.meta.url));
      const result = await build({ configFile: false, root: directory, base: '/nested/app/', html: { cspNonce: 'test-nonce' }, logLevel: 'silent', plugins: [isle({ entry, mounts: [
        { component: 'Counter', props: { initial: 37 }, label: 'Counter', loading },
        { component: 'Editor', props: { id: 'demo', initial: 'Draft' }, label: 'Editor' },
      ] })], build: { write: false } });
      const manifest = JSON.parse(result.output.find(item => item.fileName === 'isle.manifest.json').source);
      const html = result.output.find(item => item.fileName === 'index.html').source;
      assert.deepEqual(manifest.loading[loading], ['Counter.h0']);
      const marker = loading === 'eager' ? 'data-isle-eager' : 'data-isle-preload';
      assert.equal([...html.matchAll(new RegExp(marker, 'g'))].length, 2);
      assert.equal([...html.matchAll(/data-isle-(?:eager|preload)="" nonce="test-nonce"/g)].length,
        planCodeLoad(manifest, manifest.loading[loading]).modules.length, 'all required modules carry the nonce');
      for (const id of ['isle:resume', 'Counter.h0']) {
        const url = manifest.references[id].ref[0];
        assert.ok(url.startsWith('/nested/app/assets/'));
        assert.ok(html.includes(url));
      }
      const activeHTML = html.replace(/<template[\s\S]*?<\/template>/g, '');
      assert.ok(!activeHTML.includes(manifest.references['Editor.h1'].ref[0]), 'unselected code stays inert');
      assert.ok(html.includes(manifest.references['Editor.h1'].ref[0]), 'lazy code has an interaction load plan');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
