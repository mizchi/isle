import { exampleConfig } from '../_shared/vite.mjs';
export default exampleConfig(import.meta.url, {
  mounts: [{ component: 'Dashboard', props: {}, label: 'Selective updates' }],
});
