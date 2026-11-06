import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '../../../lib/vite.mjs';
const limited=process.env.ISLE_AUTO_BUDGET==='0',port=limited?4200:4199;
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),
  plugins:[isle({entry:fileURLToPath(new URL('app.isle',import.meta.url)),diagnostics:false,
    autoPreloadGzipBytes:limited?0:8192,resources:{Editor:'./resources.mjs'},
    clientEntry:fileURLToPath(new URL('main.mjs',import.meta.url)),mounts:[{component:'Page',props:{},label:'Automatic loading',scopeId:'page'}],
  })],
  build:{outDir:limited?'../../../dist/auto-loading-limited':'../../../dist/auto-loading',emptyOutDir:true},
  preview:{host:'127.0.0.1',port,strictPort:true},
});
