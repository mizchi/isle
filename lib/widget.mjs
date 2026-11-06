import { escapeHtml } from './html.mjs';
import { resolveWidgetSource, widgetSize, widgetTagName, widgetURL } from '../runtime/widget-contract.mjs';

/** Reserve the custom element's slot in the original HTML, before definition or data. */
export function renderWidgetEmbed(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Widget options must be a record');
  for (const key of Object.keys(options)) if (!['src', 'descriptorURL', 'loaderURL', 'tagName', 'runtime', 'href', 'title', 'width', 'height', 'loading'].includes(key)) throw new TypeError(`Unknown widget option: ${key}`);
  const { src, descriptorURL, title, width, height, loading = 'lazy', runtime = 'shared', tagName = runtime === 'standalone' ? 'isle-widget-standalone' : 'isle-widget', loaderURL, href = src } = options;
  if (!['shared', 'standalone'].includes(runtime)) throw new TypeError('Invalid widget runtime mode');
  widgetSize(width, height); widgetTagName(tagName);
  const source = resolveWidgetSource({ src, descriptorURL });
  if (descriptorURL !== undefined && loaderURL === undefined) throw new TypeError('Explicit descriptor requires loaderURL');
  const loader = widgetURL(loaderURL ?? new URL('widget.js', source).href).href;
  if (typeof title !== 'string' || !title.trim()) throw new TypeError('Widget title is required');
  if (!['lazy', 'eager'].includes(loading)) throw new TypeError('Widget loading must be lazy or eager');
  const attribute = descriptorURL !== undefined ? `descriptor="${escapeHtml(source)}"` : `src="${escapeHtml(widgetURL(src).href)}"`;
  const fallback = href !== undefined ? `<a href="${escapeHtml(widgetURL(href).href)}">Open ${escapeHtml(title)}</a>` : escapeHtml(title);
  return `<${tagName} ${attribute} role="region" aria-label="${escapeHtml(title)}" width="${width}" height="${height}" loading="${loading}" style="display:block;width:${width}px;height:${height}px;max-width:100%;overflow:auto;contain:layout paint style;border:0;box-sizing:border-box">${fallback}</${tagName}>\n<script type="module" src="${escapeHtml(loader)}" crossorigin="anonymous"></script>`;
}
