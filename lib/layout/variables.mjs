import {tokenize,tokenTypes as T} from 'css-tree/tokenizer';

const namePattern=/^--[A-Za-z_][\w-]*$/;
const defaults=new Set(['initial','inherit','unset','revert','revert-layer']);
const fail=(message,code='U_LAYOUT_VARIABLE')=>{throw Object.assign(new Error(message),{code});};
const limit=message=>fail(message,'U_LAYOUT_LIMIT');
export const customName=name=>namePattern.test(name);

/** Parse token boundaries, including fallback edges; never replace raw substrings. */
export function variableValue(source) {
  if(source.length>65536) limit('CSS variable value exceeds 65536 UTF-16 units');
  const nodes=[],stack=[],references=new Set(),fallbackReferences=new Set();let current=nodes,count=0;
  tokenize(source,(type,start,end)=>{
    if(++count>4096) limit('CSS variable value exceeds 4096 tokens');
    if(type===T.WhiteSpace || type===T.Comment) return;
    if(type===T.BadString || type===T.BadUrl) fail('Malformed CSS variable value');
    const raw=source.slice(start,end);
    const close=type===T.Function || type===T.LeftParenthesis ? T.RightParenthesis : type===T.LeftSquareBracket ? T.RightSquareBracket : type===T.LeftCurlyBracket ? T.RightCurlyBracket : undefined;
    if(close) {
      if(stack.length>=32) limit('CSS variable function nesting exceeds 32');
      const node={raw,type,children:[],close:close===T.RightParenthesis ? ')' : close===T.RightSquareBracket ? ']' : '}'};
      current.push(node);stack.push({parent:current,node,close});current=node.children;
    } else if([T.RightParenthesis,T.RightSquareBracket,T.RightCurlyBracket].includes(type)) {
      const frame=stack.pop();if(!frame || frame.close!==type) fail('Unbalanced CSS variable value');
      const node=frame.node;current=frame.parent;
      if(node.type===T.Function && node.raw.slice(0,-1).toLowerCase()==='var') {
        const comma=node.children.findIndex(child=>child.type===T.Comma),args=comma<0 ? node.children : node.children.slice(0,comma);
        if(args.length!==1 || args[0].type!==T.Ident || !customName(args[0].raw)) fail('var() requires an unescaped ASCII custom-property name');
        node.variable=args[0].raw;
        if(comma>=0) node.fallback=node.children.slice(comma+1);
      }
    } else current.push({type,raw});
  });
  if(stack.length) fail('Unbalanced CSS variable value');
  const collect=(nodes,fallback=false)=>{for(const node of nodes) {
    if(node.variable) {references.add(node.variable);if(fallback) fallbackReferences.add(node.variable);if(node.fallback) collect(node.fallback,true);}
    else if(node.children) collect(node.children,fallback);
  }};
  collect(nodes);
  return {nodes,references:[...references],fallbackReferences:[...fallbackReferences]};
}

const wide=nodes=>nodes.length===1 && nodes[0].type===T.Ident && defaults.has(nodes[0].raw.toLowerCase()) ? nodes[0].raw.toLowerCase() : undefined;
const invalid=(message,code='U_LAYOUT_VARIABLE')=>({status:'invalid',message,code});
const missing=name=>invalid(`Custom property ${name} has the guaranteed-invalid value`);
function resolutionBudget(globalSpend=()=>{}) {
  let work=0;
  return (n=1)=>{work+=n;if(work>131072) limit('CSS variable resolution work limit exceeded');globalSpend(n);};
}
function evaluate(nodes,lookup,spend) {
  const tokens=[];let bytes=0;
  const append=values=>{
    spend(values.length);bytes+=values.reduce((n,value)=>n+value.length+1,0);
    if(tokens.length+values.length>4096 || bytes>65536) limit('CSS variable expansion exceeds 4096 tokens or 65536 UTF-16 units');
    tokens.push(...values);
  };
  for(const node of nodes) {
    spend();
    if(node.variable) {
      let value=lookup(node.variable);
      if(value.status==='invalid' && node.fallback!==undefined) value=evaluate(node.fallback,lookup,spend);
      if(value.status!=='resolved') return value;
      append(value.tokens);
    } else if(node.children) {
      const children=evaluate(node.children,lookup,spend);if(children.status!=='resolved') return children;
      append([node.raw,...children.tokens,node.close]);
    } else append([node.raw]);
  }
  return {status:'resolved',tokens};
}

