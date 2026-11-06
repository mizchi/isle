import { fileURLToPath } from 'node:url';
import { exampleConfig } from '../_shared/vite.mjs';
export default exampleConfig(import.meta.url, {
  resources: { Session: './setup.mjs' },
  clientEntry: fileURLToPath(new URL('./main.mjs', import.meta.url)),
  mounts: [{ component: 'Session', props: {}, label: 'Owned resources' }],
});
