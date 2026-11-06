import {fileURLToPath} from 'node:url';
import {isle} from '@isle/prototype/vite';
export default {root:fileURLToPath(new URL('./',import.meta.url)),base:'./',plugins:[isle({
  entry:fileURLToPath(new URL('./app.isle',import.meta.url)),mode:'ssr',wrapMounts:false,mounts:[{component:'Four',props:{},label:'Four boxes'}],
  layout:{viewport:{min:160,max:1280,height:{min:80,max:900}}},
})],build:{outDir:'../../dist/examples/inline-css',emptyOutDir:true}};
