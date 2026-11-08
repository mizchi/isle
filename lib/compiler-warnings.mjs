import {childrenOf,references} from './template.mjs';
import {optimizeObservability} from './observability.mjs';
import {valueType} from './region-codegen.mjs';

/** Diagnostics share the optimizer's proof of removability; they never modify IR. */
export function unobservedWarnings(ir) {
  const warnings=[];
  for(const input of ir.components) {
    const resolved={...input,props:input.props.map(f=>({...f,type:valueType(f.type,ir.schemas)})),states:input.states.map(f=>({...f,type:valueType(f.type,ir.schemas)}))};
    const {component,report}=optimizeObservability(resolved),handlers=new Map();
    const warn=(code,message,hint,source)=>{if(source) warnings.push({code,severity:'warning',message,hint,...source});};
    const index=node=>{node.handlers?.forEach(h=>handlers.set(h.id,h));childrenOf(node).forEach(index);};index(input.root);
    const removed=new Set(report.removedHandlers);
    for(const id of report.removedHandlers) {
      const h=handlers.get(id);
      const partial=h.declaration&&[...handlers.values()].some(other=>other.declaration===h.declaration&&!removed.has(other.id));
      warn('W_UNOBSERVED_EVENT',`${partial?'Binding of event':'Event'} '${input.name}.${h.declaration??id}' has no observable effect and is removed.`,
        `Remove this ${partial?'binding':'event'} or connect its updates to an observed value. Synchronous cancellation and external effects are retained.`,partial?h.binding:h.source);
    }
    for(const update of report.removedUpdates) if(!removed.has(update.handler))
      warn('W_UNOBSERVED_UPDATE',`Update to '${input.name}.${update.target}' is not observed and is removed.`,
        'Remove the assignment or use its value in the UI or an observable operation.',update.source);
    for(const event of input.unboundEvents??[]) warn('W_UNOBSERVED_EVENT',`Event '${input.name}.${event.name}' is never bound.`,
      'Bind the event with an on: attribute or remove its declaration.',event.source);
    if(report.barrier) continue;
    const observed=new Set(),declarations=new Map([...component.states.map(s=>[s.name,s.initial]),...component.derives.map(d=>[d.name,d.value])]);
    const read=expression=>{for(const name of references(expression)) observed.add(name);};
    function scan(node) {
      const expressions=node.kind==='expression'?[node.value]:node.kind==='select'?node.cases.map(c=>c.test):node.kind==='each'?[node.value,node.key]:(node.attributes??node.props??[]).map(a=>a.value);
      expressions.forEach(read);
      for(const h of node.handlers??[]) for(const s of h.statements) {observed.add(s.target);read(s.value);}
      childrenOf(node).forEach(scan);
    }
    scan(component.root);
    for(const name of observed) if(declarations.has(name)) read(declarations.get(name));
    for(const [kind,fields] of [['Prop',component.props],['State',component.states],['Derive',component.derives]]) for(const field of fields)
      if(!observed.has(field.name)) warn('W_UNOBSERVED_VALUE',`${kind} '${input.name}.${field.name}' is not observed.`,
        'Remove this declaration or connect it to an observed value. Values used only during SSR are still observed.',field.source);
  }
  // One declaration may have multiple attribute bindings. Report each authored issue once.
  return [...new Map(warnings.map(w=>[[w.code,w.start,w.end,w.message].join(':'),w])).values()].sort((a,b)=>a.start-b.start||a.code.localeCompare(b.code));
}

export function diagnosticLocation(source,diagnostic) {
  const prefix=source.slice(0,diagnostic.start),line=prefix.split('\n').length;
  return {line,column:prefix.length-prefix.lastIndexOf('\n')};
}
export function formatWarning(diagnostic,source,file) {
  const {line,column}=diagnosticLocation(source,diagnostic);
  return `${file}:${line}:${column}: warning ${diagnostic.code}: ${diagnostic.message}${diagnostic.hint?`\n  ${diagnostic.hint}`:''}`;
}
