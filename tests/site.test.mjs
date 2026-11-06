import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBase, siteExamples, sourceRoutes, hashRoutes, hasFragment } from '../site/config.mjs';
import { renderMarkdown, resolveDocLink } from '../site/markdown.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { isle } from '@isle/prototype/vite';
import { resolveWidgetSource } from '../runtime/widget-contract.mjs';

test('the site respects a project Pages prefix and fails closed on invalid base paths', () => {
  assert.equal(normalizeBase('/isle'), '/isle/');
  assert.equal(normalizeBase('/'), '/');
  assert.equal(normalizeBase('/preview/project/'), '/preview/project/');
  for (const base of ['https://example.test/', '//host/', '/isle/../', '/isle/?x', '/a\\b/']) assert.throws(() => normalizeBase(base));
});

test('hash routes are explicitly bounded to their demo without weakening ordinary anchor checks', () => {
  const routes = hashRoutes['demos/todomvc/index.html'];
  assert.equal(hasFragment('<h2 id="guide">Guide</h2>', '#guide'), true);
  assert.equal(hasFragment('', '#/active', routes), true);
  assert.equal(hasFragment('', '#/unknown', routes), false);
  assert.equal(hasFragment('', '#/active'), false);
  assert.equal(hasFragment('', '#missing', routes), false);
});

test('declarative widgets resolve a relative source against their document base', () => {
  assert.equal(resolveWidgetSource({ descriptorURL: './counter.json' }, 'https://example.test/isle/widget/'), 'https://example.test/isle/widget/counter.json');
  assert.equal(resolveWidgetSource({ src: '../widget/' }, 'https://example.test/isle/demo/'), 'https://example.test/isle/widget/widget.json');
  assert.throws(() => resolveWidgetSource({ descriptorURL: 'javascript:alert(1)' }, 'https://example.test/isle/'));
  assert.throws(() => resolveWidgetSource({ descriptorURL: './counter.json' }));
});

test('live examples are static-host compatible and server examples do not advertise broken RPC demos', () => {
  assert.equal(siteExamples.length, 16);
  assert.equal(siteExamples.find(example => example.id === 'schema-form').availability, 'server');
  assert.equal(siteExamples.find(example => example.id === 'counter').availability, 'server');
  assert.equal(siteExamples.find(example => example.id === 'layout-contracts').availability, 'report');
  assert.equal(siteExamples.find(example => example.id === 'portable-widget').availability, 'widget');
  assert.equal(siteExamples.filter(example => example.availability === 'live').length, 11);
});

test('Markdown links and raw picture assets resolve within the deployed subpath', () => {
  const routes = sourceRoutes(['docs/forms.md', 'docs/getting-started.md']);
  assert.equal(resolveDocLink('../examples/hello/', 'docs/getting-started.md', routes, '/isle/'), '/isle/examples/hello/');
  assert.equal(resolveDocLink('forms.md#validation', 'docs/getting-started.md', routes, '/isle/'), '/isle/ja/docs/forms.html#validation');
  const html = renderMarkdown('# Guide\n\n[Forms](forms.md)\n\n<picture><img src="overview/figures/isle-overview.desktop.png" alt="overview"></picture>\n\n```html\n<script>alert(1)</script>\n```', {
    source: 'docs/getting-started.md', routes, base: '/isle/',
  });
  assert.match(html, /id="guide"/);
  assert.match(html, /href="\/isle\/ja\/docs\/forms.html"/);
  assert.match(html, /src="\/isle\/source\/docs\/overview\/figures\/isle-overview.desktop.png"/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('a site can own its HTML shell without demo card wrappers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isle-site-shell-'));
  try {
    const entry = join(root, 'app.isle');
    await writeFile(entry, 'component Page(){<main><h1>Site shell</h1></main>}');
    await writeFile(join(root, 'index.html'), '<html><head></head><body><!--isle:ssr--></body></html>');
    const { output } = await build({ root, configFile: false, logLevel: 'silent', plugins: [isle({ entry, wrapMounts: false, mounts: [{ component: 'Page', props: {}, label: 'Not site content' }] })], build: { write: false } });
    const html = output.find(file => file.fileName === 'index.html').source;
    assert.match(html, /<main><h1>Site shell<\/h1><\/main>/);
    assert.doesNotMatch(html, /class="card"|Not site content/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
