import {childrenOf,expressionChildren} from './template.mjs';
import {escapeHtml} from './html.mjs';

/** Keep CSS for every reachable arm/owner, deduplicated after pure expansion. */
export function collectStyles(ir,component) {
  if(!ir.components.some(c=>c.style)) return [];
  const scopes=new Set(),visited=new Set(),definitions=new Map(ir.components.map(c=>[c.name,c]));
  const strings=expr=>{if(expr.kind==='string') for(const token of expr.value.split(/\s+/)) scopes.add(token);expressionChildren(expr).forEach(strings);};
  const walk=node=>{
    for(const attr of node.attributes ?? []) if(attr.name==='class') strings(attr.value);
    if(node.kind==='island') visit(node.component);
    childrenOf(node).forEach(walk);
  };
  const visit=name=>{if(!visited.has(name) && definitions.has(name)) {visited.add(name);walk(definitions.get(name).root);}};
  visit(component);
  return ir.components.flatMap(c=>c.style && scopes.has(c.style.scope) ? [{...c.style,component:c.name}] : []);
}

export function foldStyleClasses(ir) {
  const fold=value=>{
    if(value.kind!=='binary' || value.op!=='+') return value;
    const left=fold(value.left),right=fold(value.right);
    return left.kind==='string' && right.kind==='string' ? {kind:'string',value:left.value+right.value} : {...value,left,right};
  };
  const walk=node=>{for(const attr of node.attributes ?? []) if(attr.name==='class') attr.value=fold(attr.value);childrenOf(node).forEach(walk);};
  ir.components.forEach(c=>walk(c.root));
}

export function styleTags(styles=[]) {
  return styles.map(style=>`<style data-isle-style="${escapeHtml(style.scope)}">${style.css.replace(/<\/style/gi,'<\\/style')}</style>`).join('');
}
