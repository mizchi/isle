import type { CodeManifest, LoadingMode } from '../../lib/code-contracts.d.ts';
import type { IsleOptions } from '../../lib/vite.mjs';
import { planLoading } from '../../lib/loading-plan.mjs';
const options: IsleOptions={entry:'app.isle',mounts:[{component:'Editor',props:{},label:'Editor',loading:'auto'}],loading:'auto',autoPreloadGzipBytes:8192};
void options;
const manifest: CodeManifest={version:1,references:{},chunks:{},loading:{eager:[],preload:[]}};
const result=planLoading(manifest,new Map([['Editor.edit','auto']]),{gzipBytes:0});
const actual: LoadingMode|undefined=result.plan?.decisions[0]?.loading;
void actual;
// @ts-expect-error auto is a compiler policy; runtime loading modes are concrete.
const invalid: LoadingMode='auto';
// @ts-expect-error Budgets are numeric bytes, not CSS lengths.
const invalidOptions: IsleOptions={entry:'app.isle',mounts:[],autoPreloadGzipBytes:'8KiB'};
void invalid;void invalidOptions;
