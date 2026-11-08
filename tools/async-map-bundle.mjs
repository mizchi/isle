import {build} from 'vite';
import {mapConfig} from '../examples/async-map/vite.config.mjs';
export async function buildMap(mode='resume',mounts){
  const config=mapConfig({mode,...(mounts?{mounts}:{})});
  return (await build({...config,configFile:false,logLevel:'silent',build:{...config.build,write:false}})).output;
}
