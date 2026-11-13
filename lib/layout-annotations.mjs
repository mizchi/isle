import {childrenOf} from './template.mjs';

export const requirementTransport='data-compiler-requirement';

/** Control folding may erase DOM, but must never erase a required source site
 * and leave a vacuous proof. This pass checks the optimizer's output only;
 * it does not inhibit any runtime optimization. */
export function checkRequirementPreservation(before,after) {
  const sites=new Map(before.flatMap(c=>(c.layout?.noshift ?? []).filter(t=>t.nodeId).map(t=>[t.nodeId,t.source])));
  if(!sites.size) return [];
  const count=root=>{
    const counts=new Map();
    const visit=node=>{for(const id of node.layoutTargets ?? []) counts.set(id,(counts.get(id) ?? 0)+1);childrenOf(node).forEach(visit);};
    visit(root);return counts;
  };
  const definitions=new Map(after.map(c=>[c.name,c]));
  return before.flatMap(component=>{
    const previous=count(component.root),next=count(definitions.get(component.name).root);
    return [...previous].filter(([id,total])=>(next.get(id) ?? 0)<total).map(([id])=>({code:'E_LAYOUT_UNREACHABLE',
      message:'The @noshift element was eliminated as unreachable',...sites.get(id),
      hint:'Remove the requirement or attach it to a potentially live native element.'}));
  });
}

/** A private frontend transport, erased before composition or code generation. */
export class ElementRequirements {
  constructor(parser,name,layout) {this.parser=parser;this.name=name;this.layout=layout;this.targets=new Map();}
  fail(attribute,message,code='E_LAYOUT_ANNOTATION') {
    const start=attribute.nameStart ?? attribute.start;
    this.parser.error(code,message,start,start+attribute.name.length,'Use @noshift on a native element inside a component with a layout declaration.');
  }
  consume(node) {
    const reserved=node.attributes.find(attribute=>attribute.name===requirementTransport);
    if(reserved) this.fail(reserved,'Reserved compiler requirement transport attribute','E_LAYOUT_INTERNAL');
    const attributes=node.attributes.filter(attribute=>attribute.name.startsWith('@'));
    if(!attributes.length) return null;
    const attribute=attributes[0];
    if(attributes.length!==1 || attribute.name!=='@noshift' || attribute.value) this.fail(attribute,'Use exactly one static @noshift flag; values and computed requirements are not supported');
    if(!/^[a-z]/.test(node.tag) || node.tag==='style') this.fail(attribute,'@noshift requires a native element, not a component or control intrinsic');
    if(!this.layout.value) this.fail(attribute,'@noshift requires layout SafeGrid or PositionedGrid in its owning component','E_LAYOUT_ENVIRONMENT');
    if(this.targets.size+(this.layout.value.noshift?.length ?? 0)>=32) this.fail(attribute,'At most 32 noshift requirements per component','E_LAYOUT_LIMIT');
    const id=`${this.name}.noshift.${this.targets.size}`,start=attribute.nameStart;
    this.targets.set(id,{nodeId:id,source:{start,end:start+attribute.name.length}});
    return {attribute,id};
  }
  attach(ir) {
    if(!this.targets.size) return;
    const component=ir.components.find(component=>component.name===this.name);
    const attached=new Set();
    const visit=node=>{
      if(node.kind==='element') {
        const marker=node.attributes.find(attribute=>attribute.name===requirementTransport);
        if(marker) {
          if(marker.value.kind!=='string' || !this.targets.has(marker.value.value)) throw new Error('Invalid compiler requirement transport');
          node.attributes=node.attributes.filter(attribute=>attribute!==marker);
          node.layoutTargets=[marker.value.value];
          attached.add(marker.value.value);
        }
      }
      childrenOf(node).forEach(visit);
    };
    visit(component.root);
    for(const [id,target] of this.targets) if(!attached.has(id)) this.parser.error('E_LAYOUT_UNREACHABLE','The @noshift element was eliminated as unreachable',target.source.start,target.source.end,'Remove the requirement or attach it to a potentially live native element.');
    component.layout.noshift=[...(component.layout.noshift ?? []),...this.targets.values()];
  }
}
