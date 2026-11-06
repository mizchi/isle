import { exampleConfig } from '../_shared/vite.mjs';
export default exampleConfig(import.meta.url, {
  mounts: [{ component: 'Counter', props: { initial: 5 }, scopeId: 'counter', label: 'Counter' }],
});
