import {compile,explain} from './compiler-core.mjs';
import {prepareProgram} from './codegen.mjs';
export {compile,checkDependencies,requireIR,explain} from './compiler-core.mjs';

/** Compile locally to a serializable preview artifact; never execute event handlers. */
export function compilePreview(source,options={}) {
  if(!options || Object.keys(options).some(key=>!['component','props','mode'].includes(key)) || !['resume','ssr'].includes(options.mode ?? 'resume')) throw new TypeError('Invalid browser preview options');
  let warnings=[];
  const failure=(stage,code,message,hint,ir)=>({ok:false,stage,diagnostics:[{code,message,hint,start:0,end:0},...warnings],...(ir ? {ir}: {})});
  if(typeof source!=='string' || source.length>131072) return failure('compile','E_PREVIEW_LIMIT','Source must be a string of at most 128 Ki UTF-16 units','Reduce the source size.');
  const result=compile(source);
  if(!result.ok) return {...result,stage:'compile'};
  warnings=result.diagnostics;
  const ir=result.ir;
  try {
    if(ir.actions.length) return failure('render','E_PREVIEW_HOST','Server actions require a server host','Use the compiler API to inspect server code, or preview a component without server actions.',ir);
    const component=options.component ?? ir.components.at(-1)?.name,mode=options.mode ?? 'resume';
    const program=prepareProgram(ir),rendered=program.render(component,options.props ?? {},{scopeId:'preview',mode});
    const modules=[],entries={},schemas={},events=new Set();
    if(mode==='resume') for(const name of program.reachable(component)) {
      const generated=program.get(name).generate();
      if(!generated.handlers.length) continue;
      schemas[generated.schemaId]=generated.fields.map(field=>field.type);
      generated.events.forEach(event=>events.add(event));
      if(generated.regions) modules.push({id:generated.regions.id,code:generated.regions.code});
      for(const handler of generated.handlers) {
        const id=`isle:handler/${handler.id}`;
        modules.push({id,code:handler.code});entries[handler.id]={module:id,symbol:handler.symbol,captures:handler.captures};
      }
    }
    if(rendered.html.length+rendered.snapshotHtml.length>1_000_000 || modules.reduce((n,m)=>n+m.code.length,0)>2_000_000) throw new Error('Preview output limit exceeded');
    return {ok:true,ir,diagnostics:warnings,explanation:explain(ir),preview:{version:1,component,mode,html:rendered.html,snapshotHtml:rendered.snapshotHtml,...(rendered.styles ? {styles:rendered.styles} : {}),modules,entries,schemas,events:[...events]}};
  } catch(error) {return failure('render','E_PREVIEW_RENDER',error.message,'Check the selected component and its props.',ir);}
}
