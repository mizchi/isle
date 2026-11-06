import { exampleConfig } from '../_shared/vite.mjs';
export default exampleConfig(import.meta.url, {
  resources: { Card: './setup.mjs' },
  mounts: [{ component: 'Card', props: {}, label: 'CSS readiness' }],
});
