import { fileURLToPath } from 'node:url';
import { isle } from '@isle/prototype/vite';
import { runtimeIdentity } from '../../runtime/runtime-identity.mjs';
export const alternateVersion = `${runtimeIdentity.version}-fixture`;

export function config(staticMode = false, { runtime = 'shared', runtimeVersion = runtimeIdentity.version, distribution = staticMode ? 'static' : '', tagName } = {}) {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const title = staticMode ? 'Static notice' : 'Portable counter';
  const template = `<main><h1>${title}</h1><!--isle:ssr--></main>`;
  const css = ':host{color-scheme:light}*{box-sizing:border-box}body{margin:0}main{font:16px/1.6 system-ui,sans-serif;color:#182b3b;background:#f3f6fa;padding:24px}h1{font-size:24px;line-height:1.2;margin:0 0 20px}h2{font-size:18px;margin:16px 0 8px}button{font:inherit;min-height:44px;min-width:120px;padding:8px 16px;border:1px solid #224e72;border-radius:6px;background:#193f60;color:white}button:focus-visible{outline:3px solid #a44f00;outline-offset:3px}';
  return { root, base: './', plugins: [
    { name: 'portable-widget-shell', transformIndexHtml: { order: 'pre', handler: html => html.replace('</head>', `<style>${css}</style></head>`).replace('<!--widget:shell-->', template) } },
    isle({ entry: fileURLToPath(new URL(staticMode ? 'static.isle' : '../counter/app.isle', import.meta.url)),
      mode: staticMode ? 'ssr' : 'resume', loading: 'eager', clientEntry: staticMode ? undefined : '/page.mjs',
      mounts: staticMode ? [{ component: 'Notice', props: { message: 'This widget has no UI runtime or handler chunks.' }, label: 'Server output' }] : [
        { component: 'Counter', props: { initial: 17 }, scopeId: 'count', label: 'Counter' },
        { component: 'Editor', props: { id: 'portable-demo', initial: 'Draft' }, scopeId: 'edit', label: 'Editor' },
      ],
      widget: { runtime, runtimeVersion, tagName: tagName ?? `${staticMode ? 'static-counter' : 'demo-counter'}${distribution && distribution !== 'static' ? `-${distribution}` : ''}`, descriptorFile: `components/${staticMode ? 'static' : 'counter'}.json`,
        loaderFile: `sdk/${staticMode ? 'static' : 'counter'}.js`, actionBaseURL: distribution ? '../../api/actions/' : '../api/actions/', template, css },
    }),
  ], build: { outDir: `../../dist-portable-widget/client${distribution ? `/${distribution}` : ''}`, emptyOutDir: true, target: 'es2023' } };
}
export default config();
