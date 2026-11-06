import {fileURLToPath} from 'node:url';
import {buildPreviewRuntime} from '../tools/build-preview-runtime.mjs';
await buildPreviewRuntime();
export default {root:fileURLToPath(new URL('./',import.meta.url)),base:'./',server:{port:4334,strictPort:true},worker:{format:'es'},build:{outDir:'../dist/playground',emptyOutDir:true,target:'es2023',assetsInlineLimit:0}};
