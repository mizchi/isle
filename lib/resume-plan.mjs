import {references} from './template.mjs';

/** Resolve the closed expression language before assigning storage or code chunks. */
export function createDependencies(derives) {
  function dependencies(expr,locals=new Map(),seen=new Set()) {
    const result=new Set();
    for(const name of references(expr)) {
      if(locals.has(name)) result.add('$local');
      else if(!derives.has(name)) result.add(name);
      else {
        if(seen.has(name)) throw new Error(`Cyclic derive: ${name}`);
        // Derives are declared in the component scope, outside row/lambda binders.
        for(const leaf of dependencies(derives.get(name),new Map(),new Set([...seen,name]))) result.add(leaf);
      }
    }
    return result;
  }
  return dependencies;
}

/** Compile-only storage/initialization IR shared by flat and structured templates. */
export function planValuePhases(component,{dependencies,renderReads,resumeReads,states=component.states}) {
  const stateByName=new Map(states.map(state=>[state.name,state]));
  const close=roots=>{
    const needed=new Set(roots);
    for(const name of needed) if(stateByName.has(name))
      for(const dependency of dependencies(stateByName.get(name).initial)) needed.add(dependency);
    return needed;
  };
  const htmlNeeded=close(renderReads),serverNeeded=close(new Set([...renderReads,...resumeReads]));
  const declared=[...component.props,...states];
  return {
    fields:declared.filter(field=>resumeReads.has(field.name)).map(field=>({name:field.name,type:field.type??'number'})),
    states:states.filter(state=>serverNeeded.has(state.name)),
    htmlStates:states.filter(state=>htmlNeeded.has(state.name)),
    values:declared.map(field=>({name:field.name,owner:component.name,
      phase:resumeReads.has(field.name)?'resume':serverNeeded.has(field.name)?'server':'unused'})),
  };
}
