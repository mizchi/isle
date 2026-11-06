import { exampleConfig } from '../_shared/vite.mjs';
export default exampleConfig(import.meta.url, {
  loading: 'auto', autoPreloadGzipBytes: 8192, handlerChunkBytes: 0, profile: true,
  resources: { Search: './setup.mjs', Details: './setup.mjs' },
  mounts: [{ component: 'Page', props: {}, label: 'Loading policies' }],
});
