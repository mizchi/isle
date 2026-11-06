import { posix } from 'node:path';
import { planCodeLoad } from '../runtime/manifest.mjs';
import { resolveWidgetDescriptor, widgetTagName } from '../runtime/widget-contract.mjs';
import { runtimeIdentity, validateRuntimeVersion } from '../runtime/runtime-identity.mjs';
import { styleTags, serializeTags } from './code-manifest.mjs';

export function widgetBuildOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Widget build options must be a record');
  for (const key of Object.keys(options)) if (!['runtime', 'runtimeVersion', 'tagName', 'descriptorFile', 'loaderFile', 'actionBaseURL', 'template', 'css'].includes(key)) throw new TypeError(`Unknown widget build option: ${key}`);
  const { runtime = 'shared', runtimeVersion = runtimeIdentity.version, tagName = runtime === 'standalone' ? 'isle-widget-standalone' : 'isle-widget', descriptorFile = 'widget.json', loaderFile = 'widget.js', actionBaseURL = './__isle/', template = '<!--isle:ssr-->', css = '' } = options;
  if (!['shared', 'standalone'].includes(runtime)) throw new TypeError('Invalid widget runtime mode');
  validateRuntimeVersion(runtimeVersion);
  const result = { runtime, runtimeVersion, tagName, descriptorFile, loaderFile, actionBaseURL, template, css };
  widgetTagName(result.tagName);
  for (const [name, extension] of [['descriptorFile', '.json'], ['loaderFile', '.js']]) {
    const file = result[name];
    if (typeof file !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(file) || file.startsWith('/') || file.split('/').some(part => !part || part === '.' || part === '..') || !file.endsWith(extension) || file === 'isle.manifest.json') throw new TypeError(`Invalid widget ${name}`);
  }
  if (typeof result.template !== 'string' || result.template.split('<!--isle:ssr-->').length !== 2) throw new TypeError('Widget template requires exactly one <!--isle:ssr-->');
  if (typeof result.css !== 'string' || /<\/style/i.test(result.css)) throw new TypeError('Invalid widget CSS');
  // Use the same wire boundary check at build time and in the browser.
  resolveWidgetDescriptor({ version: 2, runtime: { version: runtimeVersion, mode: runtime }, html: '', module: null, preload: [], actions: result.actionBaseURL }, `https://widget.invalid/${result.descriptorFile}`);
  return result;
}

export function buildWidgetDescriptor(options, html, moduleFile, manifest) {
  const relative = file => {
    const path = posix.relative(posix.dirname(options.descriptorFile), file);
    return path.startsWith('.') ? path : `./${path}`;
  };
  const byURL = new Map(Object.entries(manifest?.chunks ?? {}).map(([file, chunk]) => [chunk.url, file]));
  const plan = manifest && planCodeLoad(manifest, [...manifest.loading.eager, ...manifest.loading.preload]);
  const preload = plan ? plan.modules.map(url => relative(byURL.get(url))) : [];
  const cssByURL = new Map(Object.entries(manifest?.styles ?? {}).map(([file, style]) => [style.url, file]));
  const css = manifest ? serializeTags(styleTags(manifest, undefined, url => relative(cssByURL.get(url)))) : '';
  const descriptor = { version: 2, runtime: { version: options.runtimeVersion, mode: options.runtime }, html: `${options.css ? `<style>${options.css}</style>` : ''}${options.template.replace('<!--isle:ssr-->', () => html)}${css}`,
    module: moduleFile ? relative(moduleFile) : null, preload,
    ...(plan?.styles?.length ? { preloadStyles: plan.styles.map(url => relative(cssByURL.get(url))) } : {}), actions: options.actionBaseURL };
  resolveWidgetDescriptor(descriptor, `https://widget.invalid/${options.descriptorFile}`);
  return descriptor;
}
