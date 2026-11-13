import {abstract,arrayValue,evaluate,refine,componentEnvironment,repeatLimit} from './bounds.mjs';
import {LayoutIdentities} from './identities.mjs';
const limit=256;
const problem=(code,message)=>{throw Object.assign(new Error(message),{code});};
const nativeSignature=node=>JSON.stringify(node, (key,value)=>['source','handlers'].includes(key) ? undefined : value);
function structuralNames(component) {
  const names=new Set();
  const expression=value=>{
    if(!value || typeof value!=='object') return;
    if(value.kind==='name') names.add(value.name);
    for(const child of Object.values(value)) if(Array.isArray(child)) child.forEach(expression);else if(child && typeof child==='object') expression(child);
  };
  const visit=node=>{
    if(node.kind==='each') {expression(node.value);expression(node.key);}
    for(const arm of node.cases ?? []) {expression(arm.test);arm.children.forEach(visit);}
    for(const attr of node.attributes ?? []) if(['class','id'].includes(attr.name)) expression(attr.value);
    for(const prop of node.props ?? []) expression(prop.value);
    for(const child of [...(node.children ?? []),...(node.fallback ?? []),...(node.empty ?? [])]) visit(child);
  };
  visit(component.root);
  let size;
  do {size=names.size;for(const derive of component.derives) if(names.has(derive.name)) expression(derive.value);} while(size!==names.size);
  return names;
}
export function hasDynamicStructure(ir,component) {
  const definitions=new Map(ir.components.map(c=>[c.name,c])),seen=new Set();
  const visit=node=>{
    if (!node) return false;
    if (['select','each','boundary'].includes(node.kind)) return true;
    if (node.attributes?.some(a=>['class','id'].includes(a.name) && a.value.kind!=='string')) return true;
    if (node.kind==='island' && !seen.has(node.component)) {seen.add(node.component);return visit(definitions.get(node.component)?.root);}
    return (node.children ?? []).some(visit);
  };
  return visit(definitions.get(component)?.root);
}
export function expandStructure(ir,component,props={}) {
  const definitions=new Map(ir.components.map(c=>[c.name,c])),bounds=[];
  const identities=new LayoutIdentities(ir);
  const bounded=values=>{if(values.length>limit) problem('U_LAYOUT_LIMIT','Structural variant limit exceeded (256)');return values;};
  const merge=(a,b)=>({nodes:[...a.nodes,...b.nodes],choices:[...a.choices,...b.choices],requirements:[...(a.requirements ?? []),...(b.requirements ?? [])]});
  function list(nodes,env,owner,stack,route,keys,owners,kind='children') {
    let variants=[{nodes:[],choices:[],requirements:[]}];
    for (const [index,node] of nodes.entries()) variants=bounded(variants.flatMap(a=>visit(node,env,owner,stack,[...route,kind,index],keys,owners).map(b=>merge(a,b))));
    return variants;
  }
  function visit(node,env,owner,stack,route,keys=[],owners={}) {
    const source=node.source?.start;
    owners=identities.bind(node,route,owners);
    if (node.kind==='island') {
      if (node.children.length || stack.includes(node.component)) problem('U_LAYOUT_STRUCTURE','Opaque or recursive component boundary');
      return enter(node.component,Object.fromEntries(node.props.map(prop=>[prop.name,evaluate(prop.value,env)])),`${owner}/${node.site}`,[...stack,node.component],[...route,'island'],keys).map(variant=>{
        if(!node.layoutContracts) return variant;
        const [root,...rest]=variant.nodes;
        return {...variant,nodes:[{...root,layoutContracts:[...(root.layoutContracts ?? []),...node.layoutContracts]},...rest]};
      });
    }
    if (node.kind==='select') {
      const out=[];let remaining=env;
      for (let index=0;index<node.cases.length;index++) {
        if (!remaining) break;
        const arm=node.cases[index],yes=refine(arm.test,true,remaining);
        if (yes) out.push(...list(arm.children,yes,owner,stack,route,keys,owners,`case${index}`).map(v=>({...v,choices:[{kind:'branch',source,arm:index},...v.choices]})));
        remaining=refine(arm.test,false,remaining);
      }
      if (remaining) out.push(...list(node.fallback,remaining,owner,stack,route,keys,owners,'fallback').map(v=>({...v,choices:[{kind:'branch',source,arm:'else'},...v.choices]})));
      return bounded(out);
    }
    if (node.kind==='boundary') return bounded([node.children,node.fallback].flatMap((nodes,arm)=>list(nodes,env,owner,stack,route,keys,owners,arm ? 'fallback' : 'children').map(v=>({...v,choices:[{kind:'boundary',source,arm},...v.choices]}))));
    if (node.kind==='each') {
      const array=evaluate(node.value,env);
      if (!array.array || !Number.isFinite(array.max) || array.max>repeatLimit) problem('U_LAYOUT_CARDINALITY',`Cannot prove a finite repeat bound (maximum ${repeatLimit}) at ${owner}:${source}`);
      const keyed=identities.needsKeys(node);
      if(keyed && !array.sequences) problem('U_LAYOUT_IDENTITY',`Cannot prove finite ordered items and keys at ${owner}:${source}`);
      if(array.sequences) {
        return bounded(array.sequences.flatMap(items=>{
          const rowKeys=keyed ? identities.rowKeys(node,items,env,owner) : items.map((_,index)=>({encoded:index}));
          let variants=[{nodes:[],choices:[{kind:'repeat',source,count:items.length}],requirements:[]}];
          if(!items.length) return list(node.empty,env,owner,stack,route,keys,owners,'empty').map(v=>({...v,choices:[{kind:'repeat',source,count:0},...v.choices]}));
          for(const [index,item] of items.entries()) {
            const key=rowKeys[index],rowRoute=[...route,keyed ? 'row' : 'position',key.encoded],rowScope=keyed ? [...keys,{site:identities.instance(route),value:key.value}] : keys;
            const required=node.children.flatMap((child,i)=>identities.requirements(child,[...rowRoute,'children',i],rowScope,owners));
            const rowEnv={...env,[node.item]:item,...(node.index ? {[node.index]:abstract(index)} : {})};
            variants=bounded(variants.flatMap(a=>list(node.children,rowEnv,owner,stack,rowRoute,rowScope,owners).map(b=>merge(a,{...b,requirements:[...required,...(b.requirements ?? [])]}))));
          }
          return variants;
        }));
      }
      const out=[];
      for (let count=array.min;count<=array.max;count++) {
        let variants=[{nodes:[],choices:[{kind:'repeat',source,count}]}];
        if (!count) variants=list(node.empty,env,owner,stack,route,keys,owners,'empty').map(v=>({...v,choices:[{kind:'repeat',source,count},...v.choices]}));
        for (let index=0;index<count;index++) variants=bounded(variants.flatMap(a=>list(node.children,{...env,[node.item]:array.item,...(node.index ? {[node.index]:abstract(index)} : {})},owner,stack,[...route,'position',index],keys,owners).map(b=>merge(a,b))));
        out.push(...variants);bounded(out);
      }
      return out;
    }
    if (node.kind!=='element') return [{nodes:[node],choices:[]}];
    let attributes=[{attributes:[],choices:[]}];
    for (const attr of node.attributes) {
      const value=['class','id'].includes(attr.name) ? evaluate(attr.value,env) : null;
      if (value && (!value.values?.length || value.values.some(v=>typeof v!=='string'))) problem('U_LAYOUT_STRUCTURE',`Cannot prove finite ${attr.name} values at ${owner}:${source}`);
      const values=value ? value.values.map(value=>({kind:'string',value})) : [attr.value];
      attributes=bounded(attributes.flatMap(a=>values.map(value=>({attributes:[...a.attributes,{...attr,value}],choices:[...a.choices,...(values.length>1 ? [{kind:'attribute',source,name:attr.name,value:value.value}] : [])]}))));
    }
    return bounded(attributes.flatMap(a=>list(node.children,env,owner,stack,route,keys,owners).map(v=>({nodes:[{...node,attributes:a.attributes,children:v.nodes,
      ...(node.layoutContracts?.length ? {layoutIdentity:identities.instance(route)} : {}),
      ...(node.layoutTargets?.length ? {layoutTargets:node.layoutTargets.map(id=>identities.target(id,route))} : {})}],choices:[...a.choices,...v.choices],requirements:v.requirements}))));
  }
  function enter(name,props,owner,stack,route,keys=[]) {
    const c=definitions.get(name);if(!c) problem('U_LAYOUT_STRUCTURE',`Missing component ${name}`);
    const env=componentEnvironment(c,props);
    for (const field of c.states) if(env[field.name]?.array) bounds.push({component:name,owner,state:field.name,length:{min:env[field.name].min,max:Number.isFinite(env[field.name].max) ? env[field.name].max : null}});
    const relevant=structuralNames(c);
    let seeds=[{env,choices:[]}];
    for(const field of c.states) if(relevant.has(field.name) && env[field.name]?.values?.length>1) seeds=bounded(seeds.flatMap(seed=>env[field.name].values.map(value=>({env:{...seed.env,[field.name]:abstract(value)},choices:[...seed.choices,{kind:'state',owner,name:field.name,value}]}))));
    for(const field of c.states) if(relevant.has(field.name) && env[field.name]?.sequences?.length>1) seeds=bounded(seeds.flatMap(seed=>env[field.name].sequences.map((items,alternative)=>({env:{...seed.env,[field.name]:arrayValue(items)},choices:[...seed.choices,{kind:'state',owner,name:field.name,alternative}]}))));
    const required=identities.requirements(c.root,route,keys);
    return bounded(seeds.flatMap(seed=>{
      const scoped={...seed.env};for(const derive of c.derives) scoped[derive.name]=evaluate(derive.value,scoped);
      return visit(c.root,scoped,owner,stack,route,keys).map(v=>({...v,choices:[...seed.choices,...v.choices],requirements:[...required,...(v.requirements ?? [])]}));
    }));
  }
  const expanded=enter(component,Object.fromEntries(Object.entries(props).map(([key,value])=>[key,abstract(value)])),component,[component],[component]);
  const unique=new Map();
  for (const variant of expanded) {
    if (variant.nodes.length!==1) problem('U_LAYOUT_STRUCTURE','Component needs one native root in every structural state');
    const root=variant.nodes[0],key=nativeSignature([root,variant.requirements]);
    if (!unique.has(key)) unique.set(key,{root,choices:variant.choices,requirements:variant.requirements});
  }
  return {variants:[...unique.values()].map((variant,id)=>({...variant,id})),bounds};
}
