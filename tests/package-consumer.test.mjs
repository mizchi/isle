import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rename, symlink, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('the documented package exports resolve without private implementation imports', async () => {
  for (const path of ['vite', 'compiler', 'compiler/browser', 'preview', 'server', 'layout', 'widget', 'widget/browser', 'resources']) {
    const module = await import(`@isle/prototype/${path}`);
    assert.ok(Object.keys(module).length);
  }
  await assert.rejects(import('@isle/prototype/lib/codegen.mjs'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});

test('a packed npm consumer builds the exact README app without MoonBit on PATH', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-npm-consumer-'));
  try {
    const packed = spawnSync('pnpm', ['pack', '--config.ignore-scripts=true', '--pack-destination', directory], { encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const archive = (await readdir(directory)).find(name => name.endsWith('.tgz'));
    assert.ok(archive);
    const extracted = spawnSync('tar', ['-xzf', join(directory, archive), '-C', directory], { encoding: 'utf8' });
    assert.equal(extracted.status, 0, extracted.stderr);
    const app = join(directory, 'app');
    await mkdir(join(app, 'node_modules/@isle'), { recursive: true });
    await rename(join(directory, 'package'), join(app, 'node_modules/@isle/prototype'));
    // Supply only declared dependencies/peers, as an installer would. The library
    // itself must come from the archive, with no access to its checkout.
    const metadata = JSON.parse(await readFile(join(app, 'node_modules/@isle/prototype/package.json'), 'utf8'));
    for (const entry of Object.values(metadata.exports)) {
      assert.ok((await readFile(join(app, 'node_modules/@isle/prototype', entry.types), 'utf8')).length, 'Every public type entry must be included in the archive');
    }
    for (const name of Object.keys({ ...metadata.dependencies, ...metadata.peerDependencies })) {
      await symlink(fileURLToPath(new URL(`../node_modules/${name}`, import.meta.url)), join(app, `node_modules/${name}`), 'dir');
    }
    await writeFile(join(app, 'package.json'), '{"name":"consumer-app","private":true,"type":"module"}');
    await writeFile(join(app,'browser-api.mjs'), `import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compilePreview} from '@isle/prototype/compiler/browser';
import {previewRuntimeURL,createPreviewDocument} from '@isle/prototype/preview';
const result=compilePreview('client component Counter(){state n=0;<button>on click {n+=1;}{n}</button>}');
assert.ok(result.ok);const runtimeSource=await readFile(previewRuntimeURL,'utf8');
assert.match(createPreviewDocument(result.preview,{runtimeSource}),/startPreview/);
const rows=compilePreview('component Rows(xs:number[]){<ul><For each={xs}>{x=><Fragment key={x}><li>{x}</li><li>Detail</li></Fragment>}</For></ul>}',{props:{xs:[1,2]},mode:'ssr'});
assert.ok(rows.ok);assert.equal(rows.preview.html,'<ul><li>1</li><li>Detail</li><li>2</li><li>Detail</li></ul>');`);
    const browserAPI=spawnSync(process.execPath,['browser-api.mjs'],{cwd:app,encoding:'utf8',env:{...process.env,PATH:'/usr/bin:/bin'}});
    assert.equal(browserAPI.status,0,browserAPI.stderr);
    const english = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    const japanese = await readFile(new URL('../README.ja.md', import.meta.url), 'utf8');
    for (const file of ['app.isle', 'index.html', 'vite.config.mjs']) {
      const snippet = text => text.split(`<!-- file: ${file} -->`)[1]?.split(/```[^\n]*\n/)[1]?.split('\n```')[0];
      const source = snippet(english);
      assert.ok(source, `Missing consumer snippet: ${file}`);
      assert.equal(snippet(japanese), source, `README translations must show the same ${file}`);
      await writeFile(join(app, file), source);
    }
    const built = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'build'], {
      cwd: app, encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin', NODE_ENV: 'production' },
    });
    assert.equal(built.status, 0, built.stderr || built.stdout);
    const html = await readFile(join(app, 'dist/index.html'), 'utf8');
    assert.match(html, /data-isle-root/);
    assert.ok((await readdir(join(app, 'dist/assets'))).some(name => name.endsWith('.js')));
    const manifest = JSON.parse(await readFile(join(app, 'dist/isle.manifest.json'), 'utf8'));
    assert.ok(Object.keys(manifest.references).some(name => name.startsWith('Counter.')));
    const checked = spawnSync(process.execPath, ['node_modules/@isle/prototype/tools/isle.mjs', 'check', 'app.isle'], {
      cwd: app, encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' },
    });
    assert.equal(checked.status, 0, checked.stderr);
    assert.deepEqual(JSON.parse(checked.stdout).components, ['Counter']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
