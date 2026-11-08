import {build} from 'vite';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
export async function buildPreviewRuntime() {
  const directory=fileURLToPath(new URL('../_build/browser/',import.meta.url));
  await build({configFile:false,logLevel:'silent',define:{
    __ISLE_CHANNELS__:false,__ISLE_DEBUG__:true,__ISLE_PROFILE__:false,__ISLE_CSS__:false,__ISLE_RESOURCES__:false,__ISLE_EVENT_POLICY__:true,
    __ISLE_REMOTE__:false,__ISLE_SCHEMA_FORMS__:false,__ISLE_LAZY_CODE__:false,__ISLE_EAGER_CODE__:true,
  },build:{outDir:directory,emptyOutDir:false,target:'es2023',minify:'oxc',lib:{entry:fileURLToPath(new URL('../runtime/preview.mjs',import.meta.url)),formats:['es'],fileName:()=> 'preview-runtime.mjs'}}});
  const source=await readFile(directory+'/preview-runtime.mjs','utf8');
  // Keep development servers from treating a fetched runtime as their own module.
  await writeFile(directory+'/preview-runtime.txt',source);
  return source;
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) console.log(`Preview runtime: ${Buffer.byteLength(await buildPreviewRuntime())} bytes`);
