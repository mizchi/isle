import {loadIslands} from './loader.mjs';
import {resume} from './client.mjs';
export {regionContext,escape,rangeHTML,keyed,write} from './regions.mjs';
export {arrayIndex,parseJSON} from './value.mjs';

/** Generated imports are at line starts; application string literals remain untouched. */
export function rewritePreviewImports(source,resolve) {
  return source.replace(/^(import\s+[^\n;]+?\s+from\s*|export\s*\{[^\n}]*\}\s*from\s*)(["'])([^"'\n]+)\2;/gm,(_match,prefix,_quote,id)=>prefix+JSON.stringify(resolve(id))+';');
}

export async function startPreview(root,artifact,notify) {
  if(artifact.version!==1) throw new Error('Unsupported preview artifact version');
  const urls=new Map(),active=new Set(),sources=new Map(artifact.modules.map(module=>[module.id,module.code]));
  const blob=source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  const builtin=blob('export const {regionContext,escape,rangeHTML,keyed,write,arrayIndex,parseJSON}=globalThis.__islePreviewRuntime;');
  urls.set('isle:runtime',builtin);
  const disposeURLs=()=>{for(const url of urls.values()) URL.revokeObjectURL(url);};
  function link(id) {
    if(['./isle-region-runtime.mjs','./isle-value-runtime.mjs'].includes(id)) return builtin;
    if(urls.has(id)) return urls.get(id);
    if(active.has(id) || !sources.has(id)) throw new Error(`Unknown or cyclic preview import: ${id}`);
    active.add(id);
    const code=rewritePreviewImports(sources.get(id),link),url=blob(code);
    active.delete(id);urls.set(id,url);return url;
  }
  try {
    const prepared=Object.fromEntries(await Promise.all(Object.entries(artifact.entries).map(async([id,entry])=>{
      const module=await import(/* @vite-ignore */ link(entry.module));
      if(typeof module[entry.symbol]!=='function') throw new Error(`Invalid preview entry: ${id}`);
      return [id,module[entry.symbol]];
    })));
    // Ready functions avoid changing the production resolver's protocol restrictions.
    const refs=Object.fromEntries(Object.entries(artifact.entries).map(([id,entry])=>[id,[`https://isle-preview.invalid/${encodeURIComponent(id)}.js`,entry.symbol,entry.captures]]));
    const registry=[artifact.schemas,artifact.events,refs,[],'https://isle-preview.invalid/',prepared];
    const controller=loadIslands(root,async()=>({resume,registry}),artifact.events,{onError:error=>notify({type:'error',message:error.message})});
    const events=new AbortController();
    for(const type of artifact.events) root.addEventListener(type,()=>{
      queueMicrotask(()=>controller.settled().then(()=>notify({type:'metrics',metrics:{...controller.metrics}})));
    },{signal:events.signal});
    root.addEventListener('click',event=>{if(event.target.closest?.('a[href]')) {event.preventDefault();notify({type:'notice',message:'Navigation stays inside the playground.'});}},{signal:events.signal});
    root.addEventListener('submit',event=>event.preventDefault(),{signal:events.signal});
    notify({type:'ready',metrics:{...controller.metrics}});
    return ()=>{events.abort();controller.close();disposeURLs();};
  } catch(error) {disposeURLs();throw error;}
}
