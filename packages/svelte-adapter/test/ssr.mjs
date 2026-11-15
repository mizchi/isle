// Server-render a Svelte component with real props (Svelte's own SSR), for fidelity checks of the expansion.
import {compile} from 'svelte/compiler';
import {render} from 'svelte/server';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const dir = mkdtempSync(join(fileURLToPath(new URL('.', import.meta.url)), '.ssr-'));
let n = 0;
export async function renderSSR(source, props) {
  const {js, css} = compile(source, {generate: 'server', css: 'external', filename: 'Component.svelte'});
  const file = join(dir, `c${n++}.mjs`);
  writeFileSync(file, js.code);
  const Component = (await import(pathToFileURL(file).href)).default;
  return {html: render(Component, {props}).body, css: compile(source, {css: 'external', filename: 'Component.svelte'}).css.code};
}
// The structure without Svelte's scoping classes, hydration comments and whitespace between tags.
export const normalize = html => html.replace(/<!--[^]*?-->/g, '').replace(/\s*svelte-[a-z0-9]+/g, '').replace(/ class=""/g, '').replace(/>\s+</g, '><').trim();
