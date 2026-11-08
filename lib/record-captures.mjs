import {expressionChildren} from './template.mjs';

/** Static property paths, with aliases resolved in their declaration scope. */
export function recordPath(expr,derives,locals=new Map(),active=new Set()) {
  if(expr.kind==='property') {const base=recordPath(expr.object,derives,locals,active);return base?[...base,expr.key]:undefined;}
  if(expr.kind!=='name'||locals.has(expr.name)) return;
  if(!derives.has(expr.name)) return [expr.name];
  if(active.has(expr.name)) return;
  return recordPath(derives.get(expr.name),derives,new Map(),new Set([...active,expr.name]));
}

/** Primitive readonly prop projections need no client object decoder. Whole values
 * and identities remain unchanged when the object escapes as a value. */
export function planRecordCaptures(props,derives,uses,fields) {
  const records=new Map(props.filter(field=>field.type?.record).map(field=>[field.name,field.type]));
  const whole=new Set(),paths=new Map();
  function visit(expr,locals,active=new Set()) {
    const path=recordPath(expr,derives,locals);
    if(path?.length>1&&records.has(path[0])) {
      let type=records.get(path[0]);
      for(const key of path.slice(1)) type=type?.record?.[key];
      if(['number','string','boolean'].includes(type)) {
        if(!paths.has(path[0])) paths.set(path[0],new Map());
        paths.get(path[0]).set(path.join('.'),{name:path.join('.'),source:path[0],path:path.slice(1),type});
      } else whole.add(path[0]);
      return;
    }
    if(expr.kind==='name'&&!locals.has(expr.name)) {
      if(records.has(expr.name)) whole.add(expr.name);
      if(derives.has(expr.name)&&!active.has(expr.name)) visit(derives.get(expr.name),new Map(),new Set([...active,expr.name]));
      return;
    }
    if(expr.kind==='collection') {
      visit(expr.object,locals,active);const inner=new Map(locals);inner.set(expr.parameter,true);visit(expr.body,inner,active);return;
    }
    expressionChildren(expr).forEach(child=>visit(child,locals,active));
  }
  uses.forEach(use=>visit(use.expression,use.locals??new Map()));
  const projections=[],result=[];
  for(const field of fields) {
    if(!whole.has(field.name)&&paths.has(field.name)) {
      for(const projection of paths.get(field.name).values()) {projections.push(projection);result.push({name:projection.name,type:projection.type});}
    } else result.push(field);
  }
  return {fields:result,projections};
}
