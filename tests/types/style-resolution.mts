import type { CodeManifest } from '../../lib/code-contracts.d.ts';
import type { WidgetDescriptor } from '../../runtime/widget-contract.mjs';
import { eagerLoad, planCodeLoad } from '../../runtime/manifest.mjs';

const manifest: CodeManifest = {
  version: 1,
  references: {},
  chunks: {
    'code.js': { url: './code.js', imports: [], dynamicImports: [], styles: ['theme.css'] },
  },
  styles: { 'theme.css': { url: './theme.css', bytes: 100, gzipBytes: 80 } },
  loading: { eager: [], preload: [] },
};
const styles: string[] | undefined = planCodeLoad(manifest, []).styles;
void styles;
void eagerLoad(manifest, {
  baseURL: 'https://example.test/',
  loadStyle: async url => { void url; },
});

const descriptor: WidgetDescriptor = {
  version: 2,
  runtime: { version: '0.0.1', mode: 'shared' },
  html: '',
  module: './mount.js',
  preload: [],
  preloadStyles: ['./theme.css'],
};
void descriptor;

// @ts-expect-error A static descriptor cannot prefetch dynamic CodeRef CSS.
const invalid: WidgetDescriptor = { ...descriptor, module: null };
void invalid;
