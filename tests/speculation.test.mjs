import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, createServer } from 'vite';
import { isle } from '../lib/vite.mjs';
import { speculationRules, speculationTags } from '../lib/speculation.mjs';

const rules = {
  tag: 'isle-navigation',
  prefetch: [{ urls: ['guide.html'], eagerness: 'immediate' }],
  prerender: [{ where: { and: [{ href_matches: '/*' }, { selector_matches: 'a[data-prerender]' },
    { not: { selector_matches: '[download], [data-no-speculation]' } }] }, eagerness: 'moderate' }],
};

test('native speculation rules own their data and are entirely opt-in', () => {
  for (const input of [undefined, false, {}, { prefetch: [], prerender: [] }, { prefetch: [{ urls: [] }] }]) assert.deepEqual(speculationTags(input), []);
  const input = structuredClone(rules), result = speculationRules(input);
  assert.deepEqual(result, rules);
  input.prefetch[0].urls.push('unexpected.html');
  assert.deepEqual(result, rules);
  const [tag] = speculationTags(rules, 'test-nonce');
  assert.deepEqual(tag.attrs, { type: 'speculationrules', nonce: 'test-nonce' });
  assert.equal(tag.injectTo, 'head');
  assert.deepEqual(JSON.parse(tag.children), rules);
});

test('invalid and unsupported navigation rules fail at build time', () => {
  const cyclic = { not: null }; cyclic.not = cyclic;
  for (const input of [
    true, { preload: [] }, { prefetch: {} }, { tag: '改行\n' },
    { prerender: [{ urls: ['/next'], where: { href_matches: '/*' } }] },
    { prerender: [{ eagerness: 'moderate' }] }, { prerender: [{ urls: ['/next'], eagerness: 'soon' }] },
    { prefetch: [{ urls: ['javascript:alert(1)'] }] }, { prefetch: [{ urls: ['data:text/html,hello'] }] },
    { prefetch: [{ urls: [42] }] }, { prerender: [{ where: {} }] },
    { prerender: [{ where: { href_matches: '/*', selector_matches: 'a' } }] },
    { prerender: [{ where: { selector_matches: 42 } }] }, { prerender: [{ where: cyclic }] },
    { prerender: [{ urls: ['/next'], requires: ['unknown'] }] },
  ]) assert.throws(() => speculationRules(input), /speculation/i);
});

test('inline JSON cannot terminate its speculation script or inject markup', () => {
  const value = { prerender: [{ where: { selector_matches: 'a[data-name="</script><script>alert(1)</script>"]' } }] };
  const [tag] = speculationTags(value);
  assert.doesNotMatch(tag.children, /</);
  assert.deepEqual(JSON.parse(tag.children), value);
});

test('Vite emits declarative navigation hints in SSR and dev without adding runtime code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isle-speculation-build-'));
  let server;
  try {
    const entry = join(root, 'app.isle');
    await writeFile(entry, 'export client component Counter() { state count = 37; <button>on click { count += 1; }{count}</button> }');
    const template = '<!doctype html><html><head></head><body><a data-prerender href="guide.html">Guide</a><!--isle:ssr--></body></html>';
    await writeFile(join(root, 'index.html'), template);
    const options = (speculation, mode = 'resume') => ({ configFile: false, root, base: '/nested/', logLevel: 'silent',
      html: { cspNonce: 'test-nonce' }, plugins: [isle({ entry, speculation, mode, diagnostics: false,
        mounts: [{ component: 'Counter', props: {}, label: 'Counter' }] })], build: { write: false } });
    const original = await build(options(undefined)), speculative = await build(options(rules));
    assert.doesNotMatch(original.output.find(item => item.fileName === 'index.html').source, /speculationrules/);
    const chunks = result => result.output.filter(item => item.type === 'chunk').map(({ fileName, code }) => ({ fileName, code }));
    assert.deepEqual(chunks(speculative), chunks(original), 'navigation rules do not alter the JS graph or hashes');
    const html = speculative.output.find(item => item.fileName === 'index.html').source;
    assert.equal([...html.matchAll(/type="speculationrules"/g)].length, 1);
    assert.match(html, /type="speculationrules"[^>]*nonce="test-nonce"/);
    const json = html.match(/<script\b[^>]*type="speculationrules"[^>]*>([^]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(json), rules, 'page URLs retain standard document-relative semantics');
    const ssr = await build(options(rules, 'ssr'));
    assert.equal(chunks(ssr).length, 0);
    const ssrHTML = ssr.output.find(item => item.fileName === 'index.html').source;
    assert.match(ssrHTML, /type="speculationrules"/);
    assert.doesNotMatch(ssrHTML, /type="module"|data-isle-|modulepreload|<!--i:/);
    server = await createServer({ ...options(rules, 'ssr'), server: { middlewareMode: true } });
    const development = await server.transformIndexHtml('/nested/', template);
    assert.match(development, /type="speculationrules"/);
    assert.doesNotMatch(development, /isle:loader|\/@isle\/loader/);
  } finally { await server?.close(); await rm(root, { recursive: true, force: true }); }
});
