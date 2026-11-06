import {fileURLToPath} from 'node:url';
import {buildPreviewRuntime} from '../tools/build-preview-runtime.mjs';
import {buildLayoutWorker} from '../tools/build-layout-worker.mjs';
await buildPreviewRuntime();
const {publicDir,workerPath}=await buildLayoutWorker();
const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'credentialless'};
export default {root:fileURLToPath(new URL('./',import.meta.url)),publicDir,define:{__ISLE_LAYOUT_WORKER_PATH__:JSON.stringify(workerPath)},base:'./',server:{port:4334,strictPort:true,headers},preview:{headers},worker:{format:'es'},build:{outDir:'../dist/playground',emptyOutDir:true,target:'es2023',assetsInlineLimit:0}};
