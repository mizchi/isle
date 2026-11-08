import {childrenOf} from './template.mjs';
import {createDependencies} from './resume-plan.mjs';
import {binaryValue} from './static.mjs';

/** Erase only unobserved writes whose evaluation and checked assignment are total.
 * Unknown helpers, remote calls and potentially invalid numbers remain observable. */
export function optimizeObservability(input) {
  const component=structuredClone(input),report={removedHandlers:[],removedStatements:0,removedUpdates:[],barrier:component.optimizationBarrier??null};
  const ownsChildren=node=>node.kind==='island'||childrenOf(node).some(ownsChildren);
  if(!report.barrier&&(component.children||ownsChildren(component.root))) report.barrier=component.children?'render-fragment':'child-owner';
  if(report.barrier||component.side!=='client') return {component,report};
  const states=new Map(component.states.map(state=>[state.name,state]));
  const fields=new Map([...component.props,...component.states].map(field=>[field.name,field.type??'number']));
  const derives=new Map(component.derives.map(derive=>[derive.name,derive.value])),deps=createDependencies(derives);
  const handlers=[],live=new Set();
  const retain=names=>{for(const name of names) if(states.has(name)) live.add(name);};
  function scan(node) {
    const expressions=node.kind==='expression'?[node.value]:node.kind==='select'?node.cases.map(arm=>arm.test):node.kind==='each'?[node.value,node.key]:(node.attributes??node.props??[]).map(attr=>attr.value);
    expressions.forEach(expr=>retain(deps(expr)));
    handlers.push(...(node.handlers??[]));childrenOf(node).forEach(scan);
  }
  scan(component.root);
  const written=new Set(handlers.flatMap(handler=>handler.statements.map(statement=>statement.target)));
  const literal=value=>({total:typeof value!=='number'||Number.isFinite(value)&&!Object.is(value,-0),type:typeof value,constant:value});
  const unknown={total:false};
  function describe(expr,seen=new Set()) {
    if(['number','string','boolean'].includes(expr.kind)) return literal(expr.value);
    if(expr.kind==='name') {
      if(seen.has(expr.name)) return unknown;
      const next=new Set([...seen,expr.name]);
      if(derives.has(expr.name)) return describe(derives.get(expr.name),next);
      if(states.has(expr.name)&&!written.has(expr.name)) {
        const result=describe(states.get(expr.name).initial,next);
        if(result.total&&Object.hasOwn(result,'constant')) return result;
      }
      return fields.has(expr.name)?{total:true,type:fields.get(expr.name)}:unknown;
    }
    if(expr.kind==='not') {const value=describe(expr.value,seen);return value.total?{total:true,type:'boolean',...(Object.hasOwn(value,'constant')?{constant:!value.constant}:{})}:unknown;}
    if(expr.kind==='property') {
      const object=describe(expr.object,seen),type=object.type?.record?.[expr.key]??(expr.key==='length'&&(object.type?.array||object.type==='string')?'number':undefined);
      return object.total&&type?{total:true,type}:unknown;
    }
    if(expr.kind==='binary') {
      const left=describe(expr.left,seen),right=describe(expr.right,seen);
      if(!left.total||!right.total) return unknown;
      if(Object.hasOwn(left,'constant')&&Object.hasOwn(right,'constant')) return literal(binaryValue(expr.op,left.constant,right.constant));
      if(['===','!==','<','>','<=','>='].includes(expr.op)&&['number','string','boolean'].includes(left.type)&&left.type===right.type) return {total:true,type:'boolean'};
      if(['&&','||'].includes(expr.op)&&left.type==='boolean'&&right.type==='boolean') return {total:true,type:'boolean'};
      if(left.type==='number'&&right.type==='number'&&right.constant===0&&['+','-'].includes(expr.op)) return {total:true,type:'number'};
      if(left.type==='number'&&right.constant===1&&['*','/'].includes(expr.op)) return {total:true,type:'number'};
    }
    if(expr.kind==='conditional') {
      const test=describe(expr.test,seen),yes=describe(expr.yes,seen),no=describe(expr.no,seen);
      if(test.total&&yes.total&&no.total&&yes.type===no.type) return {total:true,type:yes.type};
    }
    return unknown;
  }
  function safeInitial(name,active=new Set()) {
    if(!states.has(name)) return true;
    if(active.has(name)) return false;
    const initial=states.get(name).initial,result=describe(initial);
    return result.total&&JSON.stringify(result.type)===JSON.stringify(fields.get(name))&&[...deps(initial)].every(dependency=>safeInitial(dependency,new Set([...active,name])));
  }
  function removable(statement) {
    if(!safeInitial(statement.target)||![...deps(statement.value)].every(name=>safeInitial(name))) return false;
    const value=describe(statement.value),type=fields.get(statement.target);
    if(statement.op==='=') return value.total&&JSON.stringify(value.type)===JSON.stringify(type);
    // Adding/subtracting a unit to any finite binary64 value cannot overflow:
    // large values round back to themselves; cancellation produces +0.
    return type==='number'&&value.total&&value.type==='number'&&Math.abs(value.constant)<=1&&['+=','-='].includes(statement.op);
  }
  const kept=new Set();
  for(;;) {
    const before=live.size;
    for(const name of live) retain(deps(states.get(name).initial));
    for(const handler of handlers) for(const statement of handler.statements)
      if(live.has(statement.target)||!removable(statement)) {kept.add(statement);live.add(statement.target);retain(deps(statement.value));}
    if(live.size===before) break;
  }
  function erase(node) {
    if(node.handlers) node.handlers=node.handlers.filter(handler=>{
      const statements=handler.statements.filter(statement=>kept.has(statement));
      for(const statement of handler.statements) if(!kept.has(statement)) report.removedUpdates.push({handler:handler.id,target:statement.target,source:statement.source??handler.source});
      report.removedStatements+=handler.statements.length-statements.length;handler.statements=statements;
      if(statements.length||handler.form||handler.preventDefault) return true;
      report.removedHandlers.push(handler.id);return false;
    });
    childrenOf(node).forEach(erase);
  }
  erase(component.root);
  return {component,report};
}
