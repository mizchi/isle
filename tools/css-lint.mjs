#!/usr/bin/env node
// css-lint: the static CSS×DOM checks as a linter for components.
//   node tools/css-lint.mjs [options] <file.svelte|file.vue|file.jsx|file.tsx>...
// Options:
//   --viewport 320-1280      viewport widths (and --height 480-900 heights) the component is checked over
//   --page-css <file>        CSS of the page around the component (html, body, resets)
//   --css <file>             a stylesheet for plain className (React without StyleX/Linaria)
//   --profile recommended|all   the rule set (recommended: rules checked against Chromium)
//   --no-assume-text         keep text without size contracts Unknown instead of one assumed line
//   --format text|json
//   --default-colors light|none   assume the UA's black-on-white canvas (light preference, no dark color-scheme); none: Unknown
//   --each-counts 0,2        item counts checked for {#each} / v-for / .map (default 0 and 2)
// Exit status 1 when any error is reported.
import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {lint, formatText} from '../packages/adapter-core/src/index.mjs';

const args = process.argv.slice(2), files = [], opt = {viewport: '320-1280', height: '480-900', profile: 'recommended', format: 'text', assumeText: true, defaultFontSize: '16', defaultColors: 'light'};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--no-assume-text') opt.assumeText = false;
  else if (a === '--font') { const [family, ...file] = String(args[++i]).split('='); (opt.fonts ??= {})[family] = {file: file.join('=')}; }
  else if (a.startsWith('--')) opt[a.slice(2).replace(/-(\w)/g, (m, c) => c.toUpperCase())] = args[++i];
  else files.push(a);
}
if (!files.length) { console.error('usage: css-lint [--viewport 320-1280] [--font Family=file.ttf] [--page-css file] [--css file] [--profile recommended|all] [--format text|json] <files>'); process.exit(2); }
const range = text => { const [min, max] = String(text).split('-').map(Number); return {min, max: max ?? min}; };
// The default page around a component: block flow (html and body are display: block), border-box, no UA margins.
const pageCSS = opt.pageCss ? readFileSync(opt.pageCss, 'utf8') : '*{box-sizing:border-box;margin:0}';
const options = {...(opt.defaultFontSize !== 'none' ? {defaultFontSize: Number(opt.defaultFontSize)} : {}), ...(opt.defaultColors !== 'none' ? {defaultColors: true} : {}), scrollIntent: 'css', sourceLines: true, eachCounts: (opt.eachCounts ?? '0,2').split(',').map(Number), pageCSS, viewport: {...range(opt.viewport), height: range(opt.height)}, accessibility: true, integrity: true, selectors: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], ...(opt.assumeText ? {assumeText: true} : {})};

// --font Family=file.ttf: the component's texts in that family are measured from the font file (widths, line breaks).
if (opt.fonts) { const {loadTextMetrics} = await import('../packages/css-verifier/src/text-node.mjs'); options.textMetrics = await loadTextMetrics({fonts: opt.fonts}); options.fonts = opt.fonts; if (opt.textResize !== 'off') options.textResize = true; }

const adapters = {
  '.svelte': async () => (await import('../packages/svelte-adapter/src/index.mjs')).analyzeSvelte,
  '.vue': async () => (await import('../packages/vue-adapter/src/index.mjs')).analyzeVue,
  '.jsx': async () => (await import('../packages/react-adapter/src/index.mjs')).analyzeReact,
  '.tsx': async () => (await import('../packages/react-adapter/src/index.mjs')).analyzeReact,
};
const all = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8'), load = adapters[extname(file)];
  if (!load) { all.push({file, severity: 'info', code: 'UNSUPPORTED_FILE', message: 'not checked: no adapter for this file type'}); continue; }
  const analyze = await load();
  const started = Date.now();
  const result = analyze(source, {...options, ...(opt.css ? {css: readFileSync(opt.css, 'utf8')} : {})});
  if (opt.format !== 'json') console.error(`${file}: ${result.states.length} states in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  all.push(...lint(result, {file, source, profile: opt.profile}));
}
console.log(opt.format === 'json' ? JSON.stringify(all, null, 2) : formatText(all) || 'no findings');
const count = s => all.filter(m => m.severity === s).length;
if (opt.format !== 'json') console.log(`\n${count('error')} error(s), ${count('warning')} warning(s), ${count('info')} not checked or assumed`);
process.exit(count('error') ? 1 : 0);
