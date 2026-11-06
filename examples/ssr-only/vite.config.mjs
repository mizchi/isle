import { exampleConfig } from '../_shared/vite.mjs';
export default exampleConfig(import.meta.url, {
  mode: 'ssr', mounts: [{ component: 'Page', props: {}, label: 'Static page' }],
});
