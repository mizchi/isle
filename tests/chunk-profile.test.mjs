import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';
import { describeChunks } from '../lib/chunks.mjs';

test('manifest links named boundaries to relative source locations, captures and emitted bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-profile-'));
  try {
    const entry = join(directory, 'app.isle');
    const source = `// 日本語😀\r\nexport client component Counter({ initial }: { initial: number }) {\r\n  state count = initial;\r\n  <button>on click increment { count += 1; }{count}</button>\r\n}`;
    await writeFile(entry, source);
    await writeFile(join(directory, 'index.html'), '<html><head></head><body><!--isle:ssr--></body></html>');
    const compile = profile => build({ configFile: false, root: directory, base: './', logLevel: 'silent', plugins: [isle({
      entry, profile, diagnostics: false, mounts: [{ component: 'Counter', props: { initial: 37 }, label: 'Counter', loading: 'preload' }],
    })], build: { write: false } });
    const output = (await compile(false)).output;
    const manifest = JSON.parse(output.find(item => item.fileName === 'isle.manifest.json').source);
    const handler = manifest.references['Counter.increment'];
    assert.equal(handler.source.file, 'app.isle');
    assert.equal(handler.source.start.offset, source.indexOf('on click'));
    assert.equal(handler.source.start.line, 4);
    assert.equal(handler.source.start.column, 11);
    assert.equal(source.slice(handler.source.start.offset, handler.source.end.offset), 'on click increment { count += 1; }');
    assert.deepEqual(handler.captureNames, ['count']);
    assert.deepEqual(handler.writes, ['count']);
    assert.equal(handler.event, 'click');
    assert.equal(handler.async, false);
    assert.equal(handler.loading, 'preload');
    const row = describeChunks(manifest).find(row => row.id === 'Counter.increment');
    assert.equal(row.location, 'app.isle:4:11');
    const chunk = output.find(item => item.fileName === handler.chunk);
    assert.equal(row.bytes, Buffer.byteLength(chunk.code));
    assert.equal(row.gzipBytes, gzipSync(chunk.code, { level: 6 }).byteLength);
    const closure = output.filter(item => row.modules.includes(`./${item.fileName}`));
    assert.equal(row.coldGzipBytes, closure.reduce((sum, item) => sum + gzipSync(item.code, { level: 6 }).byteLength, 0));
    assert.equal(closure.length, 2, 'handler and common resume runtime');
    assert.ok(!JSON.stringify(manifest).includes(directory), 'absolute developer paths stay out of deployment artifacts');
    const code = output.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
    assert.ok(!/\.measure\(|\.now\(|isle:.*interaction|captureNames|app\.isle/.test(code), 'profiling and debug metadata do not ship in the normal runtime');
    const profiled = (await compile(true)).output.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
    assert.match(profiled, /\.measure\(/);
    assert.match(profiled, /\.now\(/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
