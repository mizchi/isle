import { renderWidgetEmbed } from '@isle/prototype/widget';

export function renderHostPage(widgetURL, { width = 640, height = 640, loading = 'eager', count = 1, runtime = 'shared' } = {}) {
  const widgets = Array.from({ length: count }, (_, i) => renderWidgetEmbed({ src: widgetURL, width, height, loading, runtime, title: `Work planner ${i + 1}` })).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Widget publisher demo</title><style>
  *{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;color:#182b3b;background:#edf2f7;margin:0}main{max-width:900px;margin:auto;padding:24px 16px}h1{font-size:28px;line-height:1.3}isle-widget,isle-widget-standalone{background:white;margin:24px 0}#after{padding:16px;border:1px solid #bccbd8;border-radius:8px;background:white}a{color:#185891}
  </style></head><body><main><h1>Widget publisher demo</h1><p>This page belongs to the publisher. The work planner below is a Web Component served by Cloudflare Workers.</p>
  ${widgets}<p id="after">Following content keeps its place while the widget loads and changes.</p></main></body></html>`;
}
