import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';

for (const runtime of ['shared', 'standalone']) for (const mode of ['resume', 'ssr']) test(`Vite emits a portable ${runtime}/${mode} widget directly from compiler output`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'isle-widget-build-'));
  try {
    const entry = join(root, 'app.isle');
    await writeFile(entry, 'export client component Counter(initial: number) { state count = initial; <button>on click { count += 1; }{count}</button> }');
    await writeFile(join(root, 'index.html'), '<!doctype html><html><head></head><body><!--isle:ssr--></body></html>');
    const result = await build({ configFile: false, root, base: '/unrelated/page/', logLevel: 'silent', plugins: [isle({ entry, mode, loading: 'eager',
      mounts: [{ component: 'Counter', props: { initial: 17 }, label: '<unsafe>$&' }],
      widget: { runtime, runtimeVersion: '0.0.2', tagName: 'demo-counter', descriptorFile: 'components/counter.json', loaderFile: 'sdk/counter.js', actionBaseURL: '../api/', template: '<article><!--isle:ssr--></article>', css: 'button{color:navy}' },
    })], build: { write: false } });
    const files = new Map(result.output.map(file => [file.fileName, file]));
    assert.ok(files.has('sdk/counter.js'));
    const descriptor = JSON.parse(files.get('components/counter.json').source);
    assert.equal(descriptor.version, 2); assert.deepEqual(descriptor.runtime, { version: '0.0.2', mode: runtime });
    const code = result.output.filter(file => file.type === 'chunk').map(file => file.code).join('\n');
    assert.equal(code.includes('isle.runtime.registry/1'), runtime === 'shared', 'standalone does not join or import the global runtime pool');
    assert.equal(descriptor.actions, '../api/'); assert.match(descriptor.html, /<article>/); assert.match(descriptor.html, /&lt;unsafe&gt;/);
    assert.ok(descriptor.html.includes('&lt;unsafe&gt;$&'));
    assert.ok(files.get('index.html').source.includes('&lt;unsafe&gt;$&'));
    assert.match(descriptor.html, /<style>button\{color:navy\}<\/style>/); assert.ok(!/<script[^>]+src=/.test(descriptor.html));
    assert.ok(!JSON.stringify(descriptor).includes('/unrelated/page/'));
    if (mode === 'ssr') {
      assert.equal(descriptor.module, null); assert.deepEqual(descriptor.preload, []);
      assert.ok(!/data-isle-|<!--i:/.test(descriptor.html));
      const chunks = result.output.filter(file => file.type === 'chunk');
      if (runtime === 'standalone') assert.equal(chunks.length, 1, 'self-contained static transport');
      else assert.ok(chunks.some(chunk => chunk.facadeModuleId?.includes('widget-runtime')));
      assert.ok(chunks.every(chunk => !/widget-engine|isle-handler|isle:resume/.test(chunk.facadeModuleId ?? '')));
    } else {
      assert.match(descriptor.html, /data-isle-snapshot/); assert.ok(descriptor.preload.length > 0);
      for (const path of [descriptor.module, ...descriptor.preload]) {
        const file = new URL(path, 'https://cdn.example/components/counter.json').pathname.slice(1);
        assert.ok(files.has(file), `missing portable asset ${file}`);
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('widget build rejects unsafe output paths and ambiguous templates before compilation', () => {
  for (const widget of [{ descriptorFile: '../server/private.json' }, { loaderFile: '/absolute.js' }, { descriptorFile: 'isle.manifest.json' },
    { runtime: 'fallback' }, { runtimeVersion: '' }, { runtimeVersion: '^0.0.1' }, { runtimeVersion: '0.0.1 || 0.0.2' },
    { template: '<p>Missing slot</p>' }, { template: '<!--isle:ssr--><!--isle:ssr-->' }, { css: '</style><script>bad</script>' }, { unknown: true }]) {
    assert.throws(() => isle({ entry: '/not-read.isle', mounts: [], widget }));
  }
  assert.doesNotThrow(() => isle({ entry: '/not-read.isle', mounts: [], widget: { tagName: undefined } }));
});
