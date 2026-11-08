export const isolationSessionKey='isle.playground.isolation.v1';
import {hasLayoutDeclarations} from '../lib/layout-declarations.mjs';

/** No solver work shares the compiler Worker or the opaque application frame. */
export function createLayoutChecker({enabled,editor,status,getSession,onResult,isolationAttempted=false}) {
  let worker,latest,deadline,result,isolationPending;
  const show=(text,kind='pending')=>{status.textContent=text;status.dataset.state=kind;};
  function invalidate(message) {
    enabled.disabled=false;
    enabled.title='';
    latest=undefined;result=undefined;clearTimeout(deadline);
    if(!enabled.checked) {worker?.terminate();worker=undefined;}
    show(message ?? (enabled.checked ? 'Waiting for layout check…' : 'Layout not checked.'),'pending');
  }
  async function prepareIsolation() {
    if(isolationPending) return isolationPending;
    if(!navigator.serviceWorker) throw new Error('Z3 Wasm needs COOP/COEP headers or a playground Service Worker.');
    if(isolationAttempted) throw new Error('Cross-origin isolation could not be enabled. Serve the playground with COOP/COEP headers.');
    return isolationPending=(async()=>{
      const registration=await navigator.serviceWorker.register(new URL('isolation-sw.js',location.href),{scope:new URL('./',location.href).pathname});
      await navigator.serviceWorker.ready;
      if(navigator.serviceWorker.controller!==registration.active) await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Isolation Service Worker activation timed out')),10000);
        navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});
      });
    })();
  }
  function spawn() {
    const instance=worker=new Worker(new URL(__ISLE_LAYOUT_WORKER_PATH__,location.href));
    instance.onmessage=({data})=>{
      if(instance!==worker || data.id!==latest) return;
      if(data.progress) {show(data.progress);return;}
      clearTimeout(deadline);
      if(data.error) {show('Unknown · '+data.error,'unknown');return;}
      result=data.result;
      const v=result.verification,w=v.witness;
      const explanation=w ? ` · ${w.code} at ${w.viewportExact}px${w.viewportHeightExact ? ' × '+w.viewportHeightExact+'px' : ''}` : v.diagnostics[0]?.message ? ' · '+v.diagnostics[0].message : '';
      show(`${v.status[0].toUpperCase()+v.status.slice(1)} · Z3 ${v.solver.result.toUpperCase()} · ${result.model.obligations.length} obligations${explanation}`,v.status);
      onResult(result);
    };
    instance.onerror=()=>{if(instance===worker) {clearTimeout(deadline);worker.terminate();worker=undefined;show('Unknown · Z3 Worker failed. Compile to retry.','unknown');}};
  }
  async function check(id,compiled,{props,css}) {
    const declared=hasLayoutDeclarations(compiled.ir,compiled.preview.component);
    enabled.disabled=declared;if(declared) enabled.checked=true;
    enabled.title=declared ? 'Required by the source layout declaration' : '';
    if(!enabled.checked) return;
    latest=id;let contract;
    try {
      if(editor.value.length>16384) throw new Error('Layout contract exceeds 16 KiB.');
      contract=JSON.parse(editor.value);
      if(!contract || Array.isArray(contract) || typeof contract!=='object') throw new Error('Layout contract must be an object.');
      if(!crossOriginIsolated) {
        show('Preparing isolated Z3 environment…');await prepareIsolation();
        if(id===latest && enabled.checked) {sessionStorage.setItem(isolationSessionKey,JSON.stringify(getSession()));location.reload();}
        return;
      }
    } catch(error) {show('Unknown · '+error.message,'unknown');return;}
    if(id!==latest) return;
    if(!worker) spawn();
    const instance=worker;
    show('Loading Z3 Wasm…');
    worker.postMessage({id,ir:compiled.ir,options:{...contract,component:compiled.preview.component,props,css}});
    deadline=setTimeout(()=>{
      if(instance!==worker || id!==latest) return;
      worker.terminate();worker=undefined;show('Unknown · Z3 timed out. Compile to retry.','unknown');
    },45000);
  }
  return {invalidate,check,get result(){return result;}};
}
