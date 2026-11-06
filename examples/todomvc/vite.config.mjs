import { exampleConfig } from '../_shared/vite.mjs';
export default exampleConfig(import.meta.url, {
  mounts: [{ component: 'TodoMVC', props: {}, scopeId: 'todos', label: 'TodoMVC' }],
  wrapMounts: false, loading: 'lazy', clientEntry: './browser.mjs',
});
