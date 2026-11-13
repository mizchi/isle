import {rowKey} from '../../runtime/value.mjs';
import {references} from '../template.mjs';
import {evaluate} from './bounds.mjs';

const children=node=>[...(node.children ?? []),...(node.empty ?? []),...(node.fallback ?? []),...(node.cases ?? []).flatMap(arm=>arm.children)];

/** Build-only identity inventory. Static routes distinguish call/repeat sites;
 * typed runtime keys replace row positions. Interning compares full routes,
 * avoiding hash collisions and unbounded transport IDs in the generic core. */
export class LayoutIdentities {
  constructor(ir) {
    this.tokens=new Map();
    this.owners=new Map(ir.components.flatMap(c=>(c.layout?.noshift ?? []).filter(t=>t.nodeId).map(t=>[t.nodeId,c.name])));
    this.declarations=new Set(ir.components.filter(c=>c.layout?.noshift?.length).map(c=>c.name));
  }
  needsKeys(node) {return Boolean(node.layoutTargets?.length || node.layoutContracts?.some(d=>this.declarations.has(d.contract.component))) || children(node).some(child=>this.needsKeys(child));}
  token(kind,route) {
    const identity=JSON.stringify([kind,route]);
    if(!this.tokens.has(identity)) this.tokens.set(identity,`layout.${this.tokens.size}`);
    return this.tokens.get(identity);
  }
  target(id,route) {return this.token('target',[id,route]);}
  instance(route) {return this.token('instance',route);}
  bind(node,route,owners) {
    return {...owners,...Object.fromEntries((node.layoutContracts ?? []).map(d=>[d.contract.component,this.instance(route)]))};
  }
  /** Register absent branches too, but defer nested For lifetimes until its rows exist. */
  requirements(node,route,keys=[],owners={}) {
    if(node.kind==='each') return node.empty.flatMap((child,index)=>this.requirements(child,[...route,'empty',index],keys,owners));
    if(node.kind==='island') return [];
    owners=this.bind(node,route,owners);
    const out=(node.layoutTargets ?? []).map(nodeId=>({owner:owners[this.owners.get(nodeId)],nodeId,id:this.target(nodeId,route),keys}));
    const list=(nodes,kind)=>nodes.flatMap((child,index)=>this.requirements(child,[...route,kind,index],keys,owners));
    out.push(...list(node.children ?? [],'children'),...list(node.fallback ?? [],'fallback'));
    for(const [index,arm] of (node.cases ?? []).entries()) out.push(...list(arm.children,`case${index}`));
    return out;
  }
  rowKeys(node,items,env,owner) {
    const fail=message=>{throw Object.assign(new Error(`${message} at ${owner}:${node.source?.start}`),{code:'U_LAYOUT_IDENTITY'});};
    if(node.index && references(node.key).has(node.index)) fail('Positional keys cannot establish noshift row identity');
    const seen=new Set();
    return items.map((item,index)=>{
      const value=evaluate(node.key,{...env,[node.item]:item,...(node.index ? {[node.index]:{values:[index]}} : {})});
      if(value.values?.length!==1) fail('Cannot prove one exact row key');
      let encoded;
      try {encoded=rowKey(value.values[0]);} catch {fail('Row keys must be strings or safe integers, excluding -0');}
      if(seen.has(encoded)) fail('Duplicate row key');
      seen.add(encoded);return {encoded,value:value.values[0]};
    });
  }
}
