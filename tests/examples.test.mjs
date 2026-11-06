import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';
import { examples } from '../examples/catalog.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('every catalog entry has bilingual instructions, and both README indexes link to it', async () => {
  assert.ok(examples.length >= 15);
  assert.equal(new Set(examples.map(example => example.id)).size, examples.length);
  const documents = await Promise.all(['README.md', 'README.ja.md', 'examples/README.md', 'examples/README.ja.md'].map(read));
  for (const example of examples) {
    const instructions = await read(`examples/${example.id}/README.md`);
    assert.match(instructions, /## English/);
    assert.match(instructions, /## 日本語/);
    for (const document of documents) assert.ok(document.includes(`${example.id}/`), `Missing example link: ${example.id}`);
    await access(new URL(`../examples/${example.id}/${example.kind === 'layout' ? 'layout.json' : 'vite.config.mjs'}`, import.meta.url));
  }
});

for (const example of examples.filter(example => example.kind === 'vite')) {
  test(`example ${example.id} builds from its own app.isle`, async () => {
    const source = await read(`examples/${example.id}/app.isle`);
    assert.ok(source.includes('component'));
    const { output } = await build({ configFile: `examples/${example.id}/vite.config.mjs`, logLevel: 'silent', build: { write: false } });
    const html = output.find(file => file.fileName === 'index.html')?.source;
    assert.ok(html && !html.includes('<!--isle:ssr-->'));
    if (['ssr-only', 'navigation'].includes(example.id)) {
      assert.equal(output.filter(file => file.type === 'chunk').length, 0);
      assert.doesNotMatch(html, /data-isle-|type="module"/);
    } else {
      const manifest = JSON.parse(output.find(file => file.fileName === 'isle.manifest.json').source);
      assert.ok(Object.keys(manifest.references).length > 0);
      if (example.id === 'loading') {
        assert.ok(manifest.loading.preload.includes('Search.edit'));
        assert.ok(!manifest.loading.preload.includes('Details.open'));
      }
      if (example.id === 'styles') assert.ok(Object.values(manifest.chunks).some(chunk => chunk.styles?.length));
    }
    if (example.id === 'navigation') {
      assert.match(html, /type="speculationrules"/);
      assert.ok(output.some(file => file.fileName === 'next.html'));
    }
  });
}

test('the layout example distinguishes verified, violated and unknown through the public CLI', () => {
  for (const [config, status] of [['layout.json', 'verified'], ['overflow.json', 'violated'], ['unknown.json', 'unknown']]) {
    const result = spawnSync(process.execPath, ['tools/isle.mjs', 'layout', 'examples/layout-contracts/app.isle', `examples/layout-contracts/${config}`], { encoding: 'utf8' });
    assert.equal(JSON.parse(result.stdout).status, status, result.stderr || result.stdout);
    assert.equal(result.status, status === 'verified' ? 0 : 1);
  }
});
