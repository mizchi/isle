import { exampleConfig } from '../_shared/vite.mjs';
export default exampleConfig(import.meta.url, {
  mounts: [{ component: 'List', props: { initial: [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }] }, label: 'Control flow' }],
});