/** The dependency graph is local to one element and includes dormant fallbacks. */
function cycles(declarations,spend) {
  let next=0;const stack=[],indices=new Map(),low=new Map(),active=new Set(),result=new Map();
  function visit(name) {
    spend();indices.set(name,next);low.set(name,next++);stack.push(name);active.add(name);
    for(const target of declarations.get(name).expression.references) {
      spend();
      if(!declarations.has(target)) continue;
      if(!indices.has(target)) {visit(target);low.set(name,Math.min(low.get(name),low.get(target)));}
      else if(active.has(target)) low.set(name,Math.min(low.get(name),indices.get(target)));
    }
    if(low.get(name)!==indices.get(name)) return;
    const members=[];let member;
    do {member=stack.pop();active.delete(member);members.push(member);} while(member!==name);
    if(members.length>1 || declarations.get(name).expression.references.includes(name)) {
      const conditional=members.some(member=>declarations.get(member).expression.fallbackReferences.some(target=>members.includes(target)));
      for(const member of members) result.set(member,{members:members.toSorted(),conditional});
    }
  }
  for(const name of declarations.keys()) if(!indices.has(name)) visit(name);
  return result;
}

const closed={closed:true,lookup:missing};
const external={closed:false,lookup:name=>({status:'unknown',code:'U_LAYOUT_VARIABLE',message:`Cannot resolve inherited ${name}; provide the real ancestor chain starting at html`})};

/** Parent closures are immutable: inherited aliases cannot rebind to child vars. */
export function variableEnvironment(declarations,parent,documentRoot,globalSpend=()=>{}) {
  parent=documentRoot ? closed : parent ?? external;
  if(!declarations.size) return parent;
  if(declarations.size>256) limit('An element has more than 256 custom-property bindings');
  const spend=resolutionBudget(globalSpend);
  const cyclic=cycles(declarations,spend),cache=new Map();
  function lookup(name) {
    spend();
    if(cache.has(name)) return cache.get(name);
    if(!declarations.has(name)) return parent.lookup(name);
    const declaration=declarations.get(name),keyword=wide(declaration.expression.nodes);
    let result;
    if(keyword==='revert-layer') result={status:'unknown',code:'U_LAYOUT_VARIABLE',message:'Custom-property revert-layer is outside the checked subset'};
    else if(keyword==='initial') result=missing(name);
    else if(keyword) result=parent.lookup(name);
    else if(cyclic.has(name)) {
      const {members,conditional}=cyclic.get(name);
      result={status:conditional ? 'unknown' : 'invalid',code:'U_LAYOUT_VARIABLE_CYCLE',message:`CSS variable cycle${conditional ? ' through fallback is outside the portable subset' : ''}: ${members.join(', ')}`};
    }
    else {
      result=evaluate(declaration.expression.nodes,lookup,spend);
      if(result.status==='resolved' && result.tokens.length===1 && defaults.has(result.tokens[0].toLowerCase())) {
        const value=result.tokens[0].toLowerCase();
        result=value==='initial' ? missing(name) : value==='revert-layer' ? {status:'unknown',code:'U_LAYOUT_VARIABLE',message:'Custom-property revert-layer is outside the checked subset'} : parent.lookup(name);
      }
    }
    cache.set(name,result);return result;
  }
  return {closed:parent.closed,lookup};
}

export function substituteVariables(expression,environment,spend) {
  const value=evaluate(expression.nodes,environment.lookup,resolutionBudget(spend));
  if(value.status!=='resolved') fail(value.message,value.code);
  // Whitespace preserves CSS tokens: Number(40) + Ident(px) is never Dimension(40px).
  return value.tokens.join(' ').trim();
}
