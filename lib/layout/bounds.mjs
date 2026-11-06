// Finite abstract values. Unknown is deliberately absorbing at joins.
const unknown = Object.freeze({});
export const repeatLimit = 32;
const finite = values => ({values:[...new Set(values)].slice(0,33)});
export function join(a=unknown,b=unknown) {
  if (a.array && b.array) return {array:true,min:Math.min(a.min,b.min),max:Math.max(a.max,b.max),item:a.max===0 ? b.item : b.max===0 ? a.item : join(a.item,b.item)};
  if (a.values && b.values) { const values=[...new Set([...a.values,...b.values])];return values.length<=32 ? {values} : unknown; }
  if (a.record && b.record) return {record:Object.fromEntries(Object.keys(a.record).map(key=>[key,join(a.record[key],b.record[key])]))};
  return unknown;
}
export function abstract(value) {
  if (Array.isArray(value)) return {array:true,min:value.length,max:value.length,item:value.map(abstract).reduce((a,b)=>a ? join(a,b):b,null) ?? unknown};
  if (value && typeof value==='object') return {record:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,abstract(v)]))};
  return finite([value]);
}
export function refine(test,truth,env) {
  if (test.kind==='not') return refine(test.value,!truth,env);
  if (test.kind==='name' && env[test.name]?.values) {
    const values=env[test.name].values.filter(value=>Boolean(value)===truth);
    return values.length ? {...env,[test.name]:{values}} : null;
  }
  if (test.kind==='boolean') return test.value===truth ? env : null;
  if (test.kind!=='binary') return env;
  if (test.op==='&&' && truth || test.op==='||' && !truth) {
    const left=refine(test.left,truth,env);return left && refine(test.right,truth,left);
  }
  const left=test.left,right=evaluate(test.right,env),name=left.kind==='property' && left.key==='length' && left.object.kind==='name' ? left.object.name : null;
  if (!name || !env[name]?.array || right.values?.length!==1 || typeof right.values[0]!=='number') return env;
  const n=right.values[0],value={...env[name]};
  const op=truth ? test.op : ({'<':'>=','<=':'>','>':'<=','>=':'<','===':'!==','!==':'==='})[test.op];
  if (op==='<') value.max=Math.min(value.max,Math.ceil(n)-1);
  if (op==='<=') value.max=Math.min(value.max,Math.floor(n));
  if (op==='>') value.min=Math.max(value.min,Math.floor(n)+1);
  if (op==='>=') value.min=Math.max(value.min,Math.ceil(n));
  if (op==='===') { if (!Number.isInteger(n)) return null;value.min=Math.max(value.min,n);value.max=Math.min(value.max,n); }
  if (op==='!==' && value.min===n && value.max===n) return null;
  return value.min>value.max ? null : {...env,[name]:value};
}
export function evaluate(expr,env) {
  if (!expr) return unknown;
  if (['number','string','boolean'].includes(expr.kind)) return finite([expr.value]);
  if (expr.kind==='name') return env[expr.name] ?? unknown;
  if (expr.kind==='not') {const value=evaluate(expr.value,env);return value.values ? finite(value.values.map(v=>!v)) : unknown;}
  if (expr.kind==='record') return {record:Object.fromEntries(expr.fields.map(field=>[field.name,evaluate(field.value,env)]))};
  if (expr.kind==='property') {
    const object=evaluate(expr.object,env);
    return expr.key==='length' && object.array ? object.min===object.max ? finite([object.min]) : unknown : object.record?.[expr.key] ?? unknown;
  }
  if (expr.kind==='array') return {array:true,min:expr.values.length,max:expr.values.length,item:expr.values.map(value=>evaluate(value,env)).reduce((a,b)=>a ? join(a,b):b,null) ?? unknown};
  if (expr.kind==='conditional') {
    const yes=refine(expr.test,true,env),no=refine(expr.test,false,env);
    return !yes ? evaluate(expr.no,no ?? env) : !no ? evaluate(expr.yes,yes) : join(evaluate(expr.yes,yes),evaluate(expr.no,no));
  }
  if (expr.kind==='collection') {
    const array=evaluate(expr.object,env);
    if (!array.array) return unknown;
    return expr.method==='filter' ? {...array,min:0} : expr.method==='map' ? {...array,item:evaluate(expr.body,{...env,[expr.parameter]:array.item})} : unknown;
  }
  if (expr.kind==='method' && expr.method==='concat') {
    const object=evaluate(expr.object,env),args=expr.args.map(arg=>evaluate(arg,env));
    if (object.array) {
      let result={...object};
      for (const arg of args) {
        if (!arg.array && !arg.values && !arg.record) return unknown;
        result={array:true,min:result.min+(arg.array ? arg.min : 1),max:result.max+(arg.array ? arg.max : 1),item:result.max===0 ? arg.array ? arg.item : arg : arg.array && arg.max===0 ? result.item : join(result.item,arg.array ? arg.item : arg)};
      }
      if (result.max>repeatLimit) result.max=Infinity;
      return result;
    }
  }
  return unknown;
}
function* handlers(node) {
  if (!node) return;
  yield* node.handlers ?? [];
  for (const child of [...(node.children ?? []),...(node.fallback ?? []),...(node.empty ?? []),...(node.cases ?? []).flatMap(arm=>arm.children)]) yield* handlers(child);
}
export function componentEnvironment(component,props={}) {
  const typed=(field,value=unknown)=>{
    if(typeof field.type==='string' && field.type.endsWith('[]') && !value.array) return {array:true,min:0,max:Infinity,item:unknown};
    if(field.type==='boolean' && !value.values) return finite([false,true]);
    return value;
  };
  const initial=Object.fromEntries(component.props.map(field=>[field.name,Object.hasOwn(props,field.name) ? props[field.name] : typed(field)]));
  for (const state of component.states) initial[state.name]=typed(state,evaluate(state.initial,initial));
  let state={...initial};
  const derive=env=>{const next={...env};for (const d of component.derives) next[d.name]=evaluate(d.value,next);return next;};
  for (let pass=0;pass<66;pass++) {
    const next={...state};
    for (const handler of handlers(component.root)) {
      let local=derive(state);
      for (const statement of handler.statements) {
        const value=statement.op==='=' ? evaluate(statement.value,local) : unknown;
        const field=component.states.find(field=>field.name===statement.target);
        local[statement.target]=field ? typed(field,value) : value;
        local=derive(local);
        // Await/reentrancy may expose intermediate writes; preserve them too.
        for (const field of component.states) next[field.name]=join(next[field.name],local[field.name]);
      }
      for (const field of component.states) next[field.name]=join(next[field.name],local[field.name]);
    }
    if (JSON.stringify(next)===JSON.stringify(state)) return derive(next);
    state=next;
  }
  return derive(Object.fromEntries(Object.keys(state).map(name=>[name,component.states.some(field=>field.name===name) ? unknown : state[name]])));
}
