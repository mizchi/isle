import { posix } from 'node:path';
import { examples } from '../examples/catalog.mjs';

export const repository = 'https://github.com/mizchi/isle';
export const liveExampleIds = ['hello', 'ssr-only', 'partial-updates', 'composition', 'control-flow', 'loading', 'resources', 'styles', 'navigation', 'form'];
export const siteExamples = examples.map(example => ({ ...example,
  availability: liveExampleIds.includes(example.id) ? 'live' : example.id === 'portable-widget' ? 'widget' : example.kind === 'layout' ? 'report' : 'server',
}));

export function normalizeBase(value = '/isle/') {
  if (typeof value !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*\/?$/.test(value) || value.startsWith('//')) throw new Error('SITE_BASE must be an absolute URL pathname');
  return value === '/' ? '/' : value.replace(/\/$/, '') + '/';
}

export function sourceRoutes(documents) {
  const routes = new Map([
    ['README.md', 'docs/quick-start.html'], ['README.ja.md', 'ja/docs/quick-start.html'],
    ['examples/README.md', 'examples/'], ['examples/README.ja.md', 'ja/examples/'],
  ]);
  for (const file of documents) routes.set(file, 'ja/' + file.replace(/\.md$/, '.html').replace('/README.html', '/index.html'));
  for (const example of siteExamples) {
    routes.set(`examples/${example.id}/`, `examples/${example.id}/`);
    routes.set(`examples/${example.id}/README.md`, `examples/${example.id}/`);
  }
  return routes;
}

export function sourceURL(source) { return `${repository}/blob/main/${source.split('/').map(encodeURIComponent).join('/')}`; }
export function resolveSourcePath(source, target) { return posix.normalize(posix.join(posix.dirname(source), target)); }

export const guideLinks = [
  ['docs/quick-start.html', 'Quick start'], ['ja/docs/composition.html', 'Components'],
  ['ja/docs/control-flow.html', 'Control flow'], ['ja/docs/forms.html', 'Forms & validation'],
  ['ja/docs/resolution-optimizer.html', 'Loading & manifests'], ['ja/docs/resource-disposal.html', 'Resource lifetime'],
  ['ja/docs/widgets.html', 'Web Components'], ['ja/docs/layout-checking.html', 'CSS contracts'],
];
