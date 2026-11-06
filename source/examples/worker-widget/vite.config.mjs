import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '@isle/prototype/vite';
import { tasks, teams } from '../../benchmarks/dashboard/model.mjs';
import { styles, dashboardStyles } from '../../benchmarks/dashboard/shell.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const markup = `<main><h1>Work planner widget</h1>
<p class="intro">Public demo. Changes reset when this widget reloads.</p>
<fieldset><legend>Filter work packages by team</legend><label><input type="radio" id="team-all" name="team-filter" checked>All teams</label>${teams.map((team, i) => `<label><input type="radio" id="team-${i}" name="team-filter">${team}</label>`).join('')}</fieldset>
<!--isle:ssr--><footer>64 independent work packages. No sign-in or third-party cookies required.</footer></main>`;
export function config(runtime = 'shared') { return defineConfig({ root, base: './', plugins: [
  { name: 'widget-shell', transformIndexHtml: { order: 'pre', handler: html => html.replace('</head>', `<style>${styles}</style></head>`).replace('<!--widget:shell-->', markup) } },
  isle({ entry: fileURLToPath(new URL('../../benchmarks/variants/isle/dashboard.isle', import.meta.url)), loading: 'eager',
    widget: {
      runtime,
      actionBaseURL: runtime === 'standalone' ? '../__isle/' : './__isle/',
      template: `<div class="widget-root">${markup}</div>`,
      css: ':host{container-type:inline-size;color-scheme:light}.widget-root{font:16px system-ui,sans-serif;text-align:left}' + dashboardStyles({ root: '.widget-root', body: '.widget-root', compact: '@container (max-width:600px)' }),
    }, mounts: [
    { component: 'ProjectForm', props: {}, scopeId: 'project', label: 'Create a project' },
    ...tasks.map(task => ({ component: 'WorkItem', props: task, scopeId: task.id, label: task.title })),
  ] }),
], build: { outDir: `../../dist/worker-widget/client${runtime === 'standalone' ? '/standalone' : ''}`, emptyOutDir: true, target: 'es2023', sourcemap: false } }); }
export default config();
