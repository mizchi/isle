import {build} from 'vite';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {mkdir,copyFile,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
export async function buildLayoutWorker() {
  const directory=fileURLToPath(new URL('../_build/playground-public/',import.meta.url)),solver=fileURLToPath(new URL('../_build/layout-worker/',import.meta.url));
  await mkdir(solver,{recursive:true});
  await build({configFile:false,logLevel:'warn',define:{global:'globalThis'},build:{outDir:solver,emptyOutDir:false,target:'es2023',minify:'oxc',
    lib:{entry:fileURLToPath(new URL('../playground/layout.worker.mjs',import.meta.url)),formats:['iife'],name:'IsleLayoutWorker',fileName:()=> 'layout-worker.js'}}});
  const z3=dirname(require.resolve('z3-solver'));
  const digest=createHash('sha256').update(await readFile(join(solver,'layout-worker.js')));
  for(const file of ['z3-built.js','z3-built.wasm']) digest.update(await readFile(join(z3,file)));
  const hash=digest.digest('hex').slice(0,16),workerPath=`solver/${hash}/layout-worker.js`,assets=join(directory,'solver',hash);
  await rm(join(directory,'solver'),{recursive:true,force:true});await mkdir(assets,{recursive:true});
  await copyFile(join(solver,'layout-worker.js'),join(assets,'layout-worker.js'));
  for(const file of ['z3-built.js','z3-built.wasm']) await copyFile(join(z3,file),join(assets,file));
  await copyFile(join(z3,'../LICENSE.txt'),join(assets,'LICENSE.z3.txt'));
  const libraries=[['Z3',join(z3,'../LICENSE.txt')],['CSS Tree',join(dirname(require.resolve('css-tree/package.json')),'LICENSE')],['PostCSS',join(dirname(require.resolve('postcss/package.json')),'LICENSE')],['async-mutex',join(dirname(createRequire(require.resolve('z3-solver')).resolve('async-mutex/package.json')),'LICENSE')]];
  const notices=await Promise.all(libraries.map(async([name,file])=>`${name}\n${await readFile(file,'utf8')}`));
  await writeFile(join(directory,'third-party-licenses.txt'),notices.join('\n\n'));
  await copyFile(new URL('../playground/isolation-sw.js',import.meta.url),join(directory,'isolation-sw.js'));
  return {publicDir:directory,workerPath};
}
