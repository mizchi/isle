import { createHash } from 'node:crypto';
import { codeRef } from '../runtime/code-ref.mjs';
import { planCodeLoad } from '../runtime/manifest.mjs';
import { escapeHtml } from './codegen.mjs';
import { gzipSync } from 'node:zlib';
import { planLoading } from './loading-plan.mjs';

export const loadingModes = ['lazy', 'preload', 'eager'];
export const loadingPolicies = ['auto', ...loadingModes];
export function assetURL(base, file) {
  return base === '' || base === './' ? `./${file}` : `${base}${file}`;
}

/** No URLs are taken from event attributes. The build owns this entire code graph. */
export function createCodeManifest(bundle, references, base, policies, options) {
  const chunks = Object.fromEntries(Object.values(bundle).filter(output => output.type === 'chunk').sort((a, b) => a.fileName.localeCompare(b.fileName)).map(chunk => [chunk.fileName, {
    url: assetURL(base, chunk.fileName),
    imports: chunk.imports.filter(file => bundle[file]?.type === 'chunk'),
    dynamicImports: chunk.dynamicImports.filter(file => bundle[file]?.type === 'chunk'),
    ...(chunk.viteMetadata?.importedCss?.size ? { styles: [...chunk.viteMetadata.importedCss] } : {}),
    ...(chunk.imports.some(file => !bundle[file]) ? { externalImports: chunk.imports.filter(file => !bundle[file]) } : {}),
    ...(typeof chunk.code === 'string' ? { bytes: Buffer.byteLength(chunk.code), gzipBytes: gzipSync(chunk.code, { level: 6 }).byteLength } : {}),
  }]));
  const rows = Object.fromEntries([...references].sort((a, b) => a.id.localeCompare(b.id)).map(({ id, file, symbol, captures, kind, schemaId, ...metadata }) => [id, {
    ref: codeRef(chunks[file].url, symbol, captures), chunk: file,
    requires: kind === 'handler' ? ['isle:resume'] : [], kind, ...(schemaId ? { schemaId } : {}), ...metadata, loading: policies.get(id) ?? 'lazy',
  }]));
  const styleFiles = [...new Set(Object.values(chunks).flatMap(chunk => chunk.styles ?? []))];
  const styles = Object.fromEntries(styleFiles.map(file => {
    const asset = bundle[file];
    if (asset?.type !== 'asset') throw new Error(`Missing stylesheet asset: ${file}`);
    const data = typeof asset.source === 'string' ? Buffer.from(asset.source) : asset.source;
    return [file, { url: assetURL(base, file), bytes: data.byteLength, gzipBytes: gzipSync(data, { level: 6 }).byteLength }];
  }));
  const manifest = { version: 1, references: rows, chunks, ...(styleFiles.length ? { styles } : {}), loading: { eager: [], preload: [] } };
  const { eager, preload, plan } = planLoading(manifest, policies, options);
  manifest.loading = { eager, preload };
  if (plan) {
    manifest.resolution = plan;
    for (const row of plan.decisions) rows[row.id].loading = row.loading;
  }
  const { loading } = manifest;
  for (const ids of Object.values(loading)) planCodeLoad(manifest, ids);
  return { ...manifest, buildId: createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 16) };
}

export function loadingTags(manifest, nonce) {
  const eager = planCodeLoad(manifest, manifest.loading.eager);
  const preload = planCodeLoad(manifest, manifest.loading.preload);
  const scripts = [...new Set(eager.references.map(id => manifest.references[id].ref[0]))];
  const styleURLs = new Set(Object.values(manifest.styles ?? {}).map(style => style.url));
  const eagerStyles = new Set(eager.styles ?? []);
  const initial = new Set([...eager.modules, ...preload.modules, ...eager.styles ?? [], ...preload.styles ?? []]);
  const links = [...initial].filter(url => !scripts.includes(url));
  const csp = nonce ? { nonce } : {};
  const pending = new Map();
  for (const [id, reference] of Object.entries(manifest.references)) {
    if (reference.kind !== 'handler') continue;
    const plan = planCodeLoad(manifest, [id]);
    for (const url of [...plan.modules, ...plan.styles ?? []]) {
      if (initial.has(url)) continue;
      if (!pending.has(url)) pending.set(url, []);
      pending.get(url).push(id);
    }
  }
  return [
    ...links.filter(url => !eagerStyles.has(url)).map(url => ({ tag: 'link', attrs: { rel: styleURLs.has(url) ? 'preload' : 'modulepreload', ...(styleURLs.has(url) ? { as: 'style' } : {}), href: url, crossorigin: 'anonymous', 'data-isle-preload': '', ...csp } })),
    ...orderedStyles(manifest).filter(url => eagerStyles.has(url)).map(url => ({ tag: 'link', attrs: { rel: 'stylesheet', href: url, crossorigin: 'anonymous', 'data-isle-eager-style': '', ...csp } })),
    ...scripts.map(url => ({ tag: 'script', attrs: { type: 'module', src: url, crossorigin: 'anonymous', 'data-isle-eager': '', ...csp } })),
    ...(pending.size ? [{ tag: 'template', attrs: { 'data-isle-load': '1' }, children: [...pending].map(([url, ids]) => ({
      tag: 'link', attrs: { rel: styleURLs.has(url) ? 'preload' : 'modulepreload', ...(styleURLs.has(url) ? { as: 'style' } : {}), href: url, crossorigin: 'anonymous', 'data-isle-code': ids.join(' '), ...csp },
    })) }] : []),
    ...styleTags(manifest, nonce),
  ];
}

/** Inert activation slots, separate from fetch-only hints. Ordered independently of events. */
export function styleTags(manifest, nonce, href = value => value) {
  const styles = new Map();
  const eager = new Set(planCodeLoad(manifest, manifest.loading.eager).styles ?? []);
  for (const [id, reference] of Object.entries(manifest.references)) {
    const key = reference.kind === 'handler' ? id : reference.kind === 'resource' ? '@' + reference.schemaId : undefined;
    if (!key) continue;
    for (const url of planCodeLoad(manifest, [id]).styles ?? []) {
      if (!styles.has(url)) styles.set(url, []);
      styles.get(url).push(key);
    }
  }
  for (const [url, ids] of styles) if (eager.has(url)) ids.push('@eager');
  return styles.size ? [{ tag: 'template', attrs: { 'data-isle-styles': '1' }, children: [...styles].map(([url, ids]) => ({
    tag: 'link', attrs: { rel: 'stylesheet', href: href(url), crossorigin: 'anonymous', 'data-isle-code': ids.join(' '), ...(nonce ? { nonce } : {}) },
  })) }] : [];
}

function orderedStyles(manifest) {
  return [...new Set(Object.keys(manifest.references).flatMap(id => planCodeLoad(manifest, [id]).styles ?? []))];
}

/** These URLs are already final: inject after Vite has emitted HTML and chunk hashes. */
export function injectLoadingTags(html, tags) {
  const text = serializeTags(tags);
  if (!text) return html;
  return html.includes('</head>') ? html.replace('</head>', `${text}</head>`) : `${text}${html}`;
}

export function serializeTags(tags) {
  const serialize = ({ tag, attrs, children = [] }) => {
    const attributes = Object.entries(attrs).map(([name, value]) => ` ${name}="${escapeHtml(value)}"`).join('');
    return tag === 'link' ? `<link${attributes}>` : `<${tag}${attributes}>${children.map(serialize).join('')}</${tag}>`;
  };
  return tags.map(serialize).join('');
}
