import { assertRuntimeIdentity } from './runtime-identity.mjs';
/** Portable wire/config checks; no DOM, bundler or hosting-platform dependencies. */
export function widgetURL(value, base) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Widget URL is required');
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Widget URL must be HTTP(S) without credentials');
  return url;
}
export function widgetSize(width, height) {
  for (const [name, value] of [['width', width], ['height', height]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 8192) throw new TypeError(`Widget ${name} must be an integer between 1 and 8192 pixels`);
  }
}
export function widgetTagName(name) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9._]*-[a-z0-9._-]+$/.test(name) || ['annotation-xml', 'color-profile', 'font-face', 'font-face-src', 'font-face-uri', 'font-face-format', 'font-face-name', 'missing-glyph'].includes(name)) throw new TypeError('Invalid widget custom element name');
  return name;
}
export function resolveWidgetSource({ src, descriptorURL }, base) {
  if ((src !== undefined) === (descriptorURL !== undefined)) throw new TypeError('Provide exactly one widget source');
  return descriptorURL !== undefined ? widgetURL(descriptorURL, base).href : new URL('widget.json', widgetURL(src, base)).href;
}
export function resolveWidgetDescriptor(value, source, expectedRuntime) {
  if (!value || typeof value !== 'object' || value.version !== 2 || typeof value.html !== 'string' ||
    !(value.module === null || typeof value.module === 'string') || !Array.isArray(value.preload) ||
    !(value.preloadStyles === undefined || Array.isArray(value.preloadStyles)) ||
    Object.keys(value).some(key => !['version', 'runtime', 'html', 'module', 'preload', 'preloadStyles', 'actions'].includes(key))) throw new Error('Invalid widget descriptor');
  const runtime = assertRuntimeIdentity(value.runtime, expectedRuntime);
  const base = widgetURL(source);
  const code = path => {
    const url = widgetURL(path, base);
    if (url.origin !== base.origin) throw new Error('Widget code must come from its provider');
    return url.href;
  };
  if (value.module === null && (value.preload.length || value.preloadStyles?.length)) throw new Error('Static widget cannot preload code or styles');
  const actions = widgetURL(value.actions ?? './__isle/', base);
  if (!actions.pathname.endsWith('/') || actions.search || actions.hash) throw new Error('Invalid widget action base URL');
  return { version: 2, runtime: { ...runtime }, html: value.html, module: value.module === null ? null : code(value.module),
    preload: [...new Set(value.preload.map(code))], ...(value.preloadStyles ? { preloadStyles: [...new Set(value.preloadStyles.map(code))] } : {}), actions: actions.href };
}
