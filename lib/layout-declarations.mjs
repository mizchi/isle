/** Reachable authored declarations only; inactive compiler-eliminated arms vanish. */
export function hasLayoutDeclarations(ir,component) {
  const definitions=new Map(ir.components.map(c=>[c.name,c])),seen=new Set();
  const visit=node=>{
    if(!node) return false;
    if(node.layoutContracts?.length) return true;
    if(node.kind==='island' && !seen.has(node.component)) {seen.add(node.component);if(visit(definitions.get(node.component)?.root)) return true;}
    return [...(node.children ?? []),...(node.empty ?? []),...(node.fallback ?? []),...(node.cases ?? []).flatMap(arm=>arm.children)].some(visit);
  };
  return visit(definitions.get(component)?.root);
}

/** An explicit deployment viewport stays independent from the component contract. */
export function declaredLayoutOptions(ir,options) {
  if(options.viewport!==undefined) return options;
  const selected=ir.components.find(c=>c.name===(options.component ?? ir.components[0]?.name));
  const declaration=selected?.layout ?? selected?.root.layoutContracts?.[0];
  if(!declaration) throw new Error('E_LAYOUT_ENVIRONMENT: Provide a viewport or a root layout declaration');
  const {inlineSize,blockSize}=declaration.contract.requires;
  return {...options,viewport:{min:inlineSize.min,max:inlineSize.max,height:{min:blockSize.min,max:blockSize.max}}};
}
