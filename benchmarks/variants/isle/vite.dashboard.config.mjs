import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../../lib/vite.mjs';
import { tasks } from '../../dashboard/model.mjs';
import { shell } from '../../dashboard/shell.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const loading = process.env.ISLE_DASHBOARD_LOADING ?? 'eager';
if (!['lazy', 'preload', 'eager'].includes(loading)) throw new Error('ISLE_DASHBOARD_LOADING must be lazy, preload or eager');
export default defineConfig({ root, base: '/dashboard/isle/', plugins: [
  { name: 'dashboard-shell', enforce: 'pre', transformIndexHtml: { order: 'pre', handler: () => shell('<div id="app"><!--isle:ssr--></div>') } },
  isle({ entry: `${root}/dashboard.isle`, mounts: [
    { component: 'ProjectForm', props: {}, scopeId: 'project', label: 'Create a project', loading },
    ...tasks.map(task => ({ component: 'WorkItem', props: task, scopeId: task.id, label: task.title, loading })),
  ] }),
], build: { outDir: '../../dist/dashboard/isle/client', emptyOutDir: true, target: 'es2023', sourcemap: false,
  manifest: true, rolldownOptions: { input: `${root}/dashboard.html` } } });
