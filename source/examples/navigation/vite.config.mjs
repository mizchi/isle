import { fileURLToPath } from 'node:url';
import { exampleConfig } from '../_shared/vite.mjs';
const config = exampleConfig(import.meta.url, {
  mode: 'ssr', mounts: [{ component: 'Notice', props: {}, label: 'Native navigation' }],
  speculation: {
    tag: 'isle-example',
    prefetch: [{ where: { selector_matches: 'a[data-prefetch]' }, eagerness: 'moderate' }],
  },
});
config.build.rolldownOptions = {
  input: { index: fileURLToPath(new URL('index.html', import.meta.url)), next: fileURLToPath(new URL('next.html', import.meta.url)) },
};
export default config;
