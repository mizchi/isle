import {mountPreview,previewRuntimeURL} from '@isle/prototype/preview';
import {presets,defaultCSS,defaultLayout} from './presets.mjs';
import {createLayoutChecker,isolationSessionKey} from './layout-checker.mjs';
import {mountEditor} from './editor.mjs';

const ids=['preset','component','mode','auto','compile','reset','source','props','css','layout','verify-layout','layout-status','status','diagnostics','preview','metrics','output-kind','output','size','download'];
const ui=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
const editors=Object.entries({source:'isle',props:'json',css:'css',layout:'json'}).map(([id,language])=>mountEditor(ui[id],language));
let worker,busy=false,sequence=0,timer,deadline,artifact,result,token,runtimeSource;
let restored;
try {restored=JSON.parse(sessionStorage.getItem(isolationSessionKey));sessionStorage.removeItem(isolationSessionKey);} catch {}
const layoutChecker=createLayoutChecker({enabled:ui['verify-layout'],editor:ui.layout,status:ui['layout-status'],
  isolationAttempted:Boolean(restored),
  getSession:()=>({preset:ui.preset.value,source:ui.source.value,props:ui.props.value,css:ui.css.value,layout:ui.layout.value,mode:ui.mode.value,component:ui.component.value,verify:ui['verify-layout'].checked,auto:ui.auto.checked,output:ui['output-kind'].value}),
  onResult:value=>{if(result) {result.layout=value;inspect();}},
});
const bytes=value=>new TextEncoder().encode(value).length;
const status=(text,error=false)=>{ui.status.textContent=text;ui.status.toggleAttribute('data-error',error);};
function spawn() {
  const instance=worker=new Worker(new URL('./compiler.worker.mjs',import.meta.url),{type:'module'});
  instance.onmessage=event=>{if(instance!==worker) return;busy=false;clearTimeout(deadline);receive(event);};
  instance.onerror=()=>{if(instance!==worker) return;clearTimeout(deadline);status('Compiler Worker failed. Try Compile to restart.',true);instance.terminate();worker=undefined;busy=false;};
}
function inspect() {
  const kind=ui['output-kind'].value;
  if(['layout','smt','styles'].includes(kind)) {
    ui.output.textContent=kind==='styles' ? artifact?.styles?.map(style=>style.css).join('\n') || '// No scoped styles.' : kind==='smt' ? layoutChecker.result?.model.smt2+'\n(check-sat)\n' : JSON.stringify(layoutChecker.result?.verification ?? {status:'not checked'},null,2);
    if(ui.output.textContent.startsWith('undefined')) ui.output.textContent='Enable layout verification to generate constraints.';
    return;
  }
  ui.output.textContent=!result ? '' : kind==='ir' ? JSON.stringify(result.ir,null,2) : kind==='analysis' ? JSON.stringify(result.explanation,null,2) : kind==='modules' ? artifact.modules.map(module=>`// ${module.id}\n${module.code}`).join('\n\n') || '// No client modules.' : artifact.html+artifact.snapshotHtml;
}
function invalidate() {
  clearTimeout(timer);sequence++;token=undefined;
  layoutChecker.invalidate();
  // Discard the old executable document as soon as its source changes.
  ui.preview.srcdoc='';artifact=result=undefined;ui.download.disabled=true;ui.output.textContent='';ui.size.textContent='Waiting for compilation.';ui.metrics.textContent='0 restored islands';
}
function diagnostics(items) {
  ui.diagnostics.replaceChildren();ui.diagnostics.hidden=!items.length;
  for(const item of items) {
    const offset=Math.max(0,Math.min(ui.source.value.length,item.start ?? 0));
    const prefix=ui.source.value.slice(0,offset),line=prefix.split('\n').length,col=prefix.length-prefix.lastIndexOf('\n');
    const button=document.createElement('button'),li=document.createElement('li');
    button.type='button';button.textContent=`${item.code} · ${line}:${col} · ${item.message}${item.hint ? ' — '+item.hint : ''}`;
    button.onclick=()=>{ui.source.focus();ui.source.setSelectionRange(offset,Math.max(offset+1,item.end ?? offset+1));};li.append(button);ui.diagnostics.append(li);
  }
}
async function receive({data}) {
  if(data.id!==sequence) return;
  if(data.error) {status('Compiler error: '+data.error,true);return;}
  const compiled=data.result;
  if(compiled.ir) {
    const selected=ui.component.value;
    ui.component.replaceChildren(...compiled.ir.components.map(({name})=>new Option(name,name)));
    if(selected && !compiled.ir.components.some(({name})=>name===selected)) {
      ui.component.value=compiled.ir.components.at(-1)?.name ?? '';compile();return;
    }
    ui.component.value=compiled.ok ? compiled.preview.component : selected;
  }
  if(!compiled.ok) {layoutChecker.invalidate('Layout not checked: compilation failed.');diagnostics(compiled.diagnostics);status(compiled.stage==='compile' ? 'Compile error' : 'Preview error',true);return;}
  diagnostics([]);result=compiled;artifact=compiled.preview;inspect();
  ui.size.textContent=`${bytes(artifact.html+artifact.snapshotHtml).toLocaleString()} HTML bytes · ${artifact.modules.length} logical modules · ${artifact.modules.reduce((n,m)=>n+bytes(m.code),0).toLocaleString()} module source bytes${artifact.styles?.length ? ' · '+artifact.styles.reduce((n,s)=>n+bytes(s.css),0).toLocaleString()+' scoped CSS bytes' : ''}`;
  ui.download.disabled=false;status('Preparing preview…');
  layoutChecker.check(data.id,compiled,{props:JSON.parse(ui.props.value),css:ui.css.value});
  try {
    if(artifact.events.length && !runtimeSource) {
      const response=await fetch(previewRuntimeURL);if(!response.ok) throw new Error('Preview runtime could not be loaded');runtimeSource=await response.text();
    }
    if(data.id!==sequence) return;
    const current=artifact;
    ui.preview.onload=()=>{if(current===artifact && !current.events.length) status('Ready · SSR, no client runtime');};
    token=mountPreview(ui.preview,current,{css:ui.css.value,runtimeSource});
  } catch(error) {if(data.id===sequence) status('Preview error: '+error.message,true);}
}
function compile() {
  editors.forEach(editor=>editor.refresh());
  invalidate();diagnostics([]);
  let props;
  try {props=JSON.parse(ui.props.value);if(!props || Array.isArray(props) || typeof props!=='object') throw new Error('Props must be a JSON object.');}
  catch(error) {status('Props error: '+error.message,true);return;}
  if(ui.css.value.length>131072) {status('CSS exceeds the 128 Ki limit.',true);return;}
  status('Compiling…');
  if(busy) {worker.terminate();worker=undefined;clearTimeout(deadline);}
  if(!worker) spawn();busy=true;
  worker.postMessage({id:sequence,source:ui.source.value,options:{component:ui.component.value || restored?.component || undefined,mode:ui.mode.value,props}});
  restored=undefined;
  const instance=worker,id=sequence;
  deadline=setTimeout(()=>{
    if(instance!==worker) return;
    instance.terminate();worker=undefined;busy=false;
    if(id===sequence) {sequence++;status('Compilation timed out. Reduce the source and try Compile.',true);}
  },5000);
}
function schedule() {invalidate();status(ui.auto.checked ? 'Waiting for edits…' : 'Changed · press Compile');if(ui.auto.checked) timer=setTimeout(compile,250);}
function reset() {const preset=presets[ui.preset.value];ui.source.value=preset.source;ui.props.value=JSON.stringify(preset.props,null,2);ui.css.value=preset.css ?? defaultCSS;ui.layout.value=JSON.stringify(preset.layout ?? defaultLayout,null,2);ui['verify-layout'].checked=Boolean(preset.layout);ui.component.replaceChildren();compile();}
for(const [id,preset] of Object.entries(presets)) ui.preset.add(new Option(preset.label,id));
for(const id of ['source','props','css','layout']) ui[id].addEventListener('input',schedule);
for(const id of ['component','mode']) ui[id].addEventListener('change',compile);
ui['verify-layout'].addEventListener('change',compile);
ui.auto.addEventListener('change',()=>{if(ui.auto.checked) compile();else {clearTimeout(timer);}});
ui.compile.onclick=compile;ui.reset.onclick=reset;ui.preset.onchange=reset;ui['output-kind'].onchange=inspect;
document.addEventListener('keydown',event=>{if(event.key==='Enter' && (event.metaKey || event.ctrlKey)) {event.preventDefault();compile();}});
window.addEventListener('message',event=>{
  const data=event.data;
  if(event.source!==ui.preview.contentWindow || !token || data?.channel!=='isle-preview' || data.token!==token) return;
  if(data.type==='ready') status('Ready · resume on interaction');
  if(data.type==='error' && typeof data.message==='string') status('Runtime error: '+data.message.slice(0,1000),true);
  if(data.type==='notice' && typeof data.message==='string') status(data.message.slice(0,1000));
  if(['ready','metrics'].includes(data.type) && Number.isSafeInteger(data.metrics?.restores)) ui.metrics.textContent=`${data.metrics.restores} restored islands`;
});
ui.download.onclick=()=>{if(!result) return;const url=URL.createObjectURL(new Blob([JSON.stringify({source:ui.source.value,props:JSON.parse(ui.props.value),css:ui.css.value,layoutContract:ui.layout.value,layoutProof:layoutChecker.result,preview:artifact},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='isle-preview.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
if(restored) {
  for(const id of ['preset','source','props','css','layout','mode']) if(typeof restored[id]==='string') ui[id].value=restored[id];
  ui['verify-layout'].checked=Boolean(restored.verify);
  if(typeof restored?.auto==='boolean') ui.auto.checked=restored.auto;
  if(typeof restored?.output==='string') ui['output-kind'].value=restored.output;
  compile();
} else reset();
