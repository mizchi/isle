import {init} from 'z3-solver/build/browser.js';
import {analyzeLayout} from '../lib/layout.mjs';
import {createLayoutModel,verifyLayoutModel} from '../lib/layout-z3.mjs';

let initialized,pending,running=false;
const api=()=>initialized ??= (async()=>{
  if(!self.crossOriginIsolated || typeof SharedArrayBuffer==='undefined') throw new Error('Z3 Wasm requires cross-origin isolation.');
  const script=new URL('z3-built.js',self.location.href).href;
  importScripts(script);
  return init({locateFile:file=>new URL(file,script).href,mainScriptUrlOrBlob:script});
})().catch(error=>{initialized=undefined;throw error;});
self.onmessage=({data})=>{pending=data;drain();};
async function drain() {
  if(running) return;running=true;
  try {while(pending) {
    const {id,ir,options}=pending;pending=undefined;
    try {
      self.postMessage({id,progress:'Loading Z3 Wasm…'});
      const solver=await api();
      const report=analyzeLayout(ir,options),model=createLayoutModel(report);
      self.postMessage({id,progress:`Checking ${model.obligations.length} layout obligations…`});
      const verification=await verifyLayoutModel(model,solver);
      self.postMessage({id,result:{report,model,verification}});
    } catch(error) {self.postMessage({id,error:String(error.message)});}
  }} finally {running=false;}
}
