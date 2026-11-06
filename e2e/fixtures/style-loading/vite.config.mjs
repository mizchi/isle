import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {isle} from '../../../lib/vite.mjs';
const plain=process.env.ISLE_STYLE_PLAIN==='1',eager=process.env.ISLE_STYLE_EAGER==='1',port=eager?4213:plain?4212:4211;
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),
  plugins:[isle({entry:fileURLToPath(new URL('app.isle',import.meta.url)),diagnostics:false,profile:true,
    loading:eager?'eager':'auto',
    autoPreloadGzipBytes:65536,resources:{A:'./a.mjs',B:'./b.mjs'},clientEntry:fileURLToPath(new URL('main.mjs',import.meta.url)),
    mounts:[{component:'Page',props:{},label:'CSS readiness',scopeId:'page'}],
    ...(plain?{}:{widget:{tagName:'isle-style-widget',descriptorFile:'embed/descriptor.json',loaderFile:'embed/loader.js'}}),
  })],build:{outDir:eager?'../../../dist/style-loading-eager':plain?'../../../dist/style-loading-plain':'../../../dist/style-loading',emptyOutDir:true},
  preview:{host:'127.0.0.1',port,strictPort:true},
});
