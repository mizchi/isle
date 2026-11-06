import { renderWidgetEmbed } from '../../lib/widget.mjs';
import { createWorkerHandler, type WorkerBindings } from '../../lib/worker.mjs';
import { loadIslands } from '../../runtime/loader.mjs';
import type { LazyResumeModule } from '../../lib/client-contracts.d.ts';
import type { WidgetDescriptor } from '../../runtime/widget.mjs';
import { mountWidget } from '../../runtime/widget.mjs';
import { isle } from '../../lib/vite.mjs';
import { sharedRuntimeInfo } from '../../runtime/widget.mjs';
import { acquireSharedRuntime } from '../../runtime/shared-runtime.mjs';
renderWidgetEmbed({ src: 'https://widget.example/', title: 'Plan', width: 640, height: 640 });
// @ts-expect-error Width and height must both be explicit.
renderWidgetEmbed({ src: 'https://widget.example/', title: 'Plan', width: 640 });
// @ts-expect-error Percentages do not define the reserved pixel geometry.
renderWidgetEmbed({ src: 'https://widget.example/', title: 'Plan', width: '100%', height: 640 });
declare const env: WorkerBindings;
env.ASSETS.fetch(new Request('https://widget.example/'));
// @ts-expect-error A Worker requires a server host adapter.
createWorkerHandler({ schemas: [], actions: [] });
declare const shadow: ShadowRoot;
declare const module: LazyResumeModule;
loadIslands(shadow, async () => module, ['click'], { actionBaseURL: 'https://widget.example/__isle/', requestCredentials: 'omit' });
// @ts-expect-error Only native credential modes are valid.
loadIslands(shadow, async () => module, ['click'], { requestCredentials: 'public' });
renderWidgetEmbed({ descriptorURL: 'https://cdn.example/v1/card.json', loaderURL: 'https://cdn.example/sdk.js', tagName: 'custom-card', title: 'Card', width: 320, height: 180 });
// @ts-expect-error Explicit source requires an explicit loader.
renderWidgetEmbed({ descriptorURL: 'https://cdn.example/v1/card.json', title: 'Card', width: 320, height: 180 });
// @ts-expect-error Ambiguous source paths are forbidden.
renderWidgetEmbed({ src: 'https://cdn.example/', descriptorURL: 'https://cdn.example/card.json', loaderURL: 'https://cdn.example/sdk.js', title: 'Card', width: 320, height: 180 });
const staticWidget: WidgetDescriptor = { version: 2, runtime: { version: '0.0.1', mode: 'shared' }, html: '<p>Static</p>', module: null, preload: [] };
// @ts-expect-error Static output cannot preload UI code.
const invalidStatic: WidgetDescriptor = { version: 2, runtime: { version: '0.0.1', mode: 'shared' }, html: '', module: null, preload: ['app.js'] };
mountWidget(shadow, 'https://cdn.example/v1/card.json', { signal: new AbortController().signal });
isle({ entry: 'app.isle', mounts: [], widget: { tagName: 'custom-card', descriptorFile: 'v1/card.json', loaderFile: 'sdk.js' } });
sharedRuntimeInfo().map(entry => entry.status);
acquireSharedRuntime('test/1', async () => ({ abi: 'test/1', version: '0.0.1', mount: () => 1 }), { version: '0.0.1' }).then(runtime => runtime.mount());
// @ts-expect-error A runtime must declare its compatibility ABI.
acquireSharedRuntime('test/1', async () => ({ mount: () => 1 }), { version: '0.0.1' });
isle({ entry: 'app.isle', mounts: [], widget: { runtime: 'standalone' } });
renderWidgetEmbed({ src: 'https://widget.example/standalone/', runtime: 'standalone', title: 'Plan', width: 320, height: 280 });
// @ts-expect-error Standalone is a distribution choice, not an arbitrary runtime mode.
isle({ entry: 'app.isle', mounts: [], widget: { runtime: 'fallback' } });
