import { Marked, Renderer } from 'marked';
import { extname } from 'node:path';
import { resolveSourcePath, sourceURL } from './config.mjs';

export const escapeHTML = value => String(value).replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value]));

export function resolveDocLink(target, source, routes, base) {
  if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) return target;
  const [path, hash] = target.split('#');
  const resolved = resolveSourcePath(source, path);
  const route = routes.get(resolved) ?? routes.get(resolved + '/');
  if (route) return base + route + (hash ? '#' + hash : '');
  if (/^(?:\.\.\/)*artifacts\//.test(resolved) || resolved.startsWith('artifacts/')) return base + 'downloads/' + resolved.split('/').at(-1);
  if (['.png', '.svg', '.css', '.json', '.isle', '.mjs', '.mts', '.ts', '.txt'].includes(extname(resolved))) return base + 'source/' + resolved;
  return sourceURL(resolved) + (hash ? '#' + hash : '');
}

export function renderMarkdown(markdown, { source, routes, base }) {
  const renderer = new Renderer();
  const headings = new Map();
  renderer.heading = function ({ tokens, depth, text }) {
    const slug = text.replace(/<[^>]*>/g, '').replace(/[`*]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
    const number = headings.get(slug) ?? 0; headings.set(slug, number + 1);
    return `<h${depth} id="${escapeHTML(slug + (number ? '-' + number : ''))}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  };
  renderer.link = function ({ href, tokens }) {
    return `<a href="${escapeHTML(resolveDocLink(href, source, routes, base))}">${this.parser.parseInline(tokens)}</a>`;
  };
  renderer.image = ({ href, text }) => `<img src="${escapeHTML(resolveDocLink(href, source, routes, base))}" alt="${escapeHTML(text)}" loading="lazy">`;
  renderer.code = ({ text, lang }) => `<div class="code-block"><div class="code-language">${escapeHTML(lang || 'code')}</div><pre tabindex="0"><code>${escapeHTML(text)}</code></pre></div>\n`;
  renderer.html = ({ text }) => text.replace(/\b(href|src|srcset)="([^"\n]+)"/g, (_, key, target) => `${key}="${escapeHTML(resolveDocLink(target, source, routes, base))}"`);
  renderer.table = function (token) { return `<div class="table-scroll" tabindex="0" role="region" aria-label="Reference table">${Renderer.prototype.table.call(this, token)}</div>`; };
  return new Marked({ renderer }).parse(markdown);
}
