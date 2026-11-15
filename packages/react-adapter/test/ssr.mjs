// The real thing, for fidelity checks: StyleX's own compiler (atomic classes and CSS), esbuild's JSX transform,
// and react-dom/server's markup. Linaria's css`` / styled`` are replaced the way its build does (a class per
// template, the template as that class's rule, nesting kept for the browser's native CSS nesting).
import {createRequire} from 'node:module';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {transform} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';

const require = createRequire(import.meta.url);
const plugin = require('@stylexjs/babel-plugin');
const babel = createRequire(require.resolve('@stylexjs/babel-plugin'))('@babel/core');
const dir = mkdtempSync(join(fileURLToPath(new URL('.', import.meta.url)), '.ssr-'));
let n = 0;

export function compileStylex(source, filename = 'Component.jsx') {
  const out = babel.transformSync(source, {filename, parserOpts: {plugins: ['jsx']}, plugins: [[plugin, {dev: false, runtimeInjection: false, treeshakeCompensation: true, unstable_moduleResolution: {type: 'commonJS'}}]]});
  return {code: out.code, css: plugin.processStylexRules(out.metadata.stylex, false)};
}

export function compileLinaria(source) {
  let css = '';
  const code = source.replace(/import[^;]*@linaria\/[^;]*;\n?/g, '').replace(/^/, "const cx = (...a) => a.filter(Boolean).join(' ');\n")
    .replace(/const (\w+) = css`([^`]*)`;/g, (m, name, body) => { css += `.lx-${name}{${body}}\n`; return `const ${name} = 'lx-${name}';`; })
    .replace(/const (\w+) = styled\.(\w+)`([^`]*)`;/g, (m, name, tag, body) => { css += `.lx-${name}{${body}}\n`; return `const ${name} = (props) => React.createElement('${tag}', {...props, className: ['lx-${name}', props.className].filter(Boolean).join(' ')});`; });
  return {code: `import React from 'react';\n${code}`, css};
}

export async function render(code, props) {
  const {code: js} = await transform(code, {loader: 'jsx', jsx: 'automatic', format: 'esm'});
  const file = join(dir, `c${n++}.mjs`);
  writeFileSync(file, js.replace(/from ['"]@stylexjs\/stylex['"]/, `from '${pathToFileURL(require.resolve('@stylexjs/stylex')).href}'`).replace(/from ['"]react(\/jsx-runtime)?['"]/g, (m, sub) => `from '${pathToFileURL(require.resolve(`react${sub ?? ''}`)).href}'`));
  const Component = (await import(pathToFileURL(file).href)).default;
  return renderToStaticMarkup(createElement(Component, props));
}
