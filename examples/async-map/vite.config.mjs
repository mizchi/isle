import {exampleConfig} from '../_shared/vite.mjs';
export function mapConfig({mode=process.env.ISLE_MAP_SSR==='1'?'ssr':'resume',mounts=[{component:'Explorer',scopeId:'map',props:{},label:'Harbor local map'}]}={}){
  return {...exampleConfig(import.meta.url,{
    mode,wrapMounts:false,loading:'lazy',profile:false,resources:{Explorer:'./setup.mjs'},mounts,
  }),build:{outDir:'../../dist/examples/async-map',emptyOutDir:true,target:'es2023',assetsInlineLimit:0}};
}
export default mapConfig();
