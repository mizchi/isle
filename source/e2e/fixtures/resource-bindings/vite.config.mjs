import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../../lib/vite.mjs';
const plain = process.env.ISLE_RESOURCE_PLAIN === '1', port = plain ? 4198 : 4197;
export default defineConfig({ root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [isle({entry: fileURLToPath(new URL('app.isle', import.meta.url)),
    mounts:[{component:'Page',props:{},label:'Resources',scopeId:'page'}],
    resources:{Counter:'./resources.mjs',Child:'./resources.mjs',Broken:'./resources.mjs'},
    clientEntry:fileURLToPath(new URL('main.mjs',import.meta.url)), diagnostics:false, profile:true, handlerChunkBytes:0,
    ...(plain ? {} : {widget:{tagName:'isle-resource-widget',loaderFile:'resource-widget-loader.js',descriptorFile:'resource-widget.json',template:'<!--isle:ssr-->'}}),
  })],
  build:{outDir:plain?'../../../dist/resource-bindings-plain':'../../../dist/resource-bindings',emptyOutDir:true},
  server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../..',import.meta.url))]}},
  preview:{host:'127.0.0.1',port,strictPort:true},
});
