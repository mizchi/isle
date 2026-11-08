import { readFile, writeFile, mkdir, readdir, copyFile, rm, mkdtemp, stat } from 'node:fs/promises';
import { resolve, dirname, relative, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';
import { compile, requireIR } from '@isle/prototype/compiler';
import { isle } from '@isle/prototype/vite';
import { prepareProgram } from '../lib/codegen.mjs';
import { content } from './content.mjs';
import { normalizeBase, siteExamples, sourceRoutes, sourceURL, repository, guideLinks, hashRoutes } from './config.mjs';
import { renderMarkdown, escapeHTML as escape } from './markdown.mjs';
import playgroundConfig from '../playground/vite.config.mjs';

export const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = path => readFile(resolve(root, path), 'utf8');
export async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file)); else files.push(file);
  }
  return files;
}

export async function buildSite({ base = process.env.SITE_BASE, origin = process.env.SITE_ORIGIN ?? 'https://mizchi.github.io', output = resolve(root, 'dist/site') } = {}) {
  base = normalizeBase(base);
  const out = resolve(output);
  if (out === root || out === dirname(root)) throw new Error('Invalid site output');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await mkdir(resolve(root, '.site-build'), { recursive: true });
  const temporary = await mkdtemp(resolve(root, '.site-build/build-'));
  const ir = requireIR(compile(await read('site/app.isle')));
  const program = prepareProgram(ir);
  const documents = (await walk(resolve(root, 'docs'))).filter(path => path.endsWith('.md')).map(path => relative(root, path).replaceAll('\\', '/'));
  const routes = sourceRoutes(documents);
  const pages = [];
  const homeFields = ir.components.find(component => component.name === 'Home').props.map(prop => prop.name);
  const styles = await read('site/style.css');
  const cssLink = `<link rel="stylesheet" href="${base}assets/site.css">`;
  const staticRender = (name, props) => program.render(name, props, { mode: 'ssr' }).html;
  const home = lang => base + (lang === 'ja' ? 'ja/' : '');
  const guides = lang => base + (lang === 'ja' ? 'ja/' : '') + 'docs/quick-start.html';
  const gallery = lang => base + (lang === 'ja' ? 'ja/' : '') + 'examples/';
  const header = (lang, alternate = home(lang === 'ja' ? 'en' : 'ja')) => staticRender('Header', {
    home: home(lang), docs: guides(lang), examples: gallery(lang), playground: base + 'playground/', alternate,
    language: lang === 'ja' ? 'English' : '日本語', docsLabel: lang === 'ja' ? 'ガイド' : 'Docs', examplesLabel: lang === 'ja' ? 'サンプル' : 'Examples',
  });
  const footer = lang => staticRender('Footer', { home: home(lang), docs: guides(lang), examples: gallery(lang),
    note: lang === 'ja' ? 'このサイトも Isle で構築しています。静的なページと、必要な操作だけ。' : 'Built with Isle. Static pages, resumable interactions.' });
  const head = (title, lang, path, description) => `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f7f5ef"><meta name="description" content="${escape(description)}"><title>${escape(title)} · Isle</title><link rel="icon" href="${base}assets/isle.svg" type="image/svg+xml"><link rel="canonical" href="${escape(new URL(base + path, origin).href)}"><meta property="og:title" content="${escape(title)} · Isle"><meta property="og:type" content="website"><meta property="og:description" content="${escape(description)}">`;
  async function write(path, html) {
    const destination = resolve(out, path);
    if (!destination.startsWith(out + '/')) throw new Error('Site path escapes output');
    await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, html);
  }
  async function page(path, { lang = 'en', title, body, description = title, alternate } = {}) {
    pages.push(path);
    await write(path, `<!doctype html><html lang="${lang}"><head>${head(title, lang, path, description)}${cssLink}</head><body><a class="skip-link" href="#content">${lang === 'ja' ? '本文へ移動' : 'Skip to content'}</a>${header(lang, alternate)}${body}${footer(lang)}</body></html>`);
  }
  const markdown = (text, source) => renderMarkdown(text, { source, routes, base });
  const availability = (example, lang) => ({ live: lang === 'ja' ? 'Pages で操作できる' : 'Live on Pages', widget: lang === 'ja' ? 'Web Component デモ' : 'Live Web Components', report: lang === 'ja' ? '静的な検査結果' : 'Build-time report', server: lang === 'ja' ? 'サーバーが必要' : 'Requires a server' })[example.availability];
  const tag = (example, lang) => `<span class="tag ${example.availability === 'server' ? 'server-tag' : example.availability === 'report' ? 'report-tag' : 'live-tag'}">${availability(example, lang)}</span>`;
  const demoURL = example => base + 'demos/' + example.id + '/';

  try {
    // The landing pages are compiled Isle: all copy is SSR, only LiveCounter resumes.
    for (const lang of ['en', 'ja']) {
      const data = content(lang, base), folder = resolve(temporary, lang);
      await mkdir(folder, { recursive: true });
      const path = lang === 'ja' ? 'ja/index.html' : 'index.html';
      const title = lang === 'ja' ? 'まず HTML。操作から再開。' : 'HTML first. UI on demand.';
      await writeFile(join(folder, 'index.html'), `<!doctype html><html lang="${lang}"><head>${head(title, lang, path, data.copy.lead)}</head><body><a class="skip-link" href="#content">Skip to content</a>${header(lang)}<main id="content"><!--isle:ssr-->${staticRender('Sections', { copy: data.copy, features: data.features, demos: data.demos })}</main>${footer(lang)}</body></html>`);
      const props = Object.fromEntries(homeFields.map(key => [key, key === 'code' ? data.code : data.copy[key]]));
      await build({ root: folder, configFile: false, base: home(lang), logLevel: 'warn',
        plugins: [isle({ entry: resolve(root, 'site/app.isle'), wrapMounts: false, diagnostics: false, mounts: [{ component: 'Home', props, scopeId: 'site', label: 'Isle' }] })],
        build: { outDir: resolve(out, lang === 'ja' ? 'ja' : '.'), emptyOutDir: false, target: 'es2023' },
      });
      const destination = resolve(out, path);
      await writeFile(destination, (await readFile(destination, 'utf8')).replace('</head>', cssLink + '</head>'));
      pages.push(path);
    }

    await write('assets/site.css', styles);
    await write('assets/isle.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#00675c"/><path d="M7 24 16 11 24 20 29 15 34 24Z" fill="#dcf4a4"/><path d="M9 30h22" stroke="#dcf4a4" stroke-width="2"/></svg>');

    // These pages are static exports; their production server adapters are never started.
    for (const example of siteExamples.filter(example => example.availability === 'live')) {
      await build({ configFile: resolve(root, `examples/${example.id}/vite.config.mjs`), base: demoURL(example), logLevel: 'warn',
        build: { outDir: resolve(out, 'demos/' + example.id), emptyOutDir: true },
      });
    }

    // A client-only widget demonstrates two independent mounts on static hosting.
    const widgetRoot = resolve(temporary, 'widget'); await mkdir(widgetRoot, { recursive: true });
    await writeFile(join(widgetRoot, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Two Web Components · Isle</title></head><body><!--isle:ssr--></body></html>');
    await build({ root: widgetRoot, configFile: false, base: base + 'demos/portable-widget/', logLevel: 'warn', plugins: [isle({
      entry: resolve(root, 'examples/hello/app.isle'), diagnostics: false, wrapMounts: false, mounts: [{ component: 'Counter', props: { initial: 5 }, label: 'Widget counter' }],
      widget: { tagName: 'isle-site-counter', descriptorFile: 'counter.json', loaderFile: 'widget.js', css: 'section{font:16px/1.6 system-ui;color:#172f32;background:#fffefb;padding:20px;border:1px solid #b8c7b8;border-radius:10px}h2{font-size:20px;margin:0 0 16px}button{display:block;font:inherit;min-height:44px;margin:8px 0;padding:8px 18px;background:#00675c;color:white;border:0;border-radius:6px}output{display:block;font-size:25px}' },
    })], build: { outDir: resolve(out, 'demos/portable-widget'), emptyOutDir: true, target: 'es2023' } });
    await page('demos/portable-widget/index.html', { title: 'Two independent Web Components', body: `<main id="content" class="page-width example-page"><p class="eyebrow">WEB COMPONENTS · STATIC HOSTING</p><h1>One runtime. Two counters.</h1><p class="lead">Each ShadowRoot owns its state. Both widgets use the same version of the shared runtime.</p><div class="example-grid widget-grid"><isle-site-counter id="widget-a" descriptor="${base}demos/portable-widget/counter.json" width="320" height="270" style="display:block;width:320px;max-width:100%;height:270px" aria-label="First counter"></isle-site-counter><isle-site-counter id="widget-b" descriptor="${base}demos/portable-widget/counter.json" width="320" height="270" style="display:block;width:320px;max-width:100%;height:270px" aria-label="Second counter"></isle-site-counter></div><p class="callout">This static demo has no RPC. The full portable widget example also includes a Node server adapter.</p><a href="${base}examples/portable-widget/">Read the example →</a></main><script type="module" src="${base}demos/portable-widget/widget.js"></script>` });

    for (const lang of ['en', 'ja']) {
      const ja = lang === 'ja', prefix = ja ? 'ja/' : '';
      const cards = siteExamples.map(example => `<article class="example-card">${tag(example, lang)}<h2>${escape(ja ? example.ja : example.title)}</h2><p>${escape(ja ? example.observeJa : example.observe)}</p><p class="example-id">${example.id}</p><div class="example-links"><a class="text-link" href="${base + prefix}examples/${example.id}/">${ja ? '説明とソース' : 'Guide & source'} →</a>${['live', 'widget'].includes(example.availability) ? `<a class="text-link" href="${demoURL(example)}">${ja ? 'デモを開く' : 'Open demo'} ↗</a>` : ''}</div></article>`).join('');
      await page(prefix + 'examples/index.html', { lang, title: ja ? 'サンプル集' : 'Examples', alternate: gallery(ja ? 'en' : 'ja'), body: `<main id="content" class="page-width"><div class="page-intro"><p class="eyebrow">${siteExamples.length} FOCUSED EXAMPLES</p><h1>${ja ? '境界を、触って確かめる。' : 'Explore the boundaries.'}</h1><p>${ja ? 'Pages で動く例にはライブデモを用意しました。サーバーが必要な例は、実装と実行手順を案内します。' : 'Try the static-host demos in your browser. Server examples show the implementation and the adapter they need.'}</p></div><div class="example-grid catalog-grid">${cards}</div></main>` });
      for (const example of siteExamples) {
        const source = `examples/${example.id}/README.md`, readme = await read(source);
        const instructions = ja ? readme.split('## 日本語')[1] : readme.split('## English')[1]?.split('## 日本語')[0];
        const sourceFiles = (await readdir(resolve(root, 'examples/' + example.id))).filter(file => /\.(?:isle|css|mjs|json)$/.test(file));
        const code = [];
        for (const file of sourceFiles) code.push(`<details class="source-details"><summary>${escape(file)}</summary><pre tabindex="0"><code>${escape(await read(`examples/${example.id}/${file}`))}</code></pre></details>`);
        const notice = example.availability === 'server' ? `<p class="callout server-notice">${ja ? 'この例にはサーバーが必要です。GitHub Pages には RPC endpoint を置かず、下の host と実行手順を使います。' : 'This example needs a server. GitHub Pages does not run its RPC endpoint; use the host and run instructions below.'}</p>` : example.availability === 'report' ? `<p class="callout">${ja ? 'CSS 契約はビルド時に検査します。verified / violated / unknown の実際の結果を確認できます。' : 'CSS contracts are checked at build time. Inspect actual verified / violated / unknown results.'}</p><a class="button primary" href="${base}reports/layout.html">${ja ? '検査結果を読む' : 'Read the check results'} →</a>` : '';
        await page(`${prefix}examples/${example.id}/index.html`, { lang, title: ja ? example.ja : example.title, alternate: base + (ja ? '' : 'ja/') + `examples/${example.id}/`, body: `<main id="content" class="page-width example-page"><p class="breadcrumbs"><a href="${gallery(lang)}">${ja ? 'サンプル一覧' : 'All examples'}</a> / ${escape(example.id)}</p>${tag(example, lang)}<h1>${escape(ja ? example.ja : example.title)}</h1><p class="lead">${escape(ja ? example.observeJa : example.observe)}</p>${['live', 'widget'].includes(example.availability) ? `<div class="hero-actions"><a class="button primary" href="${demoURL(example)}">${ja ? 'ライブデモを開く' : 'Open live demo'} ↗</a><a class="button secondary" href="${sourceURL('examples/' + example.id)}">GitHub source ↗</a></div>` : notice}<div class="doc-content example-description">${markdown(instructions ?? readme, source)}</div><h2>${ja ? '実装を読む' : 'Read the implementation'}</h2>${code.join('')}</main>` });
      }
    }

    function sidebar(lang, current) {
      const labels = ['はじめる', '入れ子と children', '制御構文', 'Form と検証', '読み込みと manifest', 'リソースの寿命', 'Web Components', 'CSS 契約'];
      return `<aside class="doc-sidebar"><p class="eyebrow">DOCUMENTATION</p><nav aria-label="Documentation">${guideLinks.map(([path, title], index) => {
        const route = lang === 'ja' && index === 0 ? 'ja/' + path : path;
        return `<a href="${base + route}"${current === route ? ' aria-current="page"' : ''}>${escape(lang === 'ja' ? labels[index] : title)}</a>`;
      }).join('')}<a href="${base}ja/docs/index.html">${lang === 'ja' ? 'すべてのガイド →' : 'All guides (日本語) →'}</a></nav></aside>`;
    }
    async function document(path, source, text, lang) {
      const title = text.match(/^# (.+)$/m)?.[1] ?? source;
      await page(path, { lang, title, alternate: guides(lang === 'ja' ? 'en' : 'ja'), body: `<main id="content" class="page-width doc-shell">${sidebar(lang, path)}<article class="doc-content"><div class="doc-meta"><span>${lang === 'ja' ? 'ISLE ガイド' : 'ISLE DOCUMENTATION'}</span><a href="${sourceURL(source)}">${lang === 'ja' ? 'ソースで読む' : 'View source'} ↗</a></div>${markdown(text, source)}</article></main>` });
    }
    for (const lang of ['en', 'ja']) {
      const source = lang === 'ja' ? 'README.ja.md' : 'README.md', text = await read(source);
      const marker = lang === 'ja' ? '## はじめる' : '## Quick start';
      await document((lang === 'ja' ? 'ja/' : '') + 'docs/quick-start.html', source, '# ' + (lang === 'ja' ? 'はじめる' : 'Quick start') + text.split(marker)[1], lang);
    }
    for (const source of documents) await document(routes.get(source), source, await read(source), 'ja');

    const reports = [];
    for (const [file, name] of [['layout.json', 'verified'], ['overflow.json', 'violated'], ['unknown.json', 'unknown']]) {
      const checked = spawnSync(process.execPath, ['tools/isle.mjs', 'layout', 'examples/layout-contracts/app.isle', 'examples/layout-contracts/' + file], { cwd: root, encoding: 'utf8' });
      const data = JSON.parse(checked.stdout.replaceAll(root + '/', ''));
      if (data.status !== name) throw new Error('Unexpected layout report: ' + file);
      reports.push(`<section class="report-card"><div class="report-title"><h2>${name}</h2><span class="tag report-tag">${file}</span></div><pre tabindex="0"><code>${escape(JSON.stringify(data, null, 2))}</code></pre></section>`);
    }
    await page('reports/layout.html', { title: 'CSS contract reports', body: `<main id="content" class="page-width example-page"><p class="eyebrow">BUILD-TIME ANALYSIS</p><h1>Three outcomes. Explicit limits.</h1><p class="lead">Real CLI output for the declared Grid / reset contracts. Unknown is not a successful proof.</p><div class="report-grid">${reports.join('')}</div><a href="${base}examples/layout-contracts/">Read the example →</a></main>` });
    await page('reports/todomvc.html', { title: 'TodoMVC payload comparison', body: `<main id="content" class="page-width example-page doc-content">${markdown(await read('benchmarks/results/todomvc/latest.md'), 'benchmarks/results/todomvc/latest.md')}<p><a href="${base}examples/todomvc/">TodoMVC guide &amp; source →</a></p><p><a href="${base}demos/todomvc/">Open the live demo →</a></p></main>` });
    await page('404.html', { title: 'Page not found', body: `<main id="content" class="page-width example-page"><p class="eyebrow">404</p><h1>This page isn’t here.</h1><p>Find a guide or try an example.</p><div class="hero-actions"><a class="button primary" href="${home('en')}">Back to Isle →</a><a class="button secondary" href="${gallery('en')}">Explore examples</a></div></main>` });

    await build({...playgroundConfig,configFile:false,base:base+'playground/',logLevel:'warn',build:{...playgroundConfig.build,outDir:resolve(out,'playground')}});
    pages.push('playground/index.html');

    // Copy only source assets referenced by the rendered documents.
    for (const file of (await walk(out)).filter(file => file.endsWith('.html'))) {
      const html = await readFile(file, 'utf8');
      for (const match of html.matchAll(/\b(?:href|src|srcset)="([^"]+)"/g)) {
        if (!match[1].startsWith(base + 'source/')) continue;
        const path = decodeURIComponent(match[1].slice((base + 'source/').length).split('#')[0]);
        const from = resolve(root, path);
        if (!from.startsWith(root + '/')) throw new Error('Source link escapes repository');
        try { if (!(await stat(from)).isFile()) continue; } catch { continue; }
        const to = resolve(out, 'source', path); await mkdir(dirname(to), { recursive: true }); await copyFile(from, to);
      }
    }
    const packed = spawnSync('pnpm', ['pack', '--config.ignore-scripts=true', '--pack-destination', temporary], { cwd: root, encoding: 'utf8' });
    if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout);
    const archive = (await readdir(temporary)).find(file => file.endsWith('.tgz'));
    await mkdir(resolve(out, 'downloads'), { recursive: true }); await copyFile(resolve(temporary, archive), resolve(out, 'downloads', archive));
    await write('.nojekyll', '');
    await write('sitemap.xml', `<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.filter(path => path !== '404.html').map(path => `<url><loc>${escape(new URL(base + path.replace(/index\.html$/, ''), origin).href)}</loc></url>`).join('')}</urlset>`);
    await write('site.json', JSON.stringify({ base, repository, pages, hashRoutes, examples: siteExamples.map(({ id, availability }) => ({ id, availability })) }, null, 2));
    console.log(`Site: ${pages.length} pages, ${siteExamples.filter(example => example.availability === 'live').length} static demos + Web Components, base ${base}`);
    return { base, output: out, pages };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
