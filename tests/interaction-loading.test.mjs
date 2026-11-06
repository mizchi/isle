import test from 'node:test';
import assert from 'node:assert/strict';
import { loadingTags, injectLoadingTags } from '../lib/code-manifest.mjs';

const manifest = {
  version: 1,
  references: {
    runtime: { ref: ['./runtime.js', 'resume', []], chunk: 'runtime.js', requires: [], kind: 'runtime' },
    counter: { ref: ['./counter.js', 'run', [0]], chunk: 'counter.js', requires: ['runtime'], kind: 'handler' },
    editor: { ref: ['./editor.js', 'run', [0]], chunk: 'editor.js', requires: ['runtime'], kind: 'handler' },
  },
  chunks: {
    'runtime.js': { url: './runtime.js', imports: ['shared.js'], dynamicImports: ['counter.js', 'editor.js'] },
    'counter.js': { url: './counter.js', imports: ['shared.js'], dynamicImports: [] },
    'editor.js': { url: './editor.js', imports: ['editor-helper.js'], dynamicImports: [] },
    'shared.js': { url: './shared.js', imports: ['runtime.js'], dynamicImports: [] },
    'editor-helper.js': { url: './editor-helper.js?x=1&y=2', imports: [], dynamicImports: ['unrelated.js'] },
    'unrelated.js': { url: './unrelated.js', imports: [], dynamicImports: [] },
  },
  loading: { eager: [], preload: [] },
};

test('interaction metadata deduplicates static closures inside an inert versioned template', () => {
  const tags = loadingTags(manifest, 'nonce');
  assert.equal(tags.length, 1, 'lazy code must not produce active preload links');
  const template = tags[0];
  assert.equal(template.tag, 'template');
  assert.deepEqual(template.attrs, { 'data-isle-load': '1' });
  const rows = template.children.map(tag => [tag.attrs.href, tag.attrs['data-isle-code'].split(' ')]);
  assert.deepEqual(Object.fromEntries(rows), {
    './runtime.js': ['counter', 'editor'], './shared.js': ['counter', 'editor'],
    './counter.js': ['counter'], './editor.js': ['editor'], './editor-helper.js?x=1&y=2': ['editor'],
  });
  assert.ok(template.children.every(tag => tag.tag === 'link' && tag.attrs.rel === 'modulepreload' && tag.attrs.crossorigin === 'anonymous' && tag.attrs.nonce === 'nonce'));
  const html = injectLoadingTags('<html><head></head><body></body></html>', tags);
  assert.match(html, /<head><template data-isle-load="1">/);
  assert.match(html, /editor-helper\.js\?x=1&amp;y=2/);
  assert.ok(!html.includes('unrelated.js'), 'dynamic descendants remain lazy');
  assert.ok(!html.replace(/<template[\s\S]*?<\/template>/g, '').includes('modulepreload'));
});

for (const policy of ['eager', 'preload']) {
  test(`${policy} modules do not appear again in the interaction closure`, () => {
    const tags = loadingTags({ ...manifest, loading: { eager: [], preload: [], [policy]: ['counter'] } });
    const template = tags.find(tag => tag.tag === 'template');
    assert.deepEqual(new Set(template.children.map(tag => tag.attrs.href)), new Set(['./editor.js', './editor-helper.js?x=1&y=2']));
    assert.ok(template.children.every(tag => tag.attrs['data-isle-code'] === 'editor'));
  });
}

test('a missing dependency in a lazy interaction closure fails the build plan', () => {
  const invalid = { ...manifest, chunks: { ...manifest.chunks, 'editor.js': { ...manifest.chunks['editor.js'], imports: ['missing.js'] } } };
  assert.throws(() => loadingTags(invalid), /Unknown code chunk/);
});
